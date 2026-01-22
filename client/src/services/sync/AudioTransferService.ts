// services/sync/AudioTransferService.ts - Chunked audio transfer with backpressure
// Design: Handles sending and receiving large audio files over WebRTC DataChannel

import { WebRTCConnectionService } from '@/services/webrtc/connection';
import {
  CHUNK_SIZE,
  BUFFER_THRESHOLD,
  createBinaryChunk,
  parseBinaryChunk,
  calculateTotalChunks,
} from '@/services/webrtc/syncProtocol';

// =============================================================================
// Types
// =============================================================================

/**
 * Progress information for sending audio.
 */
export interface SendProgress {
  cardId: string;
  cardIndex: number;
  bytesSent: number;
  bytesTotal: number;
  chunksSent: number;
  chunksTotal: number;
}

/**
 * Progress information for receiving audio.
 */
export interface ReceiveProgress {
  cardId: string;
  cardIndex: number;
  bytesReceived: number;
  bytesTotal: number;
  chunksReceived: number;
  chunksTotal: number;
}

/**
 * Internal buffer for assembling received chunks.
 */
interface ChunkBuffer {
  cardId: string;
  totalChunks: number;
  receivedChunks: Map<number, ArrayBuffer>;
  totalSize: number;
}

// =============================================================================
// AudioTransferService
// =============================================================================

/**
 * AudioTransferService handles chunked audio transfer over WebRTC.
 *
 * Features:
 * - Chunked sending with backpressure control to prevent buffer overflow
 * - Chunked receiving with reassembly into complete Blob
 * - Progress callbacks for UI updates during transfer
 *
 * Usage (Sender):
 * ```ts
 * const transfer = new AudioTransferService(connection);
 * await transfer.sendAudio(cardId, cardIndex, audioBlob, (progress) => {
 *   console.log(`Sent ${progress.chunksSent}/${progress.chunksTotal}`);
 * });
 * ```
 *
 * Usage (Receiver):
 * ```ts
 * const transfer = new AudioTransferService(connection);
 * transfer.startReceiving(cardIndex, cardId, totalChunks, totalSize);
 * // On each binary message:
 * const result = transfer.receiveChunk(data, (progress) => {
 *   console.log(`Received ${progress.chunksReceived}/${progress.chunksTotal}`);
 * });
 * if (result?.complete) {
 *   // result.blob contains the complete audio
 * }
 * ```
 */
export class AudioTransferService {
  private connection: WebRTCConnectionService;
  private buffers: Map<number, ChunkBuffer> = new Map();

  /**
   * Create a new AudioTransferService.
   * @param connection - WebRTC connection service for sending/receiving data
   */
  constructor(connection: WebRTCConnectionService) {
    this.connection = connection;
  }

  // ===========================================================================
  // Sending
  // ===========================================================================

