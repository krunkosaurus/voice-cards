# Technology Stack: WebRTC P2P Sync

**Project:** Voice Cards - P2P Sync Milestone
**Researched:** 2026-01-22
**Overall Confidence:** HIGH (verified against official docs and multiple sources)

## Executive Summary

For adding WebRTC P2P file transfer and real-time sync to Voice Cards with manual SDP exchange (no signaling server), the recommended stack is:

- **Native WebRTC API** with Perfect Negotiation pattern (no wrapper library)
- **fflate** for compression (SDP + file data)
- **lz-string** for URL-safe SDP encoding
- **Native DataChannel** with proper backpressure handling

This stack minimizes dependencies while maximizing control over the P2P behavior needed for manual code exchange.

---

## Recommended Stack

### Core: WebRTC Connection

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Native RTCPeerConnection** | Browser API | P2P connection management | Full control needed for manual SDP exchange; wrapper libraries assume signaling servers |
| **Native RTCDataChannel** | Browser API | Bidirectional data transfer | Reliable, ordered delivery; supports binary (ArrayBuffer) and string data |

**Confidence:** HIGH - [MDN RTCDataChannel docs](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel), [MDN Perfect Negotiation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation)

**Rationale for Native over Wrappers:**

The project requires manual SDP exchange via copy-paste codes. Popular WebRTC wrappers assume automated signaling:

- **PeerJS** - Requires PeerServer for connection brokering; defeats "no backend" requirement
- **simple-peer** (original) - Unmaintained since 2021, last npm publish 4 years ago
- **@thaunknown/simple-peer** - Maintained fork (v10.0.12, September 2025), but still abstracts away SDP in ways that complicate manual exchange

For manual SDP exchange, you need direct access to:
- `createOffer()` / `createAnswer()`
- `setLocalDescription()` / `setRemoteDescription()`
- ICE candidate gathering completion

Wrappers hide these behind event-driven abstractions optimized for automated signaling.

### SDP Compression & Encoding

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **fflate** | 0.8.2 | DEFLATE compression | 60% faster than pako, 8kB vs 45kB bundle, tree-shakeable |
| **lz-string** | 1.5.0 | URL-safe encoding | `compressToEncodedURIComponent()` produces URL-safe output |
| **sdp-compact** | latest | SDP-specific optimization | Strips redundant fields before compression (optional, advanced) |

