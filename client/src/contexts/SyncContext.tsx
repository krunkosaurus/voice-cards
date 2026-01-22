// contexts/SyncContext.tsx - Sync state management and orchestration
// Design: Manages P2P sync lifecycle between editor and viewer

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import type { Card, Project } from '@/types';
import type {
  ConnectionState,
  SyncProgress,
  SyncControlMessage,
  CardMetadata,
} from '@/types/sync';
import { useProject } from '@/contexts/ProjectContext';
import { WebRTCConnectionService } from '@/services/webrtc/connection';
import { AudioTransferService } from '@/services/sync/AudioTransferService';
import {
  gatherProjectForSync,
  commitReceivedProject,
  getAudioForCard,
} from '@/services/sync/projectSync';
import {
  createSyncRequest,
  createSyncAccept,
  createSyncReject,
  createChunkStart,
  createChunkComplete,
  createSyncComplete,
  createSyncError,
  isSyncControlMessage,
  calculateTotalChunks,
} from '@/services/webrtc/syncProtocol';

// =============================================================================
// Types
// =============================================================================

/**
 * User role in sync - determines behavior.
 * - editor: Has the source project, sends data
 * - viewer: Receives data, read-only copy
 */
export type UserRole = 'editor' | 'viewer';

/**
 * Pending sync request from editor (viewer sees this).
 */
interface PendingSyncRequest {
  project: Project;
  cards: CardMetadata[];
  totalAudioBytes: number;
}

/**
 * Sync state tracked by SyncContext.
 */
interface SyncState {
  isSyncing: boolean;
  role: UserRole | null;
  progress: SyncProgress;
  pendingRequest: PendingSyncRequest | null;
  // Receiver accumulates data here before commit
  receivedProject: Project | null;
  receivedCards: Card[];
  receivedAudio: Map<string, Blob>;
}

/**
 * SyncContext value exposed to consumers.
 */
interface SyncContextValue {
  // State
  syncState: SyncState;
  connectionState: ConnectionState;

  // Setup
  setConnection: (conn: WebRTCConnectionService | null) => void;
  setUserRole: (role: UserRole) => void;

  // Editor actions
  startSync: () => Promise<void>;

  // Viewer actions
  acceptSync: () => void;
  rejectSync: (reason: string) => void;
  commitSync: () => Promise<void>;
}

// =============================================================================
// Initial State
// =============================================================================

const initialProgress: SyncProgress = {
  phase: 'idle',
  currentCardIndex: 0,
  totalCards: 0,
  currentCardBytesTransferred: 0,
  currentCardBytesTotal: 0,
  totalBytesTransferred: 0,
  totalBytesTotal: 0,
};

const initialSyncState: SyncState = {
  isSyncing: false,
  role: null,
  progress: initialProgress,
  pendingRequest: null,
  receivedProject: null,
  receivedCards: [],
  receivedAudio: new Map(),
};

// =============================================================================
// Context
// =============================================================================

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

// =============================================================================
// Provider
// =============================================================================