  /**
   * Send audio data in chunks with backpressure control.
   *
   * Process:
   * 1. Convert Blob to ArrayBuffer
   * 2. Calculate total chunks
   * 3. For each chunk:
   *    - Wait for buffer to drain (backpressure)
   *    - Create chunk with header
   *    - Send over binary channel
   *    - Fire progress callback
   *
   * @param cardId - ID of the card being transferred
   * @param cardIndex - Zero-based index of card in transfer sequence
   * @param audioBlob - Audio blob to send
   * @param onProgress - Optional callback for progress updates
   */
  async sendAudio(
    cardId: string,
    cardIndex: number,
    audioBlob: Blob,
    onProgress?: (p: SendProgress) => void
  ): Promise<void> {
    // Convert Blob to ArrayBuffer
    const arrayBuffer = await audioBlob.arrayBuffer();
    const bytesTotal = arrayBuffer.byteLength;
    const chunksTotal = calculateTotalChunks(bytesTotal);

    // Handle empty audio (no chunks to send)
    if (chunksTotal === 0) {
      return;
    }

    // Send each chunk with backpressure control
    for (let chunkIndex = 0; chunkIndex < chunksTotal; chunkIndex++) {
      // Calculate slice boundaries
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, bytesTotal);

      // Slice the ArrayBuffer for this chunk
      const sliceData = arrayBuffer.slice(start, end);

      // Create binary chunk with header
      const chunk = createBinaryChunk(cardIndex, chunkIndex, sliceData);

      // Wait for buffer to drain before sending (backpressure control)
      await this.connection.waitForBinaryBufferDrain(BUFFER_THRESHOLD);

      // Send the chunk
      this.connection.sendBinary(chunk);

      // Fire progress callback
      if (onProgress) {
        onProgress({
          cardId,
          cardIndex,
          bytesSent: end,
          bytesTotal,
          chunksSent: chunkIndex + 1,
          chunksTotal,
        });
      }
    }
  }

  // ===========================================================================
  // Receiving
  // ===========================================================================

  /**
   * Initialize receiving for a card's audio.
   * Call this when chunk_start message is received.
   *
   * @param cardIndex - Zero-based index of card in transfer sequence
   * @param cardId - ID of the card being received
   * @param totalChunks - Total number of chunks expected
   * @param totalSize - Total size of audio data in bytes
   */
  startReceiving(
    cardIndex: number,
    cardId: string,
    totalChunks: number,
    totalSize: number
  ): void {
    this.buffers.set(cardIndex, {
      cardId,
      totalChunks,
      receivedChunks: new Map(),
      totalSize,
    });
  }

  /**
   * Process a received binary chunk.
   *
   * Process:
   * 1. Parse chunk header to get cardIndex and chunkIndex
   * 2. Look up buffer by cardIndex
   * 3. Store chunk data
   * 4. Fire progress callback
   * 5. Check if all chunks received
   * 6. If complete, reassemble and return Blob
   *
   * @param data - Raw binary data received
   * @param onProgress - Optional callback for progress updates
   * @returns Object with cardId and completion status, or null if unexpected chunk
   */
  receiveChunk(
    data: ArrayBuffer,
    onProgress?: (p: ReceiveProgress) => void
  ): { cardId: string; complete: boolean; blob?: Blob } | null {
    // Parse the chunk
    const { cardIndex, chunkIndex, chunkData } = parseBinaryChunk(data);

    // Look up the buffer for this card
    const buffer = this.buffers.get(cardIndex);
    if (!buffer) {
      console.warn(
        `[AudioTransfer] Received chunk for unknown cardIndex: ${cardIndex}`
      );
      return null;
    }

    // Store the chunk data
    buffer.receivedChunks.set(chunkIndex, chunkData);

    // Calculate bytes received
    let bytesReceived = 0;
    buffer.receivedChunks.forEach((chunk) => {
      bytesReceived += chunk.byteLength;
    });

    // Fire progress callback
    if (onProgress) {
      onProgress({
        cardId: buffer.cardId,
        cardIndex,
        bytesReceived,
        bytesTotal: buffer.totalSize,
        chunksReceived: buffer.receivedChunks.size,
        chunksTotal: buffer.totalChunks,
      });
    }

    // Check if all chunks received
    if (buffer.receivedChunks.size === buffer.totalChunks) {
      // Reassemble chunks in order (by index, not insertion order)
      const chunks: ArrayBuffer[] = [];
      for (let i = 0; i < buffer.totalChunks; i++) {
        const chunk = buffer.receivedChunks.get(i);
        if (chunk) {
          chunks.push(chunk);
        } else {
          console.error(
            `[AudioTransfer] Missing chunk ${i} for cardIndex ${cardIndex}`
          );
          // Return incomplete if missing chunk (shouldn't happen)
          return { cardId: buffer.cardId, complete: false };
        }
      }

      // Create Blob from ordered chunks
      const blob = new Blob(chunks, { type: 'audio/webm' });

      // Clean up buffer
      this.buffers.delete(cardIndex);

      return {
        cardId: buffer.cardId,
        complete: true,
        blob,
      };
    }

    // Not yet complete
    return {
      cardId: buffer.cardId,
      complete: false,
    };
  }

  /**
   * Cancel receiving for a card.
   * Call this on error or abort to clean up resources.
   *
   * @param cardIndex - Index of the card to cancel
   */
  cancelReceiving(cardIndex: number): void {
    this.buffers.delete(cardIndex);
  }

  /**
   * Get the current receive progress for a card.
   *
   * @param cardIndex - Index of the card
   * @returns Progress information or null if not receiving
   */
  getReceiveProgress(cardIndex: number): ReceiveProgress | null {
    const buffer = this.buffers.get(cardIndex);
    if (!buffer) {
      return null;
    }

    // Calculate bytes received
    let bytesReceived = 0;
    buffer.receivedChunks.forEach((chunk) => {
      bytesReceived += chunk.byteLength;
    });

    return {
      cardId: buffer.cardId,
      cardIndex,
      bytesReceived,
      bytesTotal: buffer.totalSize,
      chunksReceived: buffer.receivedChunks.size,
      chunksTotal: buffer.totalChunks,
    };
  }
}

export default AudioTransferService;
