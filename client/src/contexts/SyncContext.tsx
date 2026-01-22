// contexts/SyncContext.tsx - Sync state management and orchestration
// Design: Manages P2P sync lifecycle between editor and viewer

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import type { Card, Project, TranscriptSegment } from '@/types';
import type {
  ConnectionState,
  SyncProgress,
  SyncControlMessage,
  SyncOperation,
  CardMetadata,
} from '@/types/sync';
import { useProject } from '@/contexts/ProjectContext';
import { WebRTCConnectionService } from '@/services/webrtc/connection';
import { AudioTransferService } from '@/services/sync/AudioTransferService';
import {
  gatherProjectForSync,
  commitReceivedProject,
  getAudioForCard,
  applyRemoteCardCreate,
  applyRemoteCardUpdate,
  applyRemoteCardDelete,
  applyRemoteCardReorder,
  applyRemoteCardAudioChange,
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
  isOperationMessage,
  isRoleMessage,
  createRoleRequest,
  createRoleGrant,
  createRoleDeny,
  createRoleTransferComplete,
  calculateTotalChunks,
} from '@/services/webrtc/syncProtocol';
import type { RoleMessage } from '@/types/sync';

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
 * Role transfer request lifecycle state.
 * Tracks the async role request/grant/deny flow.
 */
type RoleTransferState =
  | { status: 'idle' }
  | { status: 'pending_request' }       // Viewer: waiting for editor response
  | { status: 'pending_approval' }      // Editor: has pending request from viewer
  | { status: 'transferring' }          // Brief pause during role handoff
  | { status: 'denied'; reason?: string };  // Viewer: request was denied

/**
 * Reconnection state for connection loss handling.
 * Note: Due to manual SDP exchange, automatic reconnection isn't possible.
 * User must start a new connection after failure.
 */
type ReconnectionState =
  | { status: 'idle' }
  | { status: 'reconnecting' }  // Brief state while detecting if connection recovers
  | { status: 'failed'; reason: string }  // Connection lost - manual reconnect required
  | { status: 'peer_disconnected' };  // Peer intentionally disconnected

/**
 * Pending sync request from editor (viewer sees this).
 */
interface PendingSyncRequest {
  project: Project;
  cards: CardMetadata[];
  totalAudioBytes: number;
}

/**
 * Pending audio operation - metadata stored while awaiting binary transfer.
 */
interface PendingAudioOp {
  metadata: {
    duration: number;
    waveformData?: number[];
    transcript?: TranscriptSegment[];
  };
  receivedBlob: Blob | null;
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
  // Role transfer state (ROLE-02, ROLE-03, ROLE-05)
  roleTransferState: RoleTransferState;
  // Reconnection state (CONN-07, CONN-08)
  reconnectionState: ReconnectionState;
  connectedAt: number | null;  // Timestamp when connected
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

  // Operation handling (for broadcast wrappers to check)
  isApplyingRemoteRef: React.RefObject<boolean>;
  getConnection: () => WebRTCConnectionService | null;
  getAudioTransfer: () => AudioTransferService | null;

  // Role transfer (ROLE-02, ROLE-03, ROLE-05)
  canEdit: boolean;
  roleTransferState: RoleTransferState;
  requestRole: (reason?: string) => void;
  grantRole: () => void;
  denyRole: (reason?: string) => void;

  // Reconnection state (CONN-07)
  reconnectionState: ReconnectionState;
  connectedAt: number | null;
  resetReconnectionState: () => void;  // For "Try again" button

  // Graceful disconnect (CONN-08)
  gracefulDisconnect: () => Promise<void>;
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
  roleTransferState: { status: 'idle' },
  reconnectionState: { status: 'idle' },
  connectedAt: null,
};

// Reconnection config - brief delay before showing "connection lost"
const RECONNECT_DETECT_DELAY = 2000;  // 2s to detect if connection self-recovers

// =============================================================================
// Context
// =============================================================================

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

// =============================================================================
// Provider
// =============================================================================