export function SyncProvider({ children }: { children: React.ReactNode }) {
  // Get dispatch from ProjectContext for reloading state after sync
  const { dispatch } = useProject();

  // Sync state
  const [syncState, setSyncState] = useState<SyncState>(initialSyncState);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected');

  // Refs for connection and services (stable across renders)
  const connectionRef = useRef<WebRTCConnectionService | null>(null);
  const audioTransferRef = useRef<AudioTransferService | null>(null);
  const userRoleRef = useRef<UserRole | null>(null);
  const hasInitialSyncedRef = useRef<boolean>(false);

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /**
   * Set the WebRTC connection and wire up callbacks.
   */
  const setConnection = useCallback(
    (conn: WebRTCConnectionService | null) => {
      connectionRef.current = conn;

      if (conn) {
        // Create audio transfer service
        audioTransferRef.current = new AudioTransferService(conn);

        // Wire up callbacks for future state changes
        conn.setCallbacks({
          onStateChange: (state) => {
            setConnectionState(state);
          },
          onControlMessage: (msg) => {
            if (isSyncControlMessage(msg)) {
              handleSyncMessage(msg as SyncControlMessage);
            }
          },
          onBinaryMessage: (data) => {
            handleBinaryMessage(data);
          },
        });

        // CRITICAL: Set current state immediately since connection may already be connected
        // The callback above only fires on FUTURE state changes
        const currentState = conn.getState();
        console.log('[Sync] setConnection called, current state:', currentState);
        setConnectionState(currentState);
      } else {
        audioTransferRef.current = null;
        setConnectionState('disconnected');
        // Reset initial sync flag when disconnected
        hasInitialSyncedRef.current = false;
      }
    },
    []
  );

  /**
   * Set the user's role (editor or viewer).
   */
  const setUserRole = useCallback((role: UserRole) => {
    userRoleRef.current = role;
    setSyncState((prev) => ({ ...prev, role }));
  }, []);

  // ==========================================================================
  // Message Handlers
  // ==========================================================================

  /**
   * Handle incoming sync control messages.
   */
  const handleSyncMessage = useCallback((msg: SyncControlMessage) => {
    console.log('[Sync] Received message:', msg.type);

    switch (msg.type) {
      case 'sync_request':
        handleSyncRequest(msg);
        break;
      case 'sync_accept':
        handleSyncAccept();
        break;
      case 'sync_reject':
        handleSyncReject(msg.reason);
        break;
      case 'chunk_start':
        handleChunkStart(msg);
        break;
      case 'chunk_complete':
        handleChunkComplete(msg);
        break;
      case 'sync_complete':
        handleSyncComplete(msg);
        break;
      case 'sync_error':
        handleSyncError(msg.error);
        break;
    }
  }, []);

  /**
   * Handle incoming binary data (audio chunks).
   */
  const handleBinaryMessage = useCallback((data: ArrayBuffer) => {
    if (!audioTransferRef.current) return;

    const result = audioTransferRef.current.receiveChunk(data, (progress) => {
      // Update progress for current card
      setSyncState((prev) => ({
        ...prev,
        progress: {
          ...prev.progress,
          currentCardBytesTransferred: progress.bytesReceived,
          currentCardBytesTotal: progress.bytesTotal,
          totalBytesTransferred:
            prev.progress.totalBytesTransferred +
            (progress.bytesReceived - prev.progress.currentCardBytesTransferred),
        },
      }));
    });

    if (result?.complete && result.blob) {
      // Store received audio blob
      setSyncState((prev) => {
        const newAudioMap = new Map(prev.receivedAudio);
        newAudioMap.set(result.cardId, result.blob!);
        return { ...prev, receivedAudio: newAudioMap };
      });
    }
  }, []);

  // ==========================================================================
  // Sync Request Handling (Viewer receives from Editor)
  // ==========================================================================

  /**
   * Handle sync_request from editor.
   * Store pending request for viewer to accept/reject.
   */
  const handleSyncRequest = useCallback(
    (msg: SyncControlMessage & { type: 'sync_request' }) => {
      setSyncState((prev) => ({
        ...prev,
        pendingRequest: {
          project: {
            createdAt: msg.project.createdAt,
            updatedAt: msg.project.updatedAt,
          },
          cards: msg.cards,
          totalAudioBytes: msg.totalAudioBytes,
        },
        progress: {
          ...initialProgress,
          phase: 'requesting',
          totalCards: msg.cards.length,
          totalBytesTotal: msg.totalAudioBytes,
        },
      }));
    },
    []
  );

  /**
   * Handle sync_accept from viewer (editor receives).
   * Begin transferring audio data.
   */
  const handleSyncAccept = useCallback(() => {
    console.log('[Sync] Viewer accepted, starting transfer');
    performTransfer();
  }, []);

  /**
   * Handle sync_reject from viewer (editor receives).
   */
  const handleSyncReject = useCallback((reason: string) => {
    console.log('[Sync] Viewer rejected:', reason);
    setSyncState((prev) => ({
      ...prev,
      isSyncing: false,
      progress: {
        ...initialProgress,
        phase: 'error',
        error: `Sync rejected: ${reason}`,
      },
    }));
  }, []);

  // ==========================================================================
  // Chunk Handling (Viewer receives from Editor)
  // ==========================================================================

  /**
   * Handle chunk_start - prepare to receive audio for a card.
   */
  const handleChunkStart = useCallback(
    (msg: SyncControlMessage & { type: 'chunk_start' }) => {
      if (!audioTransferRef.current) return;

      audioTransferRef.current.startReceiving(
        msg.cardIndex,
        msg.cardId,
        msg.totalChunks,
        msg.audioSize
      );

      setSyncState((prev) => ({
        ...prev,
        progress: {
          ...prev.progress,
          phase: 'transferring',
          currentCardIndex: msg.cardIndex,
          currentCardBytesTransferred: 0,
          currentCardBytesTotal: msg.audioSize,
        },
      }));
    },
    []
  );

  /**
   * Handle chunk_complete - all chunks for a card received.
   */
  const handleChunkComplete = useCallback(
    (msg: SyncControlMessage & { type: 'chunk_complete' }) => {
      console.log(`[Sync] Card ${msg.cardIndex} complete`);
    },
    []
  );

  /**
   * Handle sync_complete - all cards transferred.
   */
  const handleSyncComplete = useCallback(
    (msg: SyncControlMessage & { type: 'sync_complete' }) => {
      console.log(
        `[Sync] Transfer complete: ${msg.totalCards} cards, ${msg.totalBytes} bytes`
      );
      setSyncState((prev) => ({
        ...prev,
        isSyncing: false,
        progress: {
          ...prev.progress,
          phase: 'complete',
        },
      }));
    },
    []
  );

  /**
   * Handle sync_error - error during sync.
   */
  const handleSyncError = useCallback((error: string) => {
    console.error('[Sync] Error:', error);
    setSyncState((prev) => ({
      ...prev,
      isSyncing: false,
      progress: {
        ...initialProgress,
        phase: 'error',
        error,
      },
    }));
  }, []);

  // ==========================================================================
  // Editor Actions
  // ==========================================================================

  /**
   * Start sync as editor - gather project and send sync_request.
   */
  const startSync = useCallback(async () => {
    if (!connectionRef.current?.isReady()) {
      console.warn('[Sync] Connection not ready');
      return;
    }

    console.log('[Sync] Starting sync as editor');

    setSyncState((prev) => ({
      ...prev,
      isSyncing: true,
      progress: {
        ...initialProgress,
        phase: 'requesting',
      },
    }));

    try {
      // Gather project data
      const { project, cards, audioSizes } = await gatherProjectForSync();

      // Store cards for transfer
      setSyncState((prev) => ({
        ...prev,
        progress: {
          ...prev.progress,
          phase: 'awaiting_accept',
          totalCards: cards.length,
          totalBytesTotal: Array.from(audioSizes.values()).reduce(
            (sum, size) => sum + size,
            0
          ),
        },
      }));

      // Send sync_request
      const request = createSyncRequest(project, cards, audioSizes);
      connectionRef.current.sendControl(request);
    } catch (error) {
      console.error('[Sync] Failed to start sync:', error);
      setSyncState((prev) => ({
        ...prev,
        isSyncing: false,
        progress: {
          ...initialProgress,
          phase: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }));
    }
  }, []);

  /**
   * Perform the actual transfer after viewer accepts.
   * Sends audio chunks for each card.
   */
  const performTransfer = useCallback(async () => {
    if (!connectionRef.current?.isReady() || !audioTransferRef.current) {
      console.warn('[Sync] Connection not ready for transfer');
      return;
    }

    try {
      const { project, cards, audioSizes } = await gatherProjectForSync();

      setSyncState((prev) => ({
        ...prev,
        progress: {
          ...prev.progress,
          phase: 'transferring',
        },
      }));

      let totalBytesTransferred = 0;

      // Transfer each card's audio
      for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
        const card = cards[cardIndex];
        const audioBlob = await getAudioForCard(card.id);
        const audioSize = audioSizes.get(card.id) ?? 0;
        const totalChunks = calculateTotalChunks(audioSize);

        // Update progress
        setSyncState((prev) => ({
          ...prev,
          progress: {
            ...prev.progress,
            currentCardIndex: cardIndex,
            currentCardBytesTransferred: 0,
            currentCardBytesTotal: audioSize,
          },
        }));

        // Send chunk_start
        connectionRef.current!.sendControl(
          createChunkStart(card.id, cardIndex, totalChunks, audioSize)
        );

        // Send audio chunks
        if (audioBlob) {
          await audioTransferRef.current!.sendAudio(
            card.id,
            cardIndex,
            audioBlob,
            (progress) => {
              setSyncState((prev) => ({
                ...prev,
                progress: {
                  ...prev.progress,
                  currentCardBytesTransferred: progress.bytesSent,
                  totalBytesTransferred: totalBytesTransferred + progress.bytesSent,
                },
              }));
            }
          );
          totalBytesTransferred += audioSize;
        }

        // Send chunk_complete
        connectionRef.current!.sendControl(
          createChunkComplete(card.id, cardIndex)
        );
      }

      // Send sync_complete
      const totalBytes = Array.from(audioSizes.values()).reduce(
        (sum, size) => sum + size,
        0
      );
      connectionRef.current!.sendControl(
        createSyncComplete(cards.length, totalBytes)
      );

      setSyncState((prev) => ({
        ...prev,
        isSyncing: false,
        progress: {
          ...prev.progress,
          phase: 'complete',
        },
      }));
    } catch (error) {
      console.error('[Sync] Transfer failed:', error);
      connectionRef.current?.sendControl(
        createSyncError(
          error instanceof Error ? error.message : 'Transfer failed'
        )
      );
      setSyncState((prev) => ({
        ...prev,
        isSyncing: false,
        progress: {
          ...initialProgress,
          phase: 'error',
          error: error instanceof Error ? error.message : 'Transfer failed',
        },
      }));
    }
  }, []);

  // ==========================================================================
  // Viewer Actions
  // ==========================================================================

  /**
   * Accept sync request - send sync_accept to editor.
   */
  const acceptSync = useCallback(() => {
    if (!connectionRef.current?.isReady() || !syncState.pendingRequest) {
      return;
    }

    console.log('[Sync] Accepting sync request');

    // Convert CardMetadata to Card (without audio) and store for later commit
    const cards: Card[] = syncState.pendingRequest.cards.map((meta) => ({
      id: meta.id,
      label: meta.label,
      notes: meta.notes,
      tags: meta.tags,
      color: meta.color,
      duration: meta.duration,
      waveformData: meta.waveformData,
      transcript: meta.transcript,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      order: meta.order,
    }));

    setSyncState((prev) => ({
      ...prev,
      isSyncing: true,
      receivedProject: prev.pendingRequest?.project ?? null,
      receivedCards: cards,
      receivedAudio: new Map(),
      pendingRequest: null,
      progress: {
        ...prev.progress,
        phase: 'transferring',
      },
    }));

    // Send accept
    connectionRef.current.sendControl(createSyncAccept());
  }, [syncState.pendingRequest]);

  /**
   * Reject sync request - send sync_reject to editor.
   */
  const rejectSync = useCallback(
    (reason: string) => {
      if (!connectionRef.current?.isReady()) {
        return;
      }

      console.log('[Sync] Rejecting sync request:', reason);

      setSyncState((prev) => ({
        ...prev,
        pendingRequest: null,
        progress: initialProgress,
      }));

      connectionRef.current.sendControl(createSyncReject(reason));
    },
    []
  );

  /**
   * Commit received sync data to IndexedDB and reload ProjectContext.
   * Called after sync_complete received.
   */
  const commitSync = useCallback(async () => {
    const { receivedProject, receivedCards, receivedAudio } = syncState;

    if (!receivedProject) {
      console.warn('[Sync] No received project to commit');
      return;
    }

    console.log('[Sync] Committing received project');

    try {
      // Commit to IndexedDB
      await commitReceivedProject({
        project: receivedProject,
        cards: receivedCards,
        audioMap: receivedAudio,
      });

      // CRITICAL: Reload ProjectContext state via dispatch
      dispatch({
        type: 'INIT_STATE',
        payload: {
          cards: receivedCards,
          project: receivedProject,
        },
      });

      // Reset sync state
      setSyncState((prev) => ({
        ...prev,
        receivedProject: null,
        receivedCards: [],
        receivedAudio: new Map(),
        progress: initialProgress,
      }));

      console.log('[Sync] Project committed successfully');
    } catch (error) {
      console.error('[Sync] Failed to commit project:', error);
      setSyncState((prev) => ({
        ...prev,
        progress: {
          ...prev.progress,
          phase: 'error',
          error: error instanceof Error ? error.message : 'Commit failed',
        },
      }));
    }
  }, [syncState, dispatch]);

  // ==========================================================================
  // Auto-sync on connection (XFER-01)
  // ==========================================================================

  useEffect(() => {
    // When connection becomes 'connected' and user is editor, auto-start sync ONCE
    if (
      connectionState === 'connected' &&
      userRoleRef.current === 'editor' &&
      !syncState.isSyncing &&
      !hasInitialSyncedRef.current
    ) {
      // Mark as synced to prevent repeated auto-syncs
      hasInitialSyncedRef.current = true;

      // Small delay to ensure both sides are ready
      const timer = setTimeout(() => {
        console.log('[Sync] Auto-starting sync (XFER-01)');
        startSync();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [connectionState, syncState.isSyncing, startSync]);

  // ==========================================================================
  // Context Value
  // ==========================================================================

  const value: SyncContextValue = {
    syncState,
    connectionState,
    setConnection,
    setUserRole,
    startSync,
    acceptSync,
    rejectSync,
    commitSync,
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

// =============================================================================
// Hook
// =============================================================================

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within SyncProvider');
  }
  return context;
}
