// services/webrtc/connection.ts - WebRTC connection lifecycle management
// Design: Manages RTCPeerConnection with dual DataChannels for P2P sync

import { nanoid } from 'nanoid';
import type {
  ConnectionState,
  ConnectionRole,
  ConnectionConfig,
  ControlMessage,
  SDPCodecResult,
} from '@/types/sync';
import { DEFAULT_CONNECTION_CONFIG } from '@/types/sync';
import { encodeSDP, decodeSDP } from '@/services/webrtc/sdpCodec';

/**
 * Callbacks for connection events.
 */
export interface ConnectionCallbacks {
  onStateChange?: (state: ConnectionState) => void;
  onControlMessage?: (msg: ControlMessage) => void;
  onBinaryMessage?: (data: ArrayBuffer) => void;
}

/**
 * DataChannel configuration for ordered, reliable delivery.
 */
const CONTROL_CHANNEL_CONFIG: RTCDataChannelInit = {
  ordered: true,
  maxRetransmits: 5,
};

const BINARY_CHANNEL_CONFIG: RTCDataChannelInit = {
  ordered: true,
};

/**
 * WebRTCConnectionService manages the RTCPeerConnection lifecycle.
 *
 * Features:
 * - Offer/answer generation with ICE gathering completion
 * - Dual DataChannels: control (JSON messages) and binary (ArrayBuffer)
 * - State machine tracking via callbacks
 * - Clean disconnect and resource cleanup
 *
 * Usage:
 * ```ts
 * const conn = new WebRTCConnectionService();
 * conn.setCallbacks({ onStateChange: (s) => console.log(s) });
 *
 * // Initiator
 * const offer = await conn.createOffer();
 * // Share offer.data with peer
 *
 * // Responder
 * const answer = await conn.acceptOffer(offerCode);
 * // Share answer.data back
 *
 * // Initiator receives answer
 * await conn.acceptAnswer(answerCode);
 * // Connection established when state === 'connected'
 * ```
 */
export class WebRTCConnectionService {
  // Core WebRTC objects
  private pc: RTCPeerConnection | null = null;
  private controlChannel: RTCDataChannel | null = null;
  private binaryChannel: RTCDataChannel | null = null;

  // State tracking
  private state: ConnectionState = 'disconnected';
  private role: ConnectionRole | null = null;
  private controlReady = false;
  private binaryReady = false;

  // Configuration
  private config: ConnectionConfig;

  // Callbacks
  private onStateChange: ((state: ConnectionState) => void) | null = null;
  private onControlMessage: ((msg: ControlMessage) => void) | null = null;
  private onBinaryMessage: ((data: ArrayBuffer) => void) | null = null;

  /**
   * Create a new WebRTCConnectionService.
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<ConnectionConfig>) {
    this.config = {
      ...DEFAULT_CONNECTION_CONFIG,
      ...config,
    };
  }

  /**
   * Set callbacks for connection events.
   */
  setCallbacks(callbacks: ConnectionCallbacks): void {
    if (callbacks.onStateChange) {
      this.onStateChange = callbacks.onStateChange;
    }
    if (callbacks.onControlMessage) {
      this.onControlMessage = callbacks.onControlMessage;
    }
    if (callbacks.onBinaryMessage) {
      this.onBinaryMessage = callbacks.onBinaryMessage;
    }
  }

  /**
   * Get the current connection state.
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get the connection role (initiator or responder).
   */
  getRole(): ConnectionRole | null {
    return this.role;
  }

  /**
   * Check if the connection is ready to send/receive data.
   * Both DataChannels must be open.
   */
  isReady(): boolean {
    return this.controlReady && this.binaryReady && this.state === 'connected';
  }

  /**
   * Check if control channel is ready for sending.
   */
  isControlReady(): boolean {
    return this.controlReady;
  }

  /**
   * Check if binary channel is ready for sending.
   */
  isBinaryReady(): boolean {
    return this.binaryReady;
  }

