// types/sync.ts - P2P sync system types
// Design: WebRTC connection management for serverless peer-to-peer sync

import { Card, CardColor } from '@/types';

/**
 * Connection state machine states for WebRTC P2P sync.
 *
 * State transitions:
 * - disconnected -> creating_offer (initiator starts)
 * - disconnected -> creating_answer (responder receives offer)
 * - creating_offer -> awaiting_answer (offer generated, waiting for peer)
 * - creating_answer -> connecting (answer generated)
 * - awaiting_answer -> connecting (received answer from peer)
 * - connecting -> connected (ICE negotiation complete, DataChannel open)
 * - any -> error (failure at any stage)
 * - any -> disconnected (manual disconnect or connection loss)
 */
export type ConnectionState =
  | 'disconnected'     // No active connection
  | 'creating_offer'   // Generating SDP offer (initiator)
  | 'awaiting_answer'  // Waiting for peer's answer (initiator)
  | 'creating_answer'  // Generating SDP answer (responder)
  | 'connecting'       // ICE negotiation in progress
  | 'connected'        // DataChannels open and ready
  | 'error';           // Connection failed

/**
 * Role in the P2P connection handshake.
 * - initiator: Creates offer, shares code first
 * - responder: Receives offer, creates answer
 */
export type ConnectionRole = 'initiator' | 'responder';

/**
 * Result type for SDP codec operations.
 * Using discriminated union for type-safe error handling.
 */
export type SDPCodecResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Base type for control channel messages.
 * All sync protocol messages extend this interface.
 */
export interface ControlMessage {
  type: string;
  timestamp: number;
  id: string;
}

/**
 * Configuration for WebRTC connection.
 */
export interface ConnectionConfig {
  iceServers: RTCIceServer[];
  iceGatheringTimeout: number;
}

/**
 * Default STUN servers for ICE candidate gathering.
 * Using Google and Cloudflare public STUN servers.
 *
 * Note: No TURN servers = some connections (~10-15%) may fail due to
 * symmetric NAT. This is acceptable for this use case as users can
 * fall back to export/import.
 */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/**
 * Default configuration for WebRTC connections.
 */
export const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = {
  iceServers: DEFAULT_ICE_SERVERS,
  iceGatheringTimeout: 3000, // 3 seconds to gather ICE candidates
};

// =============================================================================
// Sync Protocol Message Types
// =============================================================================

/**
 * Card metadata without audio data - used in sync_request message.
 * Contains all card fields except the audio Blob.
 */
export interface CardMetadata {
  id: string;
  label: string;
  notes: string;
  tags: string[];
  color: CardColor;
  duration: number;
  waveformData?: number[];
  transcript?: Card['transcript'];
  createdAt: string;
  updatedAt: string;
  order: number;
  audioSize: number;  // Size of audio blob in bytes
}

/**
 * Editor sends to viewer on connection - initiates sync.
 * Contains full project metadata and card metadata for preview.
 */
export interface SyncRequestMessage extends ControlMessage {
  type: 'sync_request';
  project: {
    createdAt: string;
    updatedAt: string;
  };
  cards: CardMetadata[];
  totalAudioBytes: number;
}

/**
 * Viewer accepts sync - ready to receive audio data.
 */
export interface SyncAcceptMessage extends ControlMessage {
  type: 'sync_accept';
}

/**
 * Viewer rejects sync - will not receive data.
 */
export interface SyncRejectMessage extends ControlMessage {
  type: 'sync_reject';
  reason: string;
}

/**
 * Sent before transferring audio chunks for a card.
 * Viewer uses this to prepare for incoming binary data.
 */
export interface ChunkStartMessage extends ControlMessage {
  type: 'chunk_start';
  cardId: string;
  cardIndex: number;
  totalChunks: number;
  audioSize: number;
}

/**
 * Sent after all audio chunks for a card have been transmitted.
 */
export interface ChunkCompleteMessage extends ControlMessage {
  type: 'chunk_complete';
  cardId: string;
  cardIndex: number;
}

/**
 * Sent when all cards have been transferred.
 */
export interface SyncCompleteMessage extends ControlMessage {
  type: 'sync_complete';
  totalCards: number;
  totalBytes: number;
}

/**
 * Sent when an error occurs during sync.
 */
export interface SyncErrorMessage extends ControlMessage {
  type: 'sync_error';
  error: string;
}