export function SyncProvider({ children }: { children: React.ReactNode }) {
  // Get state and dispatch from ProjectContext for syncing
  const { state: projectState, dispatch } = useProject();

  // Sync state
  const [syncState, setSyncState] = useState<SyncState>(initialSyncState);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected');

  // Refs for connection and services (stable across renders)
  const connectionRef = useRef<WebRTCConnectionService | null>(null);
  const audioTransferRef = useRef<AudioTransferService | null>(null);
  const userRoleRef = useRef<UserRole | null>(null);
  const hasInitialSyncedRef = useRef<boolean>(false);

  // Operation handling refs and state
  const isApplyingRemoteRef = useRef<boolean>(false);
  const [pendingAudioOps, setPendingAudioOps] = useState<
    Map<string, PendingAudioOp>
  >(new Map());
  // Track cards created via op_card_create that are waiting for audio
  // Store full card data to avoid stale closure issues
  const pendingCardCreatesRef = useRef<Map<string, Card>>(new Map());

  // Reconnection timer ref
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ==========================================================================
  // Reconnection Handlers (CONN-07, CONN-08)
  // ==========================================================================

  /**
   * Handle heartbeat timeout - connection is stale.
   * Show brief "reconnecting" state, then transition to "failed".
   *
   * CONN-07: Due to manual SDP exchange, automatic ICE restart isn't feasible.
   * User must start a new connection.
   */
  const handleHeartbeatTimeout = useCallback(() => {
    console.log('[Sync] Heartbeat timeout - connection lost');

    // Show reconnecting state briefly (connection might self-recover)
    setConnectionState('reconnecting');
    setSyncState((prev) => ({
      ...prev,
      reconnectionState: { status: 'reconnecting' },
    }));

    // After brief delay, transition to failed state
    // (Manual SDP exchange means we can't auto-reconnect)
    reconnectTimerRef.current = setTimeout(() => {
      console.log('[Sync] Connection lost - manual reconnection required');
      setSyncState((prev) => ({
        ...prev,
        reconnectionState: {
          status: 'failed',
          reason: 'Connection lost. Please start a new session.',
        },
      }));
    }, RECONNECT_DETECT_DELAY);
  }, []);

  /**
   * Handle peer explicitly disconnecting.
   * Do NOT show reconnecting state - this was intentional.
   * CONN-08: Graceful disconnect from peer.
   */
  const handlePeerDisconnect = useCallback((reason: 'user_initiated' | 'error') => {
    console.log('[Sync] Peer disconnected:', reason);

    // Clear any reconnection timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // Transition to peer_disconnected state (no reconnecting state)
    setSyncState((prev) => ({
      ...prev,
      reconnectionState: { status: 'peer_disconnected' },
      connectedAt: null,
    }));

    // Disconnect locally
    connectionRef.current?.disconnect();
    setConnectionState('disconnected');
  }, []);

  /**
   * Reset reconnection state - for "Try again" button.
   * Clears failed/peer_disconnected state so user can start fresh connection.
   */
  const resetReconnectionState = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setSyncState((prev) => ({
      ...prev,
      reconnectionState: { status: 'idle' },
      connectedAt: null,
    }));
  }, []);

  /**
   * Graceful disconnect - notify peer before closing.
   * CONN-08: User-initiated disconnect sends message to peer.
   */
  const gracefulDisconnect = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn) return;

    console.log('[Sync] Graceful disconnect initiated');
    await conn.gracefulDisconnect('user_initiated');

    // Clean up local state
    setSyncState((prev) => ({
      ...prev,
      reconnectionState: { status: 'idle' },
      connectedAt: null,
    }));
    setConnectionState('disconnected');
  }, []);

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

            // Start heartbeat when connected
            if (state === 'connected') {
              conn.startHeartbeat();
              // Record connection time
              setSyncState((prev) => ({
                ...prev,
                connectedAt: Date.now(),
                reconnectionState: { status: 'idle' },
              }));
            }

            // Stop heartbeat on disconnect/error
            if (state === 'disconnected' || state === 'error') {
              conn.stopHeartbeat();
            }
          },
          onControlMessage: (msg) => {
            // Route role messages first (role transfer protocol)
            if (isRoleMessage(msg)) {
              handleRoleMessage(msg as RoleMessage);
            } else if (isOperationMessage(msg)) {
              // Route operation messages (real-time sync)
              handleOperationMessage(msg as SyncOperation);
            } else if (isSyncControlMessage(msg)) {
              handleSyncMessage(msg as SyncControlMessage);
            } else {
              console.warn('[Sync] Unknown message type:', msg.type);
            }
          },
          onBinaryMessage: (data) => {
            handleBinaryMessage(data);
          },
          onHeartbeatTimeout: () => {
            handleHeartbeatTimeout();
          },
          onPeerDisconnect: (reason) => {
            handlePeerDisconnect(reason);
          },
        });

        // CRITICAL: Set current state immediately since connection may already be connected
        // The callback above only fires on FUTURE state changes
        setConnectionState(conn.getState());
      } else {
        // Clear reconnect timer
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        audioTransferRef.current = null;
        setConnectionState('disconnected');
        // Reset initial sync flag when disconnected
        hasInitialSyncedRef.current = false;
        // Reset role transfer state and reconnection state on disconnect
        setSyncState((prev) => ({
          ...prev,
          roleTransferState: { status: 'idle' },
          reconnectionState: { status: 'idle' },
          connectedAt: null,
        }));
      }
    },
    [handleHeartbeatTimeout, handlePeerDisconnect]
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
   * Handle incoming operation messages (real-time sync).
   * Sets isApplyingRemoteRef to prevent re-broadcast loops.
   */
  const handleOperationMessage = useCallback(
    async (op: SyncOperation) => {
      isApplyingRemoteRef.current = true;
      try {
        switch (op.type) {
          case 'op_card_create': {
            // Create card in local state
            const card = op.card;

            // IMPORTANT: Track pending audio BEFORE any async operations
            // Binary chunks may arrive while we're awaiting below
            if (op.audioSize > 0) {
              pendingCardCreatesRef.current.set(card.id, card);
            }

            dispatch({ type: 'ADD_CARD', payload: card });
            // Persist to IndexedDB (audio arrives via binary transfer if audioSize > 0)
            await applyRemoteCardCreate(card);
            break;
          }

          case 'op_card_update': {
            // Find existing card in ProjectContext state
            const existingCard = projectState.cards.find(
              (c) => c.id === op.cardId
            );
            if (!existingCard) {
              console.warn('[Sync] op_card_update: card not found:', op.cardId);
              break;
            }
            // Merge changes into existing card
            const updatedCard: Card = {
              ...existingCard,
              ...op.changes,
              updatedAt: new Date().toISOString(),
            };
            // Dispatch the full card to state
            dispatch({ type: 'UPDATE_CARD', payload: updatedCard });
            // Persist to IndexedDB
            await applyRemoteCardUpdate(op.cardId, op.changes, existingCard);
            break;
          }

          case 'op_card_delete': {
            // Remove from local state
            dispatch({ type: 'DELETE_CARD', payload: op.cardId });
            // Persist to IndexedDB
            await applyRemoteCardDelete(op.cardId);
            break;
          }

          case 'op_card_reorder': {
            // Apply reorder to current cards from ProjectContext
            const currentCards = projectState.cards;
            const reorderedCards = await applyRemoteCardReorder(
              op.cardOrder,
              currentCards
            );
            // Dispatch reordered cards to state
            dispatch({ type: 'REORDER_CARDS', payload: reorderedCards });
            break;
          }

          case 'op_card_audio_change': {
            // Store in pendingAudioOps until binary data arrives
            setPendingAudioOps((prev) => {
              const newMap = new Map(prev);
              newMap.set(op.cardId, {
                metadata: {
                  duration: op.duration,
                  waveformData: op.waveformData,
                  transcript: op.transcript,
                },
                receivedBlob: null,
              });
              return newMap;
            });
            break;
          }
        }
      } finally {
        isApplyingRemoteRef.current = false;
      }
    },
    [dispatch, projectState.cards]
  );

  /**
   * Handle incoming binary data (audio chunks).
   */
  const handleBinaryMessage = useCallback(
    async (data: ArrayBuffer) => {
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
        const { cardId, blob } = result;

        // Check if this audio is for a pending audio change operation
        const pendingOp = pendingAudioOps.get(cardId);
        if (pendingOp) {
          // Apply the audio change operation now that we have the blob
          isApplyingRemoteRef.current = true;
          try {
            // Find existing card in ProjectContext state
            const existingCard = projectState.cards.find((c) => c.id === cardId);
            if (existingCard) {
              // Merge metadata into existing card
              const updatedCard: Card = {
                ...existingCard,
                duration: pendingOp.metadata.duration,
                waveformData: pendingOp.metadata.waveformData,
                transcript: pendingOp.metadata.transcript,
                updatedAt: new Date().toISOString(),
              };
              // Dispatch the full card to state
              dispatch({ type: 'UPDATE_CARD', payload: updatedCard });
              // Persist card and audio to IndexedDB
              await applyRemoteCardAudioChange(
                cardId,
                pendingOp.metadata,
                existingCard,
                blob
              );
            } else {
              // Card not found - just save the audio
              console.warn(
                '[Sync] op_card_audio_change: card not found:',
                cardId
              );
              const { saveAudio } = await import('@/services/db');
              await saveAudio(cardId, blob);
            }

            // Remove from pending ops
            setPendingAudioOps((prev) => {
              const newMap = new Map(prev);
              newMap.delete(cardId);
              return newMap;
            });
          } finally {
            isApplyingRemoteRef.current = false;
          }
        } else if (pendingCardCreatesRef.current.has(cardId)) {
          // Real-time card create - save audio directly to IndexedDB
          const { saveAudio } = await import('@/services/db');
          await saveAudio(cardId, blob);

          // Get the stored card data (avoids stale closure issue)
          const pendingCard = pendingCardCreatesRef.current.get(cardId);
          pendingCardCreatesRef.current.delete(cardId);

          // Trigger UI update by touching the card's updatedAt timestamp
          // This forces WaveformThumbnail to re-mount and load the audio
          if (pendingCard) {
            dispatch({
              type: 'UPDATE_CARD',
              payload: { ...pendingCard, updatedAt: new Date().toISOString() },
            });
          }

          // Reset sync progress (real-time ops don't have sync_complete message)
          setSyncState((prev) => ({
            ...prev,
            isSyncing: false,
            progress: { ...initialProgress, phase: 'idle' },
          }));
        } else {
          // Normal initial sync flow - store received audio blob
          setSyncState((prev) => {
            const newAudioMap = new Map(prev.receivedAudio);
            newAudioMap.set(cardId, blob);
            return { ...prev, receivedAudio: newAudioMap };
          });
        }
      }
    },
    [dispatch, pendingAudioOps, projectState.cards]
  );

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
  // Role Transfer (ROLE-02, ROLE-03, ROLE-05)
  // ==========================================================================

  /**
   * Computed editing permission.
   * - Not connected = can edit (local only mode)
   * - During role transfer = nobody edits (ROLE-05)
   * - Only editor can edit when connected
   */
  const canEdit = useMemo(() => {
    // Not connected = can edit (local only mode)
    if (connectionState !== 'connected') return true;
    // During role transfer = nobody edits
    if (syncState.roleTransferState.status === 'transferring') return false;
    // Only editor can edit
    return syncState.role === 'editor';
  }, [connectionState, syncState.roleTransferState.status, syncState.role]);

  /**
   * Request editor role from current editor.
   * Viewer calls this to initiate role transfer.
   */
  const requestRole = useCallback((reason?: string) => {
    if (!connectionRef.current?.isReady() || syncState.role !== 'viewer') {
      return;
    }

    console.log('[Sync] Requesting editor role');

    // Update state to pending_request
    setSyncState((prev) => ({
      ...prev,
      roleTransferState: { status: 'pending_request' },
    }));

    // Send request to editor
    connectionRef.current.sendControl(createRoleRequest(reason));
  }, [syncState.role]);

  /**
   * Grant editor role to viewer.
   * Editor calls this to approve role request.
   */
  const grantRole = useCallback(() => {
    if (!connectionRef.current?.isReady() || syncState.role !== 'editor') {
      return;
    }

    console.log('[Sync] Granting editor role');

    // Enter transferring state (ROLE-05: pause editing)
    setSyncState((prev) => ({
      ...prev,
      roleTransferState: { status: 'transferring' },
    }));

    // Send grant to viewer
    connectionRef.current.sendControl(createRoleGrant());

    // Swap roles locally: we become viewer
    userRoleRef.current = 'viewer';
    setSyncState((prev) => ({
      ...prev,
      role: 'viewer',
      roleTransferState: { status: 'idle' },
    }));
  }, [syncState.role]);

  /**
   * Deny role request from viewer.
   * Editor calls this to reject role request.
   */
  const denyRole = useCallback((reason?: string) => {
    if (!connectionRef.current?.isReady() || syncState.role !== 'editor') {
      return;
    }

    console.log('[Sync] Denying role request:', reason);

    // Clear pending approval state
    setSyncState((prev) => ({
      ...prev,
      roleTransferState: { status: 'idle' },
    }));

    // Send denial to viewer
    connectionRef.current.sendControl(createRoleDeny(reason));
  }, [syncState.role]);

  /**
   * Handle incoming role messages.
   */
  const handleRoleMessage = useCallback((msg: RoleMessage) => {
    console.log('[Sync] Received role message:', msg.type);

    switch (msg.type) {
      case 'role_request':
        // Editor receives request from viewer
        if (syncState.role === 'editor') {
          setSyncState((prev) => ({
            ...prev,
            roleTransferState: { status: 'pending_approval' },
          }));
        }
        break;

      case 'role_grant':
        // Viewer receives grant from editor
        if (syncState.role === 'viewer') {
          console.log('[Sync] Role granted - becoming editor');

          // Enter transferring state briefly (ROLE-05)
          setSyncState((prev) => ({
            ...prev,
            roleTransferState: { status: 'transferring' },
          }));

          // Swap roles: we become editor
          userRoleRef.current = 'editor';
          setSyncState((prev) => ({
            ...prev,
            role: 'editor',
            roleTransferState: { status: 'idle' },
          }));

          // Send transfer complete to old editor
          connectionRef.current?.sendControl(createRoleTransferComplete());
        }
        break;

      case 'role_deny':
        // Viewer receives denial from editor
        if (syncState.role === 'viewer') {
          setSyncState((prev) => ({
            ...prev,
            roleTransferState: { status: 'denied', reason: msg.reason },
          }));

          // Clear denied state after 3 seconds
          setTimeout(() => {
            setSyncState((prev) => {
              if (prev.roleTransferState.status === 'denied') {
                return { ...prev, roleTransferState: { status: 'idle' } };
              }
              return prev;
            });
          }, 3000);
        }
        break;

      case 'role_transfer_complete':
        // Old editor receives confirmation from new editor
        setSyncState((prev) => ({
          ...prev,
          roleTransferState: { status: 'idle' },
        }));
        break;
    }
  }, [syncState.role]);

  // ==========================================================================
  // Getters for broadcast wrappers
  // ==========================================================================

  /**
   * Get the current WebRTC connection.
   * For use by broadcast wrappers that need to send messages.
   */
  const getConnection = useCallback((): WebRTCConnectionService | null => {
    return connectionRef.current;
  }, []);

  /**
   * Get the current audio transfer service.
   * For use by broadcast wrappers that need to send audio.
   */
  const getAudioTransfer = useCallback((): AudioTransferService | null => {
    return audioTransferRef.current;
  }, []);

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
    isApplyingRemoteRef,
    getConnection,
    getAudioTransfer,
    // Role transfer (ROLE-02, ROLE-03, ROLE-05)
    canEdit,
    roleTransferState: syncState.roleTransferState,
    requestRole,
    grantRole,
    denyRole,
    // Reconnection state (CONN-07, CONN-08)
    reconnectionState: syncState.reconnectionState,
    connectedAt: syncState.connectedAt,
    resetReconnectionState,
    gracefulDisconnect,
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
