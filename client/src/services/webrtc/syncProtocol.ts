// services/webrtc/syncProtocol.ts - Sync protocol message utilities
// Design: Message creation, binary chunk encoding/decoding, and type guards

import {
  ControlMessage,
  SyncRequestMessage,
  SyncAcceptMessage,
  SyncRejectMessage,
  ChunkStartMessage,
  ChunkCompleteMessage,
  SyncCompleteMessage,
  SyncErrorMessage,
  SyncControlMessage,
  CardMetadata,
  CardCreateOperation,
  CardUpdateOperation,
  CardDeleteOperation,
  CardReorderOperation,
  CardAudioChangeOperation,
  SyncOperation,
  RoleRequestMessage,
  RoleGrantMessage,
  RoleDenyMessage,
  RoleTransferCompleteMessage,
  RoleMessage,
} from '@/types/sync';
import { Card, Project, TranscriptSegment } from '@/types';

// =============================================================================
// Constants
// =============================================================================

/**
 * Size of each audio chunk in bytes (16KB).
 * Chosen for cross-browser stability and reasonable progress updates.
 */
export const CHUNK_SIZE = 16 * 1024; // 16KB

/**
 * Size of binary chunk header in bytes.
 * Header format: [cardIndex: 4 bytes LE][chunkIndex: 4 bytes LE]
 */
export const CHUNK_HEADER_SIZE = 8;

/**
 * Buffer threshold for backpressure control (64KB).
 * Pause sending when bufferedAmount exceeds this value.
 */
export const BUFFER_THRESHOLD = 64 * 1024; // 64KB

// =============================================================================
// Sync control message type values
// =============================================================================

const SYNC_MESSAGE_TYPES = [
  'sync_request',
  'sync_accept',
  'sync_reject',
  'chunk_start',
  'chunk_complete',
  'sync_complete',
  'sync_error',
] as const;

/**
 * Operation message type strings for real-time sync.
 * Used by isOperationMessage type guard.
 */
export const OPERATION_MESSAGE_TYPES = [
  'op_card_create',
  'op_card_update',
  'op_card_delete',
  'op_card_reorder',
  'op_card_audio_change',
] as const;

/**
 * Role message type strings for role transfer protocol.
 * Used by isRoleMessage type guard.
 */
export const ROLE_MESSAGE_TYPES = [
  'role_request',
  'role_grant',
  'role_deny',
  'role_transfer_complete',
] as const;

// =============================================================================
// Message Creators
// =============================================================================

type MessageWithoutMeta<T extends ControlMessage> = Omit<T, 'timestamp' | 'id'>;

/**
 * Create a sync_request message with project metadata and card info.
 * Editor sends this to viewer on connection to initiate sync.
 *
 * @param project - Project metadata
 * @param cards - Array of cards (metadata will be extracted)
 * @param audioSizes - Map of cardId to audio blob size in bytes
 */
