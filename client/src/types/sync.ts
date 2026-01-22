// types/sync.ts - P2P sync system types
// Design: WebRTC connection management for serverless peer-to-peer sync

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
  iceGatheringTimeout: 10000, // 10 seconds to gather ICE candidates
};