  /**
   * Create an offer to initiate a connection.
   *
   * Process:
   * 1. Create RTCPeerConnection with ICE servers
   * 2. Create DataChannels for control and binary messages
   * 3. Generate SDP offer
   * 4. Wait for ICE gathering to complete
   * 5. Encode final SDP for sharing
   *
   * @returns Encoded offer string or error
   */
  async createOffer(): Promise<SDPCodecResult<string>> {
    try {
      this.setState('creating_offer');
      this.role = 'initiator';

      // Create peer connection
      this.pc = new RTCPeerConnection({
        iceServers: this.config.iceServers,
      });
      this.setupPeerConnectionEvents();

      // Create DataChannels (initiator creates them)
      this.controlChannel = this.pc.createDataChannel(
        'control',
        CONTROL_CHANNEL_CONFIG
      );
      this.binaryChannel = this.pc.createDataChannel(
        'binary',
        BINARY_CHANNEL_CONFIG
      );

      this.setupDataChannel(this.controlChannel, 'control');
      this.setupDataChannel(this.binaryChannel, 'binary');

      // Create and set local description
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete
      await this.waitForIceGathering();

      // Encode the final SDP (with all ICE candidates)
      const localDesc = this.pc.localDescription;
      if (!localDesc) {
        return { success: false, error: 'Failed to get local description' };
      }

      const encoded = encodeSDP(localDesc);
      if (!encoded.success) {
        return encoded;
      }

      this.setState('awaiting_answer');
      return encoded;
    } catch (error) {
      this.setState('error');
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: `Failed to create offer: ${message}` };
    }
  }

  /**
   * Accept an offer from a peer and generate an answer.
   *
   * Process:
   * 1. Decode the offer SDP
   * 2. Create RTCPeerConnection
   * 3. Set remote description from offer
   * 4. Generate answer
   * 5. Wait for ICE gathering
   * 6. Encode answer for sharing
   *
   * @param offerCode - Encoded offer from peer
   * @returns Encoded answer string or error
   */
  async acceptOffer(offerCode: string): Promise<SDPCodecResult<string>> {
    try {
      this.setState('creating_answer');
      this.role = 'responder';

      // Decode the offer
      const decoded = decodeSDP(offerCode);
      if (!decoded.success) {
        this.setState('error');
        return decoded;
      }

      // Validate it's an offer
      if (decoded.data.type !== 'offer') {
        this.setState('error');
        return {
          success: false,
          error: `Expected offer, got ${decoded.data.type}`,
        };
      }

      // Create peer connection
      this.pc = new RTCPeerConnection({
        iceServers: this.config.iceServers,
      });
      this.setupPeerConnectionEvents();

      // Set up handler for DataChannels created by initiator
      this.pc.ondatachannel = (event) => {
        const channel = event.channel;
        console.log(`[WebRTC] Received DataChannel: ${channel.label}`);

        if (channel.label === 'control') {
          this.controlChannel = channel;
          this.setupDataChannel(channel, 'control');
        } else if (channel.label === 'binary') {
          this.binaryChannel = channel;
          this.setupDataChannel(channel, 'binary');
        }
      };

      // Set remote description (the offer)
      await this.pc.setRemoteDescription(decoded.data);

      // Create and set local description (the answer)
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      // Wait for ICE gathering to complete
      await this.waitForIceGathering();

      // Encode the final SDP
      const localDesc = this.pc.localDescription;
      if (!localDesc) {
        return { success: false, error: 'Failed to get local description' };
      }

      const encoded = encodeSDP(localDesc);
      if (!encoded.success) {
        return encoded;
      }

      this.setState('connecting');
      return encoded;
    } catch (error) {
      this.setState('error');
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: `Failed to accept offer: ${message}` };
    }
  }

  /**
   * Accept an answer from a peer to complete the handshake.
   *
   * @param answerCode - Encoded answer from peer
   * @returns Success or error
   */
  async acceptAnswer(answerCode: string): Promise<SDPCodecResult<void>> {
    try {
      // Decode the answer
      const decoded = decodeSDP(answerCode);
      if (!decoded.success) {
        this.setState('error');
        return decoded;
      }

      // Validate it's an answer
      if (decoded.data.type !== 'answer') {
        this.setState('error');
        return {
          success: false,
          error: `Expected answer, got ${decoded.data.type}`,
        };
      }

      if (!this.pc) {
        this.setState('error');
        return {
          success: false,
          error: 'No peer connection exists',
        };
      }

      // Set remote description (the answer)
      await this.pc.setRemoteDescription(decoded.data);

      this.setState('connecting');
      return { success: true, data: undefined };
    } catch (error) {
      this.setState('error');
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: `Failed to accept answer: ${message}` };
    }
  }

  /**
   * Disconnect and clean up all resources.
   */
  disconnect(): void {
    console.log('[WebRTC] Disconnecting...');

    // Close DataChannels
    if (this.controlChannel) {
      this.controlChannel.close();
      this.controlChannel = null;
    }
    if (this.binaryChannel) {
      this.binaryChannel.close();
      this.binaryChannel = null;
    }

    // Close peer connection
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    // Reset state
    this.controlReady = false;
    this.binaryReady = false;
    this.role = null;
    this.setState('disconnected');
  }

  /**
   * Send a control message over the control DataChannel.
   *
   * @param message - Message without timestamp and id (added automatically)
   * @returns true if sent, false if channel not ready
   */
  sendControl(message: Omit<ControlMessage, 'timestamp' | 'id'>): boolean {
    if (!this.controlChannel || this.controlChannel.readyState !== 'open') {
      console.warn('[WebRTC] Control channel not ready for sending');
      return false;
    }

    const fullMessage: ControlMessage = {
      ...message,
      timestamp: Date.now(),
      id: nanoid(),
    };

    try {
      this.controlChannel.send(JSON.stringify(fullMessage));
      return true;
    } catch (error) {
      console.error('[WebRTC] Failed to send control message:', error);
      return false;
    }
  }

  /**
   * Send binary data over the binary DataChannel.
   *
   * @param data - ArrayBuffer to send
   * @returns true if sent, false if channel not ready
   */
  sendBinary(data: ArrayBuffer): boolean {
    if (!this.binaryChannel || this.binaryChannel.readyState !== 'open') {
      console.warn('[WebRTC] Binary channel not ready for sending');
      return false;
    }

    try {
      this.binaryChannel.send(data);
      return true;
    } catch (error) {
      console.error('[WebRTC] Failed to send binary data:', error);
      return false;
    }
  }

  // ============================================================
  // Backpressure control for large binary transfers
  // ============================================================

  /**
   * Get the current buffered amount for the binary channel.
   * Used to check buffer state before sending chunks.
   *
   * @returns Current bufferedAmount or 0 if channel doesn't exist
   */
  getBinaryBufferedAmount(): number {
    return this.binaryChannel?.bufferedAmount ?? 0;
  }

  /**
   * Set the bufferedAmountLowThreshold for the binary channel.
   * When bufferedAmount drops below this value, 'bufferedamountlow' event fires.
   *
   * @param threshold - Threshold in bytes (typically 64KB)
   */
  setBinaryBufferedAmountLowThreshold(threshold: number): void {
    if (this.binaryChannel) {
      this.binaryChannel.bufferedAmountLowThreshold = threshold;
    }
  }

  /**
   * Wait for the binary channel buffer to drain below threshold.
   * Call this before each chunk send to prevent buffer overflow.
   *
   * The threshold should typically be 64KB (BUFFER_THRESHOLD from syncProtocol).
   * Callers should await this before each chunk send during large transfers.
   *
   * @param threshold - Drain threshold in bytes (default 64KB)
   * @returns Promise that resolves when buffer is below threshold
   */
  waitForBinaryBufferDrain(threshold: number = 64 * 1024): Promise<void> {
    return new Promise((resolve) => {
      // No channel or already below threshold - resolve immediately
      if (!this.binaryChannel || this.binaryChannel.bufferedAmount <= threshold) {
        resolve();
        return;
      }

      // Set the threshold
      this.binaryChannel.bufferedAmountLowThreshold = threshold;

      // One-time event listener that removes itself after firing
      const onBufferLow = () => {
        this.binaryChannel?.removeEventListener('bufferedamountlow', onBufferLow);
        resolve();
      };

      this.binaryChannel.addEventListener('bufferedamountlow', onBufferLow);
    });
  }

  /**
   * Get debug information about the current connection state.
   * Useful for troubleshooting connection issues.
   */
  getDebugInfo(): {
    state: ConnectionState;
    role: ConnectionRole | null;
    controlReady: boolean;
    binaryReady: boolean;
    iceConnectionState: RTCIceConnectionState | null;
    iceGatheringState: RTCIceGatheringState | null;
    signalingState: RTCSignalingState | null;
  } {
    return {
      state: this.state,
      role: this.role,
      controlReady: this.controlReady,
      binaryReady: this.binaryReady,
      iceConnectionState: this.pc?.iceConnectionState ?? null,
      iceGatheringState: this.pc?.iceGatheringState ?? null,
      signalingState: this.pc?.signalingState ?? null,
    };
  }

  // ============================================================
  // Private helpers
  // ============================================================

  /**
   * Update state and notify callback.
   */
  private setState(newState: ConnectionState): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;
    console.log(`[WebRTC] State: ${oldState} -> ${newState}`);

    if (this.onStateChange) {
      this.onStateChange(newState);
    }
  }

  /**
   * Wait for ICE gathering to complete.
   *
   * Important: Non-trickle ICE - we wait for all candidates before returning.
   * This ensures the SDP contains all candidates for manual exchange.
   */
  private waitForIceGathering(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.pc) {
        reject(new Error('No peer connection'));
        return;
      }

      // Already complete
      if (this.pc.iceGatheringState === 'complete') {
        console.log('[WebRTC] ICE gathering already complete');
        resolve();
        return;
      }

      // Set up timeout
      const timeout = setTimeout(() => {
        console.warn('[WebRTC] ICE gathering timeout');
        cleanup();
        // Resolve anyway - we may have enough candidates
        resolve();
      }, this.config.iceGatheringTimeout);

      // Listener for gathering state change
      const onGatheringStateChange = () => {
        if (this.pc?.iceGatheringState === 'complete') {
          console.log('[WebRTC] ICE gathering complete');
          cleanup();
          resolve();
        }
      };

      // Cleanup function
      const cleanup = () => {
        clearTimeout(timeout);
        this.pc?.removeEventListener(
          'icegatheringstatechange',
          onGatheringStateChange
        );
      };

      this.pc.addEventListener(
        'icegatheringstatechange',
        onGatheringStateChange
      );
    });
  }

  /**
   * Set up event handlers for the peer connection.
   */
  private setupPeerConnectionEvents(): void {
    if (!this.pc) return;

    // ICE connection state changes
    this.pc.oniceconnectionstatechange = () => {
      const iceState = this.pc?.iceConnectionState;
      console.log(`[WebRTC] ICE connection state: ${iceState}`);

      switch (iceState) {
        case 'connected':
        case 'completed':
          // Don't set connected yet - wait for DataChannels
          break;
        case 'failed':
          this.setState('error');
          break;
        case 'disconnected':
          // May reconnect, don't immediately error
          console.warn('[WebRTC] ICE disconnected, may reconnect...');
          break;
        case 'closed':
          this.setState('disconnected');
          break;
      }
    };

    // Connection state changes (more reliable than ICE state)
    this.pc.onconnectionstatechange = () => {
      const connState = this.pc?.connectionState;
      console.log(`[WebRTC] Connection state: ${connState}`);

      switch (connState) {
        case 'failed':
          this.setState('error');
          break;
        case 'closed':
          this.setState('disconnected');
          break;
      }
    };

    // Log ICE candidates for debugging
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] ICE candidate:', event.candidate.candidate);
      } else {
        console.log('[WebRTC] ICE candidate gathering complete (null candidate)');
      }
    };
  }

  /**
   * Set up event handlers for a DataChannel.
   */
  private setupDataChannel(
    channel: RTCDataChannel,
    type: 'control' | 'binary'
  ): void {
    channel.onopen = () => {
      console.log(`[WebRTC] ${type} channel opened`);

      if (type === 'control') {
        this.controlReady = true;
      } else {
        this.binaryReady = true;
      }

      // Check if both channels are ready
      this.checkBothChannelsReady();
    };

    channel.onclose = () => {
      console.log(`[WebRTC] ${type} channel closed`);

      if (type === 'control') {
        this.controlReady = false;
      } else {
        this.binaryReady = false;
      }

      // If we were connected, transition to disconnected
      if (this.state === 'connected') {
        this.setState('disconnected');
      }
    };

    channel.onerror = (event) => {
      console.error(`[WebRTC] ${type} channel error:`, event);
      this.setState('error');
    };

    channel.onmessage = (event) => {
      if (type === 'control') {
        this.handleControlMessage(event.data);
      } else {
        this.handleBinaryMessage(event.data);
      }
    };

    // Set binary type for binary channel
    if (type === 'binary') {
      channel.binaryType = 'arraybuffer';
    }
  }

  /**
   * Check if both DataChannels are ready and update state.
   */
  private checkBothChannelsReady(): void {
    if (this.controlReady && this.binaryReady) {
      console.log('[WebRTC] Both channels ready - connected!');
      this.setState('connected');
    }
  }

  /**
   * Handle incoming control channel message.
   */
  private handleControlMessage(data: string): void {
    try {
      const message = JSON.parse(data) as ControlMessage;
      console.log('[WebRTC] Control message received:', message.type);

      if (this.onControlMessage) {
        this.onControlMessage(message);
      }
    } catch (error) {
      console.error('[WebRTC] Failed to parse control message:', error);
    }
  }

  /**
   * Handle incoming binary channel message.
   */
  private handleBinaryMessage(data: ArrayBuffer | Blob): void {
    // Convert Blob to ArrayBuffer if needed (Safari compatibility)
    if (data instanceof Blob) {
      data.arrayBuffer().then((buffer) => {
        if (this.onBinaryMessage) {
          this.onBinaryMessage(buffer);
        }
      });
    } else {
      if (this.onBinaryMessage) {
        this.onBinaryMessage(data);
      }
    }
  }
}
