// services/webrtc/sdpCodec.ts - SDP encoding/decoding for manual exchange
// Design: Enable serverless P2P by encoding WebRTC SDP as shareable codes

import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string';
import type { SDPCodecResult } from '@/types/sync';

/**
 * Compact representation of SDP for encoding.
 * Uses short keys to minimize compressed size.
 */
interface CompactSDP {
  t: RTCSdpType; // type: 'offer' | 'answer'
  s: string;     // sdp content
}

/**
 * Encodes an RTCSessionDescription to a URL-safe string.
 *
 * Why lz-string?
 * - URL-safe output (compressToEncodedURIComponent)
 * - Good compression ratio for SDP text (~70% reduction)
 * - No external dependencies, small bundle size
 * - Works in all browsers
 *
 * Expected sizes:
 * - Input: ~2-4KB SDP (varies by ICE candidates)
 * - Output: ~800-1500 chars URL-safe string
 *
 * Important: For reliable connections, wait for ICE gathering to complete
 * before encoding. Trickle ICE is not supported in manual exchange.
 *
 * @param sdp - The RTCSessionDescriptionInit to encode
 * @returns Success with encoded string, or failure with error message
 */
export function encodeSDP(
  sdp: RTCSessionDescriptionInit
): SDPCodecResult<string> {
  try {
    // Validate input
    if (!sdp || typeof sdp !== 'object') {
      return { success: false, error: 'Invalid SDP: must be an object' };
    }

    if (!sdp.type) {
      return { success: false, error: 'Invalid SDP: missing type field' };
    }

    if (!sdp.sdp || typeof sdp.sdp !== 'string') {
      return { success: false, error: 'Invalid SDP: missing or invalid sdp field' };
    }

    // Create compact representation
    const compact: CompactSDP = {
      t: sdp.type,
      s: sdp.sdp,
    };

    // Compress to URL-safe string
    const encoded = compressToEncodedURIComponent(JSON.stringify(compact));

    if (!encoded) {
      return { success: false, error: 'Compression failed: empty result' };
    }

    return { success: true, data: encoded };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Encoding failed: ${message}` };
  }
}

/**
 * Decodes a URL-safe string back to an RTCSessionDescriptionInit.
 *
 * Validates:
 * - String can be decompressed
 * - Decompressed content is valid JSON
 * - JSON has required 't' (type) and 's' (sdp) fields
 * - Type is 'offer' or 'answer'
 *
 * @param code - The encoded string to decode
 * @returns Success with RTCSessionDescriptionInit, or failure with error message
 */
export function decodeSDP(
  code: string
): SDPCodecResult<RTCSessionDescriptionInit> {
  try {
    // Validate input
    if (!code || typeof code !== 'string') {
      return { success: false, error: 'Invalid code: must be a non-empty string' };
    }

    // Trim whitespace (common copy-paste issue)
    const trimmed = code.trim();

    if (trimmed.length === 0) {
      return { success: false, error: 'Invalid code: empty after trimming' };
    }

    // Decompress
    const decompressed = decompressFromEncodedURIComponent(trimmed);

    if (!decompressed) {
      return { success: false, error: 'Invalid or corrupted code' };
    }

    // Parse JSON
    let compact: unknown;
    try {
      compact = JSON.parse(decompressed);
    } catch {
      return { success: false, error: 'Invalid code: not valid JSON' };
    }

    // Validate structure
    if (!compact || typeof compact !== 'object') {
      return { success: false, error: 'Invalid code: unexpected structure' };
    }

    const obj = compact as Record<string, unknown>;

    if (!obj.t || typeof obj.t !== 'string') {
      return { success: false, error: 'Invalid code: missing type field' };
    }

    if (!obj.s || typeof obj.s !== 'string') {
      return { success: false, error: 'Invalid code: missing sdp field' };
    }

    // Validate type is offer or answer
    if (obj.t !== 'offer' && obj.t !== 'answer') {
      return { success: false, error: `Invalid code: unknown SDP type "${obj.t}"` };
    }

    // Return reconstructed SDP
    return {
      success: true,
      data: {
        type: obj.t as RTCSdpType,
        sdp: obj.s as string,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Decoding failed: ${message}` };
  }
}

/**
 * Validates that an SDP object has the required structure for WebRTC.
 *
 * Checks:
 * - Type is 'offer' or 'answer'
 * - SDP string exists and contains 'v=0' (SDP version line)
 *
 * Note: This is a basic structural validation, not a full SDP parser.
 * WebRTC will perform additional validation when the SDP is used.
 *
 * @param sdp - The RTCSessionDescriptionInit to validate
 * @returns true if the SDP appears valid, false otherwise
 */
export function validateSDP(sdp: RTCSessionDescriptionInit): boolean {
  // Check type
  if (!sdp.type || (sdp.type !== 'offer' && sdp.type !== 'answer')) {
    return false;
  }

  // Check sdp content exists and has version line
  if (!sdp.sdp || typeof sdp.sdp !== 'string') {
    return false;
  }

  // SDP must contain version line (v=0)
  // This is the first line in any valid SDP
  if (!sdp.sdp.includes('v=0')) {
    return false;
  }

  return true;
}
