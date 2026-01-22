# Domain Pitfalls: WebRTC P2P Sync

**Domain:** WebRTC P2P synchronization for Voice Cards
**Researched:** 2026-01-22
**Context:** Manual SDP exchange, large file transfer (audio blobs), real-time operation sync, browser-only, auto-reconnect, single editor role

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or fundamental architecture problems.

---

### Pitfall 1: Buffer Overflow on Large File Transfer

**What goes wrong:** Sending large audio blobs (100MB+) crashes the data channel. Chrome closes the channel with EMSGSIZE when messages exceed 256KB buffer. Firefox behaves differently, causing cross-browser inconsistencies.

**Why it happens:** The default SCTP buffer is 256KB. Developers often try to send entire files as single messages, or chunk too aggressively without respecting buffer state.

**Consequences:**
- Data channel silently closes mid-transfer
- Chrome crashes at ~3GB memory usage with ArrayBuffer leaks
- Users lose sync with no clear error message
- Firefox-to-Chrome transfers fail at different thresholds than Chrome-to-Chrome

**Warning signs:**
- `bufferedAmount` grows without clearing
- `RTCDataChannel` closes unexpectedly during transfer
- Memory usage spikes during file operations
- Works in testing (small files) but fails in production (large projects)

**Prevention:**
1. Chunk files to 16KB (cross-browser safe) or 64KB maximum (Chrome/Firefox only)
2. Monitor `bufferedAmount` before each send
3. Use `bufferedamountlow` event for backpressure control
4. Set `bufferedAmountLowThreshold` appropriately (e.g., 64KB)
5. Implement send queue with pause/resume based on buffer state
6. For files >2GB, use Writable Streams API with chunked reading

**Code pattern:**
```javascript
const CHUNK_SIZE = 16384; // 16KB - safe cross-browser
const MAX_BUFFERED = 262144; // 256KB

async function sendFile(channel, file) {
  const reader = file.stream().getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Wait for buffer to clear before sending more
    while (channel.bufferedAmount > MAX_BUFFERED) {
      await new Promise(resolve => {
        channel.onbufferedamountlow = resolve;
      });
    }

    channel.send(value);
  }
}
```

**Phase to address:** Phase 1 (Foundation) - Must be architected correctly from the start