export function createSyncRequest(
  project: Project,
  cards: Card[],
  audioSizes: Map<string, number>
): MessageWithoutMeta<SyncRequestMessage> {
  const cardMetadata: CardMetadata[] = cards.map(card => ({
    id: card.id,
    label: card.label,
    notes: card.notes,
    tags: card.tags,
    color: card.color,
    duration: card.duration,
    waveformData: card.waveformData,
    transcript: card.transcript,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    order: card.order,
    audioSize: audioSizes.get(card.id) ?? 0,
  }));

  const totalAudioBytes = Array.from(audioSizes.values()).reduce(
    (sum, size) => sum + size,
    0
  );

  return {
    type: 'sync_request',
    project: {
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    cards: cardMetadata,
    totalAudioBytes,
  };
}

/**
 * Create a sync_accept message.
 * Viewer sends this to editor to confirm ready to receive.
 */
export function createSyncAccept(): MessageWithoutMeta<SyncAcceptMessage> {
  return {
    type: 'sync_accept',
  };
}

/**
 * Create a sync_reject message.
 * Viewer sends this to editor to decline sync.
 *
 * @param reason - Human-readable rejection reason
 */
export function createSyncReject(
  reason: string
): MessageWithoutMeta<SyncRejectMessage> {
  return {
    type: 'sync_reject',
    reason,
  };
}

/**
 * Create a chunk_start message.
 * Editor sends this before starting audio transfer for a card.
 *
 * @param cardId - ID of the card being transferred
 * @param cardIndex - Zero-based index of card in transfer sequence
 * @param totalChunks - Total number of chunks for this card's audio
 * @param audioSize - Size of audio data in bytes
 */
export function createChunkStart(
  cardId: string,
  cardIndex: number,
  totalChunks: number,
  audioSize: number
): MessageWithoutMeta<ChunkStartMessage> {
  return {
    type: 'chunk_start',
    cardId,
    cardIndex,
    totalChunks,
    audioSize,
  };
}

/**
 * Create a chunk_complete message.
 * Editor sends this after all chunks for a card have been sent.
 *
 * @param cardId - ID of the card that finished transferring
 * @param cardIndex - Zero-based index of card in transfer sequence
 */
export function createChunkComplete(
  cardId: string,
  cardIndex: number
): MessageWithoutMeta<ChunkCompleteMessage> {
  return {
    type: 'chunk_complete',
    cardId,
    cardIndex,
  };
}

/**
 * Create a sync_complete message.
 * Editor sends this after all cards have been transferred.
 *
 * @param totalCards - Total number of cards transferred
 * @param totalBytes - Total bytes of audio data transferred
 */
export function createSyncComplete(
  totalCards: number,
  totalBytes: number
): MessageWithoutMeta<SyncCompleteMessage> {
  return {
    type: 'sync_complete',
    totalCards,
    totalBytes,
  };
}

/**
 * Create a sync_error message.
 * Sent when an error occurs during sync.
 *
 * @param error - Human-readable error description
 */
export function createSyncError(
  error: string
): MessageWithoutMeta<SyncErrorMessage> {
  return {
    type: 'sync_error',
    error,
  };
}

// =============================================================================
// Binary Chunk Utilities
// =============================================================================

/**
 * Create a binary chunk with header for transmission.
 * Header format: [cardIndex: 4 bytes LE][chunkIndex: 4 bytes LE][data: variable]
 *
 * @param cardIndex - Zero-based index of card in transfer sequence
 * @param chunkIndex - Zero-based index of chunk within card's audio
 * @param data - Raw audio chunk data
 * @returns ArrayBuffer with header + data
 */
export function createBinaryChunk(
  cardIndex: number,
  chunkIndex: number,
  data: ArrayBuffer
): ArrayBuffer {
  const buffer = new ArrayBuffer(CHUNK_HEADER_SIZE + data.byteLength);
  const view = new DataView(buffer);

  // Write header (little-endian for consistency across platforms)
  view.setUint32(0, cardIndex, true); // bytes 0-3: cardIndex
  view.setUint32(4, chunkIndex, true); // bytes 4-7: chunkIndex

  // Copy chunk data after header
  const dst = new Uint8Array(buffer, CHUNK_HEADER_SIZE);
  const src = new Uint8Array(data);
  dst.set(src);

  return buffer;
}

/**
 * Parse a binary chunk, extracting header and data.
 *
 * @param data - ArrayBuffer containing header + chunk data
 * @returns Parsed components: cardIndex, chunkIndex, chunkData
 */
export function parseBinaryChunk(data: ArrayBuffer): {
  cardIndex: number;
  chunkIndex: number;
  chunkData: ArrayBuffer;
} {
  const view = new DataView(data);

  // Read header (little-endian)
  const cardIndex = view.getUint32(0, true);
  const chunkIndex = view.getUint32(4, true);

  // Extract chunk data after header
  const chunkData = data.slice(CHUNK_HEADER_SIZE);

  return {
    cardIndex,
    chunkIndex,
    chunkData,
  };
}

// =============================================================================
// Chunk Calculation
// =============================================================================

/**
 * Calculate the total number of chunks needed for an audio file.
 *
 * @param audioSize - Size of audio data in bytes
 * @returns Number of chunks (minimum 1 even for empty/zero-size)
 */
export function calculateTotalChunks(audioSize: number): number {
  if (audioSize <= 0) {
    return 0;
  }
  return Math.ceil(audioSize / CHUNK_SIZE);
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if a ControlMessage is a SyncControlMessage.
 * Enables type narrowing on message.type discriminant.
 *
 * @param msg - Any control message
 * @returns true if msg is a SyncControlMessage
 */
export function isSyncControlMessage(
  msg: ControlMessage
): msg is SyncControlMessage {
  return SYNC_MESSAGE_TYPES.includes(msg.type as typeof SYNC_MESSAGE_TYPES[number]);
}

/**
 * Type guard to check if a ControlMessage is a SyncOperation.
 * Enables routing of real-time sync operations.
 *
 * @param msg - Any control message
 * @returns true if msg is a SyncOperation (card create/update/delete/reorder/audio_change)
 */
export function isOperationMessage(
  msg: ControlMessage
): msg is SyncOperation {
  return OPERATION_MESSAGE_TYPES.includes(msg.type as typeof OPERATION_MESSAGE_TYPES[number]);
}

// =============================================================================
// Operation Message Creators
// =============================================================================

/**
 * Create a card create operation message.
 * Editor broadcasts this when a new card is created.
 *
 * @param card - The full card object
 * @param audioSize - Size of audio blob in bytes (0 if no audio)
 */
export function createCardCreateOp(
  card: Card,
  audioSize: number
): MessageWithoutMeta<CardCreateOperation> {
  return {
    type: 'op_card_create',
    card,
    audioSize,
  };
}

/**
 * Create a card update operation message.
 * Editor broadcasts this when card metadata changes.
 *
 * @param cardId - ID of the card being updated
 * @param changes - Partial card metadata (label, notes, tags, color only)
 */
export function createCardUpdateOp(
  cardId: string,
  changes: Partial<Pick<Card, 'label' | 'notes' | 'tags' | 'color'>>
): MessageWithoutMeta<CardUpdateOperation> {
  return {
    type: 'op_card_update',
    cardId,
    changes,
  };
}

/**
 * Create a card delete operation message.
 * Editor broadcasts this when a card is deleted.
 *
 * @param cardId - ID of the card being deleted
 */
export function createCardDeleteOp(
  cardId: string
): MessageWithoutMeta<CardDeleteOperation> {
  return {
    type: 'op_card_delete',
    cardId,
  };
}

/**
 * Create a card reorder operation message.
 * Editor broadcasts this when card order changes.
 *
 * @param cardOrder - Array of { id, order } for reordered cards
 */
export function createCardReorderOp(
  cardOrder: Array<{ id: string; order: number }>
): MessageWithoutMeta<CardReorderOperation> {
  return {
    type: 'op_card_reorder',
    cardOrder,
  };
}

/**
 * Create a card audio change operation message.
 * Editor broadcasts this when card audio is modified (re-record, append).
 *
 * @param cardId - ID of the card with audio change
 * @param duration - New audio duration in seconds
 * @param audioSize - Size of new audio blob in bytes
 * @param waveformData - Optional waveform data
 * @param transcript - Optional transcript segments
 */
export function createCardAudioChangeOp(
  cardId: string,
  duration: number,
  audioSize: number,
  waveformData?: number[],
  transcript?: TranscriptSegment[]
): MessageWithoutMeta<CardAudioChangeOperation> {
  return {
    type: 'op_card_audio_change',
    cardId,
    duration,
    waveformData,
    transcript,
    audioSize,
  };
}

// =============================================================================
// Role Message Creators
// =============================================================================

/**
 * Create a role_request message.
 * Viewer sends this to request editor role.
 *
 * @param reason - Optional reason for request
 */
export function createRoleRequest(
  reason?: string
): MessageWithoutMeta<RoleRequestMessage> {
  return {
    type: 'role_request',
    reason,
  };
}

/**
 * Create a role_grant message.
 * Editor sends this to grant role to viewer.
 */
export function createRoleGrant(): MessageWithoutMeta<RoleGrantMessage> {
  return {
    type: 'role_grant',
  };
}

/**
 * Create a role_deny message.
 * Editor sends this to deny role request.
 *
 * @param reason - Optional reason for denial
 */
export function createRoleDeny(
  reason?: string
): MessageWithoutMeta<RoleDenyMessage> {
  return {
    type: 'role_deny',
    reason,
  };
}

/**
 * Create a role_transfer_complete message.
 * New editor sends this after confirming role swap.
 */
export function createRoleTransferComplete(): MessageWithoutMeta<RoleTransferCompleteMessage> {
  return {
    type: 'role_transfer_complete',
  };
}

// =============================================================================
// Role Message Type Guard
// =============================================================================

/**
 * Type guard to check if a ControlMessage is a RoleMessage.
 * Enables routing of role transfer protocol messages.
 *
 * @param msg - Any control message
 * @returns true if msg is a RoleMessage
 */
export function isRoleMessage(
  msg: ControlMessage
): msg is RoleMessage {
  return ROLE_MESSAGE_TYPES.includes(msg.type as typeof ROLE_MESSAGE_TYPES[number]);
}