/**
 * Union type of all sync control messages (initial sync protocol).
 * Enables type narrowing based on message.type discriminant.
 */
export type SyncControlMessage =
  | SyncRequestMessage
  | SyncAcceptMessage
  | SyncRejectMessage
  | ChunkStartMessage
  | ChunkCompleteMessage
  | SyncCompleteMessage
  | SyncErrorMessage
  | CardCreateOperation
  | CardUpdateOperation
  | CardDeleteOperation
  | CardReorderOperation
  | CardAudioChangeOperation
  | RoleRequestMessage
  | RoleGrantMessage
  | RoleDenyMessage
  | RoleTransferCompleteMessage;

// =============================================================================
// Real-Time Sync Operation Types (SYNC-01 through SYNC-05)
// =============================================================================

/**
 * Operation: Create a new card.
 * Editor broadcasts when a new card is created.
 * audioSize > 0 triggers binary transfer of audio data.
 */
export interface CardCreateOperation extends ControlMessage {
  type: 'op_card_create';
  card: Card;
  audioSize: number;
}

/**
 * Operation: Update card metadata (non-audio fields).
 * Editor broadcasts when card label, notes, tags, or color changes.
 */
export interface CardUpdateOperation extends ControlMessage {
  type: 'op_card_update';
  cardId: string;
  changes: Partial<Pick<Card, 'label' | 'notes' | 'tags' | 'color'>>;
}

/**
 * Operation: Delete a card.
 * Editor broadcasts when a card is deleted.
 */
export interface CardDeleteOperation extends ControlMessage {
  type: 'op_card_delete';
  cardId: string;
}

/**
 * Operation: Reorder cards.
 * Editor broadcasts when card order changes (drag-drop, etc.).
 * Contains only IDs and new order values for efficiency.
 */
export interface CardReorderOperation extends ControlMessage {
  type: 'op_card_reorder';
  cardOrder: Array<{ id: string; order: number }>;
}

/**
 * Operation: Audio change on existing card (re-record, append, etc.).
 * Editor broadcasts when card audio is modified.
 * audioSize > 0 triggers binary transfer of new audio data.
 */
export interface CardAudioChangeOperation extends ControlMessage {
  type: 'op_card_audio_change';
  cardId: string;
  duration: number;
  waveformData?: number[];
  transcript?: Card['transcript'];
  audioSize: number;
}

/**
 * Union type of all real-time sync operations.
 * Used for type narrowing in operation handlers.
 */
export type SyncOperation =
  | CardCreateOperation
  | CardUpdateOperation
  | CardDeleteOperation
  | CardReorderOperation
  | CardAudioChangeOperation;

// =============================================================================
// Role Transfer Protocol Message Types (ROLE-01 through ROLE-05)
// =============================================================================

/**
 * Viewer requests editor role from current editor.
 * ROLE-02: Viewer can request editor role.
 */
export interface RoleRequestMessage extends ControlMessage {
  type: 'role_request';
  reason?: string; // Optional: "I need to make edits"
}

/**
 * Editor grants editor role to viewer.
 * ROLE-03: Editor can approve request.
 */
export interface RoleGrantMessage extends ControlMessage {
  type: 'role_grant';
}

/**
 * Editor denies role request.
 * ROLE-03: Editor can deny request.
 */
export interface RoleDenyMessage extends ControlMessage {
  type: 'role_deny';
  reason?: string; // Optional: "Still editing"
}

/**
 * Sent by old editor after role swap completes to confirm transfer.
 * ROLE-05: Signals editing can resume after brief pause.
 */
export interface RoleTransferCompleteMessage extends ControlMessage {
  type: 'role_transfer_complete';
}

/**
 * Union type of all role transfer messages.
 */
export type RoleMessage =
  | RoleRequestMessage
  | RoleGrantMessage
  | RoleDenyMessage
  | RoleTransferCompleteMessage;

/**
 * Sync transfer progress tracking.
 * Used by UI to display progress indicators.
 */
export interface SyncProgress {
  phase: 'idle' | 'requesting' | 'awaiting_accept' | 'transferring' | 'complete' | 'error';
  currentCardIndex: number;
  totalCards: number;
  currentCardBytesTransferred: number;
  currentCardBytesTotal: number;
  totalBytesTransferred: number;
  totalBytesTotal: number;
  error?: string;
}