**Confidence:** HIGH for fflate/lz-string - [fflate GitHub](https://github.com/101arrowz/fflate), [lz-string GitHub](https://github.com/pieroxy/lz-string)
**Confidence:** MEDIUM for sdp-compact - [GitHub repo](https://github.com/ntsd/sdp-compact) (smaller community, less battle-tested)

**SDP Size Problem:**

Raw WebRTC SDP offers are typically 2-5KB of text. For manual copy-paste exchange, this is unwieldy. Compression pipeline:

```
Raw SDP (~3KB)
  -> sdp-compact (strip redundant fields)
  -> fflate deflate (~800 bytes binary)
  -> lz-string compressToEncodedURIComponent (~1100 chars URL-safe)
```

Expected compression: **60-70% size reduction**, resulting in ~1000-1500 character codes for copy-paste.

**Why lz-string over base64:**

| Encoding | Output Size | URL-Safe | Notes |
|----------|-------------|----------|-------|
| Base64 | 33% bloat | Needs URL-safe variant | Ubiquitous but larger |
| Base85 | 25% bloat | Requires URL-encoding | Negates savings |
| lz-string URI | Compressed + encoded | Native URL-safe | Best of both worlds |

### File Transfer & Compression

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **fflate** (zip/unzip) | 0.8.2 | ZIP archive creation | Native ZIP support, async streaming, same bundle as SDP compression |
| **Native File API** | Browser API | File reading/writing | Blob, ArrayBuffer, File handling |

**Confidence:** HIGH - [fflate GitHub](https://github.com/101arrowz/fflate)

**Rationale:**

fflate includes full ZIP archive support in the same ~31kB max bundle:
- `zip()` / `zipSync()` - Create ZIP archives
- `unzip()` / `unzipSync()` - Extract ZIP archives
- Streaming support for large files
- Web Worker support for non-blocking compression

This eliminates need for separate ZIP library (JSZip at 100KB+).

### STUN Servers (ICE Candidates)

| Server | Port | Provider | Notes |
|--------|------|----------|-------|
| stun:stun.l.google.com | 19302 | Google | Primary, high availability |
| stun:stun1.l.google.com | 19302 | Google | Backup |
| stun:stun2.l.google.com | 19302 | Google | Backup |
| stun:stun.cloudflare.com | 3478 | Cloudflare | Alternative provider |

**Confidence:** HIGH - [VideoSDK STUN Guide](https://www.videosdk.live/developer-hub/stun-turn-server/google-stun-server)

**Configuration:**

```typescript
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const pc = new RTCPeerConnection({ iceServers });
```

**Note:** STUN only helps with NAT traversal for discovering public IP. For symmetric NAT (rare but exists), TURN would be needed. Since Voice Cards targets "zero infrastructure," accept that ~10-15% of connections may fail without TURN.

---

## DataChannel Configuration

### For File Transfer (Large Data)

```typescript
const fileChannel = pc.createDataChannel('file-transfer', {
  ordered: true,      // Ensure chunks arrive in order
  // Don't set maxRetransmits or maxPacketLifeTime - use reliable mode
});

fileChannel.binaryType = 'arraybuffer';  // Better than 'blob' for processing
fileChannel.bufferedAmountLowThreshold = 64 * 1024;  // 64KB threshold
```

**Confidence:** HIGH - [MDN RTCDataChannel](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel)

### For Real-time Sync (Operations)

```typescript
const syncChannel = pc.createDataChannel('sync', {
  ordered: true,      // Operations must be ordered
  // Reliable mode for sync integrity
});
```

### Chunking Strategy

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Chunk size | 16KB | Cross-browser safe maximum |
| Buffer threshold | 64KB | 4 chunks queued before backpressure |
| Max send rate | Monitor bufferedAmount | Prevent memory explosion |

**Backpressure Pattern:**

```typescript
const CHUNK_SIZE = 16 * 1024;  // 16KB
const BUFFER_THRESHOLD = 64 * 1024;  // 64KB

async function sendFile(channel: RTCDataChannel, data: ArrayBuffer) {
  const chunks = Math.ceil(data.byteLength / CHUNK_SIZE);

  for (let i = 0; i < chunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, data.byteLength);
    const chunk = data.slice(start, end);

    // Backpressure: wait if buffer is full
    if (channel.bufferedAmount > BUFFER_THRESHOLD) {
      await new Promise<void>(resolve => {
        channel.onbufferedamountlow = () => {
          channel.onbufferedamountlow = null;
          resolve();
        };
      });
    }

    channel.send(chunk);
  }
}
```

**Confidence:** HIGH - [WebRTC.link DataChannel Guide](https://webrtc.link/en/articles/rtcdatachannel-usage-and-message-size-limits/)

---

## ICE Restart for Auto-Reconnect

```typescript
pc.oniceconnectionstatechange = () => {
  if (pc.iceConnectionState === 'failed') {
    // Immediate restart on failure
    pc.restartIce();
  } else if (pc.iceConnectionState === 'disconnected') {
    // Wait briefly for recovery, then restart
    setTimeout(() => {
      if (pc.iceConnectionState === 'disconnected') {
        pc.restartIce();
      }
    }, 3000);
  }
};
```

**Confidence:** HIGH - [MDN restartIce()](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/restartIce)

**Note:** ICE restart success rate is ~66% per research. For failed restarts, fall back to re-exchanging SDP codes.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| WebRTC wrapper | Native API | @thaunknown/simple-peer | Abstracts SDP access needed for manual exchange |
| WebRTC wrapper | Native API | PeerJS | Requires PeerServer backend |
| Compression | fflate | pako | 5x larger bundle (45KB vs 8KB), slower |
| ZIP creation | fflate | JSZip | 3x larger bundle (100KB+), redundant with fflate |
| URL encoding | lz-string | Base64 | Larger output, lz-string compresses + encodes |
| SDP optimization | sdp-compact | ESDiPi | Less maintained, academic implementation |

---

## Installation

```bash
# Core compression (handles both SDP and file ZIP)
npm install fflate

# URL-safe SDP encoding
npm install lz-string

# Optional: SDP-specific optimization (try without first)
npm install sdp-compact

# TypeScript types
npm install -D @types/lz-string
```

**Note:** fflate includes TypeScript types. No @types needed.

---

## What NOT to Use

### PeerJS
- **Why not:** Requires PeerServer for connection brokering
- **Problem:** Defeats "no backend signaling" requirement
- **Verdict:** Use native WebRTC API instead

### simple-peer (feross/simple-peer)
- **Why not:** Unmaintained since 2021
- **Problem:** No updates for 4 years, known issues unfixed
- **Verdict:** If wrapper needed, use @thaunknown/simple-peer fork

### @thaunknown/simple-peer
- **Why not:** Abstracts SDP in event-driven model
- **Problem:** Manual SDP exchange requires direct control of offer/answer flow
- **Verdict:** Valuable for automated signaling, overkill for manual exchange

### pako
- **Why not:** 45KB bundle vs fflate's 8KB
- **Problem:** 5x larger, slower compression
- **Verdict:** Use fflate for modern projects

### JSZip
- **Why not:** 100KB+ bundle, separate from compression library
- **Problem:** Redundant when fflate handles both compression and ZIP
- **Verdict:** Use fflate's built-in ZIP support

### Base85/Ascii85 for SDP
- **Why not:** Requires URL-encoding that negates size savings
- **Problem:** Special characters (`<`, `>`, `~`) break URLs
- **Verdict:** Use lz-string's URI-safe output

---

## TypeScript Considerations

### Native WebRTC Types

Browser WebRTC APIs have excellent TypeScript support via `lib.dom.d.ts`:

```typescript
// These types are built-in with TypeScript's DOM lib
const pc: RTCPeerConnection;
const channel: RTCDataChannel;
const offer: RTCSessionDescriptionInit;
const candidate: RTCIceCandidate;
```

### Library Types

| Library | Types Included | Notes |
|---------|---------------|-------|
| fflate | Yes | Built-in .d.ts files |
| lz-string | No | Install @types/lz-string |
| sdp-compact | Yes | Written in TypeScript |

---

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| RTCPeerConnection | 23+ | 22+ | 11+ | 15+ |
| RTCDataChannel | 25+ | 22+ | 11+ | 79+ |
| ArrayBuffer in send() | Yes | Yes | Yes | Yes |
| bufferedAmountLowThreshold | Yes | Yes | Yes | Yes |
| restartIce() | 77+ | Yes | Yes | 79+ |

**Baseline:** All modern browsers (2020+) fully support required features.

**Confidence:** HIGH - [MDN Browser Compatibility](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel#browser_compatibility)

---

## Performance Expectations

| Metric | Expected Value | Notes |
|--------|---------------|-------|
| SDP code length | 1000-1500 chars | After compression + encoding |
| File transfer speed | Limited by slowest peer's upload | Typically 1-10 MB/s |
| Connection time | 2-10 seconds | ICE gathering + negotiation |
| Reconnect success | ~66% | Via ICE restart; remainder needs re-exchange |

---

## Sources

**Official Documentation:**
- [MDN: RTCPeerConnection](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection)
- [MDN: RTCDataChannel](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel)
- [MDN: Perfect Negotiation Pattern](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation)
- [MDN: restartIce()](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/restartIce)

**Libraries:**
- [fflate GitHub](https://github.com/101arrowz/fflate) - Compression library
- [lz-string GitHub](https://github.com/pieroxy/lz-string) - URL-safe encoding
- [sdp-compact GitHub](https://github.com/ntsd/sdp-compact) - SDP optimization
- [@thaunknown/simple-peer](https://github.com/thaunknown/simple-peer) - Maintained WebRTC wrapper

**Guides:**
- [WebRTC.link: RTCDataChannel Guide](https://webrtc.link/en/articles/rtcdatachannel-usage-and-message-size-limits/)
- [VideoSDK: STUN Server Guide](https://www.videosdk.live/developer-hub/stun-turn-server/google-stun-server)
- [DEV: Manual SDP Exchange Tutorial](https://dev.to/hexshift/building-a-minimal-webrtc-peer-without-a-signaling-server-using-only-manual-sdp-exchange-mck)
- [webrtcHacks: ICE Restarts](https://medium.com/@fippo/ice-restarts-5d759caceda6)

**Comparisons:**
- [npm-compare: fflate vs pako](https://npm-compare.com/fflate,pako)
- [npm trends: PeerJS vs simple-peer](https://npmtrends.com/peerjs-vs-react-native-webrtc-vs-simple-peer-vs-webrtc)