**Sources:**
- [WebRTC.link RTCDataChannel Guide](https://webrtc.link/en/articles/rtcdatachannel-usage-and-message-size-limits/)
- [Mozilla Large Data Channel Messages](https://blog.mozilla.org/webrtc/large-data-channel-messages/)
- [Demystifying WebRTC DC Size Limits](https://lgrahl.de/articles/demystifying-webrtc-dc-size-limit.html)
- [PeerJS Memory Leak Issue #134](https://github.com/peers/peerjs/issues/134)

---

### Pitfall 2: Manual SDP Exchange Timeout

**What goes wrong:** ICE candidates expire before the manual copy/paste exchange completes. Connection fails even with valid SDP because candidates have timed out.

**Why it happens:** ICE gathering starts immediately when `setLocalDescription` is called. If the user takes 30+ seconds to copy/paste the SDP to the other peer, STUN allocations may have timed out.

**Consequences:**
- Connection fails with cryptic ICE errors
- Users blame the app when it's timing-related
- Works in testing (fast exchange) but fails in real use (slow human copy/paste)
- Inconsistent behavior makes debugging difficult

**Warning signs:**
- ICE connection state goes to "failed" after successful SDP exchange
- Works when done quickly, fails when exchange takes >30 seconds
- Error 701: "STUN allocate request timed out"
- ICE gathering completes but no valid candidates remain

**Prevention:**
1. Wait for ICE gathering to complete before showing SDP to user (non-trickle ICE)
2. Include all candidates in the SDP offer/answer (complete gathering)
3. Display clear timer/countdown showing how long the SDP is valid
4. Consider QR code or other faster exchange mechanisms
5. On timeout, allow regenerating a fresh offer
6. Document the time-sensitive nature prominently in UI

**Implementation approach:**
```javascript
// Wait for ICE gathering to complete
pc.onicegatheringstatechange = () => {
  if (pc.iceGatheringState === 'complete') {
    // NOW show the SDP to user for copying
    showSdpForCopy(pc.localDescription.sdp);
  }
};

// Add timeout warning
setTimeout(() => {
  showWarning('This connection code expires in 2 minutes');
}, 60000);
```

**Phase to address:** Phase 1 (Foundation) - Core connection establishment

**Sources:**
- [Manual SDP Exchange Tutorial](https://dev.to/hexshift/building-a-minimal-webrtc-peer-without-a-signaling-server-using-only-manual-sdp-exchange-mck)
- [WebRTC ICE Timeout Discussion](https://groups.google.com/g/discuss-webrtc/c/rKDoLqDe9Z8)

---

### Pitfall 3: Symmetric NAT Blocking Without TURN Fallback

**What goes wrong:** Direct P2P connection fails for 45% of users behind symmetric NATs. With no signaling server and no TURN, these users simply cannot connect.

**Why it happens:** Manual SDP exchange implies no server infrastructure. Developers skip TURN thinking "it's P2P, we don't need servers." But symmetric NATs require relay.

**Consequences:**
- Nearly half of users cannot establish connections
- Enterprise/corporate users almost always blocked
- Mobile users on carrier NAT often blocked
- App appears "broken" with no workaround

**Warning signs:**
- ICE connection stuck in "checking" state indefinitely
- Works on same network but fails across networks
- Works at home but fails at office
- Only host candidates gathered, no server-reflexive

**Prevention:**
1. Accept that "serverless" P2P still needs STUN at minimum
2. For manual SDP, inform users about NAT limitations upfront
3. Provide diagnostic tool showing NAT type
4. Consider fallback: "If direct fails, share project via export"
5. Document known limitations clearly
6. Use multiple STUN servers for redundancy

**Reality check:**
- ~80% of WebRTC failures stem from network/firewall issues
- Without TURN, you're accepting that some user pairs simply cannot connect
- This may be acceptable for Voice Cards if export/import is the fallback

**Diagnostic approach:**
```javascript
// Check gathered candidate types
pc.onicecandidate = (e) => {
  if (e.candidate) {
    const type = e.candidate.type; // 'host', 'srflx', 'relay'
    console.log('Candidate type:', type);
    // If only 'host' candidates, NAT traversal will likely fail
  }
};
```

**Phase to address:** Phase 1 (Foundation) - Must set expectations early

**Sources:**
- [WebRTC NAT Traversal Guide](https://www.nihardaily.com/168-webrtc-nat-traversal-understanding-stun-turn-and-ice)
- [Troubleshooting ICE Candidates](https://moldstud.com/articles/p-troubleshooting-webrtc-ice-candidates-common-issues-and-solutions-explained)
- [WebRTC.ventures Complexity Analysis](https://webrtc.ventures/2025/08/why-webrtc-remains-deceptively-complex-in-2025/)

---

### Pitfall 4: Data Channel State Race Conditions

**What goes wrong:** Code sends data before channel is truly open. The `onopen` event fires inconsistently across browsers. Channel appears "connecting" but data flows anyway (or doesn't).

**Why it happens:** Browser implementations differ. On some platforms, `onopen` doesn't fire until after first message. Race conditions occur when setting up event handlers after channel creation.

**Consequences:**
- Messages lost silently on connection start
- Inconsistent behavior across Chrome/Firefox/Safari
- State machine violations cause cryptic errors
- "Works in Chrome, fails in Safari" syndrome

**Warning signs:**
- `readyState` stuck on "connecting" but channel works
- `onopen` never fires on one side of connection
- First few messages after connection are lost
- Behavior differs between offer-side and answer-side peers

**Prevention:**
1. Always wait for `readyState === 'open'` before sending
2. Register `onopen` handler BEFORE creating offer/answer
3. Queue messages if channel not yet open
4. Use negotiated channels (both sides create with same ID)
5. Add explicit handshake after channel opens

**Robust pattern:**
```javascript
function createReliableChannel(pc, name) {
  const channel = pc.createDataChannel(name, { negotiated: true, id: 0 });
  const messageQueue = [];
  let isReady = false;

  channel.onopen = () => {
    isReady = true;
    // Flush queued messages
    messageQueue.forEach(msg => channel.send(msg));
    messageQueue.length = 0;
  };

  return {
    send(data) {
      if (isReady && channel.readyState === 'open') {
        channel.send(data);
      } else {
        messageQueue.push(data);
      }
    },
    onmessage: (handler) => { channel.onmessage = handler; }
  };
}
```

**Phase to address:** Phase 1 (Foundation) - Core data channel abstraction

**Sources:**
- [MDN RTCDataChannel readyState](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/readyState)
- [WebRTC.org Data Channels](https://webrtc.org/getting-started/data-channels)
- [React Native WebRTC Issue #1498](https://github.com/react-native-webrtc/react-native-webrtc/issues/1498)

---

## Moderate Pitfalls

Mistakes that cause delays, bugs, or technical debt.

---

### Pitfall 5: Reconnection Logic Recreates Everything

**What goes wrong:** When connection drops, naive implementation destroys and recreates entire peer connection. This loses channel state, requires new SDP exchange, and disrupts user experience.

**Why it happens:** Developers don't know about `restartIce()` or implement it incorrectly. They treat "failed" and "disconnected" states the same way.

**Consequences:**
- Every network hiccup requires full manual SDP re-exchange
- Users must copy/paste codes again for any disruption
- Brief disconnects become major interruptions
- Connection history/state lost on every reconnect

**Warning signs:**
- Full reconnection flow triggered on every network change
- Users complaining about frequent "reconnect" prompts
- WiFi-to-cellular handoff always breaks connection
- `disconnected` state immediately triggers destruction

**Prevention:**
1. Use `restartIce()` for ICE failures (not full recreation)
2. Distinguish "disconnected" (temporary) from "failed" (requires action)
3. Implement exponential backoff for reconnection attempts
4. Keep data channel alive during ICE restart
5. Only require new SDP exchange when ICE restart fails

**ICE restart pattern:**
```javascript
pc.oniceconnectionstatechange = () => {
  if (pc.iceConnectionState === 'disconnected') {
    // Temporary - wait before acting
    setTimeout(() => {
      if (pc.iceConnectionState === 'disconnected') {
        pc.restartIce(); // Try ICE restart first
      }
    }, 3000);
  }

  if (pc.iceConnectionState === 'failed') {
    pc.restartIce(); // Immediate ICE restart
    // If this triggers negotiationneeded, handle it
    // Only if ICE restart fails, consider full reconnection
  }
};
```

**Phase to address:** Phase 2 (Reconnection) - After basic connection works

**Sources:**
- [MDN restartIce()](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/restartIce)
- [BlogGeek Session Disconnections](https://bloggeek.me/handling-session-disconnections-in-webrtc/)
- [WebRTC.ventures Reconnection Guide](https://webrtc.ventures/2023/06/implementing-a-reconnection-mechanism-for-webrtc-mobile-applications/)

---

### Pitfall 6: Wrong Channel Configuration for Use Case

**What goes wrong:** Using ordered+reliable channel for real-time sync causes head-of-line blocking. Using unordered+unreliable for file transfer causes data loss.

**Why it happens:** Developers use default settings (ordered: true, reliable) for everything, not understanding the tradeoffs.

**Consequences:**
- Real-time operations feel laggy (head-of-line blocking)
- File transfers have missing chunks
- Mixed workloads perform poorly
- One slow message blocks all subsequent messages

**Warning signs:**
- UI updates feel delayed even on good connections
- Packet loss causes noticeable sync delays
- File transfers occasionally have corruption
- Performance worse than expected given bandwidth

**Prevention:**
1. Use separate channels for different data types:
   - Operations channel: ordered: true, reliable (for sync integrity)
   - Large file channel: ordered: true, reliable (for completeness) OR ordered: false if speed critical
2. For Voice Cards with single editor role:
   - Operations: ordered + reliable (state must be consistent)
   - Audio blobs: ordered + reliable (files must be complete)
3. Consider maxRetransmits for time-sensitive but lossy-ok data

**Configuration guide:**
```javascript
// For operation sync (must be ordered and complete)
const opsChannel = pc.createDataChannel('operations', {
  ordered: true,
  // Default reliable - no maxRetransmits or maxPacketLifeTime
});

// For large file transfer (must be complete, order less critical)
const fileChannel = pc.createDataChannel('files', {
  ordered: true,  // Simpler reassembly
  // Reliable for files - we need all chunks
});

// For ephemeral state (cursor position, etc.) - if needed
const cursorChannel = pc.createDataChannel('cursors', {
  ordered: false,
  maxRetransmits: 0  // Fire and forget
});
```

**Phase to address:** Phase 1 (Foundation) - Channel architecture decision

**Sources:**
- [WebRTC for the Curious - Data Communication](https://webrtcforthecurious.com/docs/07-data-communication/)
- [RFC 8831 WebRTC Data Channels](https://datatracker.ietf.org/doc/html/rfc8831)
- [James Fisher - DataChannel Reliability](https://jameshfisher.com/2017/01/17/webrtc-datachannel-reliability/)

---

### Pitfall 7: Browser Background Tab Throttling

**What goes wrong:** When user switches tabs, browser throttles JavaScript execution. Data channel messages queue up, then burst when tab becomes active. This can appear as disconnection or cause state synchronization issues.

**Why it happens:** Browsers aggressively throttle background tabs to save resources. WebRTC connections may survive but message processing doesn't.

**Consequences:**
- Sync appears broken when user returns to tab
- Messages arrive in bursts causing race conditions
- ICE keepalives may fail, dropping connection
- User returns to corrupted or stale state

**Warning signs:**
- Problems only occur after tab was backgrounded
- Burst of messages when tab regains focus
- Connection drops after ~60 seconds in background
- Works fine with tab always focused

**Prevention:**
1. Implement heartbeat mechanism to detect tab backgrounding
2. Show "reconnecting" state when returning from background
3. Consider pausing sync when tab backgrounded, resuming on focus
4. Use `visibilitychange` event to handle state transitions
5. Warn users that sync requires active tab

**Handling pattern:**
```javascript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Tab backgrounded - note the time
    backgroundedAt = Date.now();
  } else {
    // Tab visible again
    const backgroundDuration = Date.now() - backgroundedAt;
    if (backgroundDuration > 30000) {
      // Was backgrounded for >30s, verify connection health
      checkConnectionHealth();
    }
  }
});
```

**Phase to address:** Phase 2 (Reliability) - After basic sync works

**Sources:**
- [GitHub js-ipfs Throttling Issue](https://github.com/ipfs/js-ipfs/issues/840)
- [discuss-webrtc Throttling Thread](https://groups.google.com/g/discuss-webrtc/c/9yxjg86Ixng)
- [Problems with WebRTC Collection](https://github.com/steveseguin/problems-with-webRTC)

---

### Pitfall 8: Safari-Specific WebRTC Quirks

**What goes wrong:** Code works in Chrome/Firefox but fails in Safari. Safari implements only the modern Promise-based API, has stricter security requirements, and different codec support.

**Why it happens:** Safari joined WebRTC later and implemented only the modern spec. Chrome/Firefox have legacy compatibility that Safari lacks.

**Consequences:**
- "Works on my machine" but fails for Safari users
- iOS users (all browsers use WebKit) cannot connect
- Cryptic errors that don't appear in other browsers
- Transceivers required for certain operations

**Warning signs:**
- Testing only in Chrome during development
- Callback-based WebRTC API usage
- No transceiver setup for receive-only channels
- ICE candidates restricted in Safari Developer settings

**Prevention:**
1. Test in Safari early and often
2. Use only Promise-based WebRTC API (not callbacks)
3. In Safari Debug menu: Develop > WebRTC > Disable ICE Candidate Restrictions (for testing)
4. Use adapter.js for normalization if needed
5. For data-channel only (no media), Safari is more compatible

**Safari-specific checks:**
```javascript
// Safari detection for special handling
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// Safari requires explicit permissions in some contexts
if (isSafari) {
  // May need user gesture for certain operations
  // Data channels generally work without special handling
}
```

**Phase to address:** Phase 1 (Foundation) - Test from the start

**Sources:**
- [Guide to Safari WebRTC](https://webrtchacks.com/guide-to-safari-webrtc/)
- [WebRTC Browser Support 2025](https://antmedia.io/webrtc-browser-support/)
- [Kirsle Safari WebRTC Journey](https://www.kirsle.net/journey-to-get-webrtc-working-well-in-safari)

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable.

---

### Pitfall 9: Single Editor Role Race Condition

**What goes wrong:** Both peers briefly think they're the editor during connection setup. Conflicting operations are sent before role is established.

**Why it happens:** Role assignment happens after connection, creating a window where both sides may act as editor.

**Consequences:**
- Brief data corruption on connection
- Confusing UI state
- Operations may conflict before role established
- Hard to reproduce, intermittent bug

**Warning signs:**
- Occasional duplicate or conflicting operations at session start
- Both sides show "editing" UI briefly
- State diverges immediately after connection

**Prevention:**
1. Establish role in SDP metadata or first message BEFORE any operations
2. Include role in connection offer (offerer = viewer, answerer = editor, or explicit)
3. No operations sent until role handshake complete
4. Optimistic lock: editor role requires acknowledgment

**Pattern:**
```javascript
// Include role in initial handshake
const HANDSHAKE_MSG = { type: 'handshake', role: 'viewer' };

channel.onopen = () => {
  // First message establishes role
  channel.send(JSON.stringify(HANDSHAKE_MSG));
  awaitingRoleConfirmation = true;
};

channel.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'handshake') {
    // Role established, now can sync
    establishedRole = msg.role === 'viewer' ? 'editor' : 'viewer';
    awaitingRoleConfirmation = false;
  } else if (!awaitingRoleConfirmation) {
    // Process normal messages only after handshake
    processOperation(msg);
  }
};
```

**Phase to address:** Phase 1 (Foundation) - Part of connection protocol

---

### Pitfall 10: Memory Leaks from Unclosed Connections

**What goes wrong:** Peer connections and data channels not properly closed accumulate memory. Long sessions or repeated reconnects cause browser slowdown/crash.

**Why it happens:** Developers forget to call `close()` on channels and connections, or don't clean up event handlers.

**Consequences:**
- Memory grows over session lifetime
- Browser becomes sluggish after hours of use
- Eventual crash on long editing sessions
- Hard to trace source of leak

**Warning signs:**
- Chrome task manager shows growing memory for tab
- Performance degrades over time
- Problems worse with repeated connect/disconnect cycles

**Prevention:**
1. Always call `channel.close()` and `pc.close()` on cleanup
2. Remove all event handlers when closing
3. Implement cleanup in `beforeunload` and component unmount
4. Use weak references or explicit cleanup patterns

**Cleanup pattern:**
```javascript
function cleanupConnection(pc, channels) {
  channels.forEach(ch => {
    ch.onopen = null;
    ch.onclose = null;
    ch.onmessage = null;
    ch.onerror = null;
    if (ch.readyState !== 'closed') ch.close();
  });

  pc.onicecandidate = null;
  pc.oniceconnectionstatechange = null;
  pc.ondatachannel = null;
  pc.close();
}

window.addEventListener('beforeunload', () => {
  cleanupConnection(peerConnection, [opsChannel, fileChannel]);
});
```

**Phase to address:** Phase 1 (Foundation) - Good hygiene from start

**Sources:**
- [PeerJS Memory Leak Issues](https://github.com/peers/peerjs/issues/134)
- [node-webrtc Memory Leaks](https://github.com/node-webrtc/node-webrtc/issues/304)

---

### Pitfall 11: No Progress Indication for Large Transfers

**What goes wrong:** User initiates sync of 100MB project, UI shows nothing for minutes. User thinks it's frozen, refreshes, loses transfer.

**Why it happens:** Chunked transfer has no built-in progress API. Developers forget to implement custom progress tracking.

**Consequences:**
- Users cancel working transfers
- Support requests about "frozen" sync
- Users avoid syncing large projects

**Prevention:**
1. Track bytes sent vs total bytes
2. Show progress bar during file transfers
3. Show transfer speed
4. Allow cancellation with confirmation

**Phase to address:** Phase 2 (UX) - After basic transfer works

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Initial connection | SDP timeout (2), NAT blocking (3) | Implement non-trickle ICE, set clear expectations |
| Data channel setup | State race conditions (4) | Use negotiated channels, message queue pattern |
| File transfer | Buffer overflow (1), no progress (11) | Chunking with backpressure, progress UI |
| Real-time sync | Wrong channel config (6), editor race (9) | Separate channels, role handshake |
| Reconnection | Full recreation (5), background throttle (7) | ICE restart, visibility handling |
| Cross-browser | Safari quirks (8) | Test early, Promise API only |
| Long sessions | Memory leaks (10) | Explicit cleanup on all transitions |

---

## Voice Cards Specific Considerations

Given the project context:

1. **Manual SDP exchange + large files = HIGH RISK**
   - Users will copy/paste slowly (SDP timeout risk)
   - Audio projects are large (buffer overflow risk)
   - Priority: Pitfalls 1, 2

2. **Single editor role simplifies conflict resolution**
   - No CRDT/OT complexity needed
   - But role establishment still needs handshake (Pitfall 9)

3. **Browser-only means Safari matters**
   - iOS users use WebKit regardless of browser
   - Test Safari from day one (Pitfall 8)

4. **Auto-reconnect requirement**
   - Must use ICE restart, not full recreation
   - Handle background throttling (Pitfalls 5, 7)

---

## Research Confidence

| Pitfall | Confidence | Basis |
|---------|------------|-------|
| Buffer overflow | HIGH | Official Mozilla docs, multiple GitHub issues |
| SDP timeout | MEDIUM | Community reports, single official source |
| NAT blocking | HIGH | Multiple official sources, statistics cited |
| Channel state race | MEDIUM | GitHub issues, community reports |
| Reconnection | HIGH | MDN documentation, official samples |
| Channel config | HIGH | RFC documentation, MDN |
| Background throttle | MEDIUM | GitHub issues, community discussion |
| Safari quirks | HIGH | Multiple authoritative guides |
| Editor race | LOW | General distributed systems knowledge |
| Memory leaks | MEDIUM | GitHub issues from multiple projects |
| Progress indication | LOW | UX best practice, not WebRTC-specific |

---

## Sources Summary

**Official Documentation:**
- [MDN WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [WebRTC.org Getting Started](https://webrtc.org/getting-started/)
- [RFC 8831 - WebRTC Data Channels](https://datatracker.ietf.org/doc/html/rfc8831)

**Technical Deep Dives:**
- [WebRTC.link RTCDataChannel Guide](https://webrtc.link/en/articles/rtcdatachannel-usage-and-message-size-limits/)
- [Mozilla Large Data Channel Messages](https://blog.mozilla.org/webrtc/large-data-channel-messages/)
- [WebRTC for the Curious](https://webrtcforthecurious.com/)

**Troubleshooting Guides:**
- [AddPipe WebRTC Troubleshooting](https://blog.addpipe.com/troubleshooting-webrtc-connection-issues/)
- [webrtcHacks Safari Guide](https://webrtchacks.com/guide-to-safari-webrtc/)
- [WebRTC.ventures Complexity Analysis 2025](https://webrtc.ventures/2025/08/why-webrtc-remains-deceptively-complex-in-2025/)
