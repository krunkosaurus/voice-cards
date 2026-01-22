# Project Research Summary

**Project:** Voice Cards - WebRTC P2P Sync Milestone
**Domain:** Real-time peer-to-peer data synchronization for browser-based audio recording application
**Researched:** 2026-01-22
**Confidence:** HIGH

## Executive Summary

Voice Cards is adding WebRTC peer-to-peer sync to enable device handoff (continue work on phone that was started on desktop) and collaboration (work with a friend on the same project). The recommended approach uses native WebRTC APIs with manual SDP exchange, avoiding signaling server infrastructure to preserve the "nothing leaves your device" privacy promise. This manual exchange pattern requires careful attention to timeout issues and user experience, but provides full control over the P2P connection lifecycle.

The architecture centers on a layered approach: a connection layer managing RTCPeerConnection lifecycle, a sync layer translating app actions into messages, and integration with the existing React Context/reducer pattern. File transfer uses chunked sending with backpressure control (16KB chunks) to prevent buffer overflow, while real-time operation sync uses a separate data channel. The single-editor model (turn-taking rather than simultaneous editing) dramatically simplifies the implementation by eliminating conflict resolution complexity.

The primary risks are buffer overflow on large file transfers, SDP timeout during manual copy-paste exchange, and NAT traversal failures for 10-15% of users without TURN servers. These are mitigated through proper chunking, non-trickle ICE gathering, and setting clear user expectations about network limitations. Cross-browser testing (especially Safari) must begin immediately, as Safari implements only modern Promise-based APIs and has platform-specific quirks affecting iOS users.

## Key Findings

### Recommended Stack

Use native WebRTC APIs rather than wrapper libraries, as manual SDP exchange requires direct control over offer/answer flow that wrappers abstract away. PeerJS requires a signaling server (defeats serverless goal), while simple-peer abstracts SDP in ways that complicate manual exchange. For compression, fflate (8KB bundle) handles both SDP compression and ZIP archives, replacing heavier alternatives like pako (45KB) and JSZip (100KB+). SDP encoding uses lz-string's compressToEncodedURIComponent for URL-safe output, reducing typical 3KB SDP offers to ~1000-1500 character codes.

**Core technologies:**
- **Native RTCPeerConnection/RTCDataChannel**: Direct control needed for manual SDP exchange pattern
- **fflate (0.8.2)**: DEFLATE compression for both SDP and file archives, 60% faster than alternatives
- **lz-string (1.5.0)**: URL-safe SDP encoding without base64 bloat
- **Google/Cloudflare STUN servers**: NAT traversal for discovering public IPs (no TURN = accept ~10-15% connection failures)

**Critical version notes:** None — using browser native APIs and stable library versions.

### Expected Features

Voice Cards has already decided on key design constraints: manual code exchange (no signaling server), full project overwrite on sync (no merge), single editor role (turn-taking), and real-time bidirectional sync after initial connection.

**Must have (table stakes):**
- Clear SDP exchange flow with step-by-step UI and copy buttons
- Connection status indicator (connecting/connected/disconnected/error states)
- Transfer progress feedback with determinate progress bar
- Sync completion confirmation so users know when safe to disconnect
- Graceful disconnect button that cleanly closes connections
- Error messages for common failures (invalid code, timeout, NAT blocking)

**Should have (competitive):**
- QR code for mobile pairing (eliminates copy-paste friction for phone-to-desktop)
- Role indicator showing who is Editor vs Viewer
- Role swap button for transferring edit permissions
- Overwrite confirmation dialog ("This will replace 5 cards on your device")
- Auto-reconnection via ICE restart when connection drops

**Defer (v2+):**
- Connection quality indicator (requires WebRTC stats API)
- Sync history/log of changes
- Selective sync (choose which cards to sync)
- Compression optimization (premature until tested with real projects)

**Anti-features (deliberately avoid):**
- Multi-user simultaneous editing (CRDT complexity unnecessary for single-editor model)
- Central signaling server (breaks privacy promise)
- Persistent peer identity (no accounts philosophy)
- Cloud relay fallback (breaks privacy, adds cost)

### Architecture Approach

The architecture uses a layered separation: connection layer (RTCPeerConnection management, SDP encoding), sync layer (action broadcast, editor role), and application layer (existing ProjectContext with minimal changes). This keeps WebRTC concerns isolated from app logic. The sync layer wraps existing ProjectContext actions to intercept and broadcast when connected, while also applying incoming remote actions to local state.

**Major components:**
1. **WebRTCConnectionService** — Manages peer connection lifecycle, SDP offer/answer generation, ICE handling, reconnection logic
2. **SyncContext** — Wraps ProjectContext to add sync-aware action dispatch, handles editor role management and initial project sync
3. **AudioTransferService** — Chunks audio blobs (16KB), tracks progress, handles reassembly, manages backpressure via bufferedAmount monitoring
4. **SDP Codec** — Encodes SDP to shareable codes (fflate + lz-string), validates decoded codes
5. **Dual DataChannels** — Separate control channel (metadata, operations) and binary channel (audio chunks) to prevent large transfers blocking operations

**Key patterns:**
- Connection state machine with explicit states (disconnected, creating_offer, connecting, connected, reconnecting, failed)
- Heartbeat ping/pong every 5s to detect silent failures
- Idempotent operations with UUID tracking to prevent duplicate application
- Optimistic local updates with pending confirmation for sync operations
- ICE restart for reconnection (not full peer connection recreation)

### Critical Pitfalls

Research identified 11 pitfalls ranging from critical (data loss, architectural rework) to minor (annoyance). The top 5 require immediate attention in Phase 1 architecture decisions.

1. **Buffer Overflow on Large File Transfer** — Sending large audio blobs without chunking crashes data channels. Must chunk to 16KB, monitor bufferedAmount before each send, use bufferedamountlow event for backpressure. Chrome closes channels with EMSGSIZE at 256KB buffer; Firefox behaves differently causing cross-browser inconsistencies.

2. **Manual SDP Timeout** — ICE candidates expire if user takes >30s to copy/paste codes between devices. Must use non-trickle ICE (wait for gathering complete before showing SDP), display countdown timer, allow regenerating offers. Works in fast testing but fails in real slow human exchange.

3. **Symmetric NAT Blocking** — ~10-15% of users (corporate networks, carrier NAT) cannot connect without TURN servers. Must set clear expectations upfront, provide NAT diagnostics, offer export/import fallback. Serverless P2P means accepting some connections will fail.

4. **Data Channel State Race Conditions** — Sending before channel truly open causes lost messages. Browser implementations differ on onopen timing. Must wait for readyState === 'open', register handlers before offer/answer, queue messages if channel not ready.

5. **Safari-Specific Quirks** — Safari (and all iOS browsers using WebKit) implements only modern Promise-based API, has stricter security, different codec support. Must test Safari from day one, use only Promise API (not callbacks), enables ICE Candidate Restrictions in Debug menu during development.

**Secondary risks:**
- Reconnection logic that recreates entire peer connection instead of using restartIce() forces users to re-exchange SDP on every hiccup
- Background tab throttling queues messages then bursts them on focus, causing state synchronization issues
- Single editor role race during handshake requires explicit role establishment before any operations
- Memory leaks from unclosed connections accumulate over long sessions

## Implications for Roadmap

Based on research, the implementation naturally splits into 6 phases with clear dependencies. Early phases establish architectural foundations that later phases build upon. The most critical pitfalls (buffer overflow, SDP timeout, NAT blocking) must be addressed in Phase 1 to avoid rework.

### Phase 1: Connection Foundation
**Rationale:** Everything depends on reliable P2P connection. Manual SDP exchange is unique to this project and needs custom UI/UX. Must get connection state machine right before any data flows.

**Delivers:**
- WebRTCConnectionService with RTCPeerConnection lifecycle management
- SDP codec (compression, encoding, validation)
- Connection state machine (disconnected → creating_offer → awaiting_answer → connecting → connected)
- Manual SDP exchange UI with clear step-by-step flow
- Connection status indicator component
- Error handling for common failures (invalid code, timeout, NAT)

**Addresses features:**
- Clear SDP exchange flow (table stakes)
- Connection status indicator (table stakes)
- Error messages (table stakes)

**Avoids pitfalls:**
- Pitfall 2: Manual SDP timeout — implement non-trickle ICE, show code only after gathering complete
- Pitfall 3: NAT blocking — use STUN servers, set expectations, provide diagnostics
- Pitfall 4: Channel state races — proper ready state checks, message queueing
- Pitfall 8: Safari quirks — test early, Promise-based API only

**Research flag:** Standard patterns well-documented in MDN and WebRTC samples. Skip research-phase.

### Phase 2: DataChannel Architecture
**Rationale:** Must establish dual-channel pattern (control + binary) and chunking strategy before any data transfer. Critical pitfall (buffer overflow) makes or breaks file transfer.

**Delivers:**
- Dual DataChannel setup (control channel for metadata, binary channel for files)
- AudioTransferService with chunking (16KB), backpressure control, progress tracking
- Blob reassembly logic with validation
- Message protocol definition (control messages, binary chunk headers)
- Message validation/sanitization

**Addresses features:**
- Transfer progress feedback (table stakes)
- Foundation for all data sync

**Avoids pitfalls:**
- Pitfall 1: Buffer overflow — 16KB chunks, bufferedAmount monitoring, backpressure control
- Pitfall 6: Wrong channel config — separate ordered+reliable channels for different data types
- Pitfall 10: Memory leaks — explicit cleanup of channels and handlers

**Research flag:** Standard patterns documented in official WebRTC samples. Skip research-phase.

### Phase 3: Initial Project Sync
**Rationale:** Must sync full project state before real-time operations make sense. This is the "device handoff" core use case. Reuses existing export/import serialization logic.

**Delivers:**
- SyncContext wrapping ProjectContext
- Initial sync protocol (metadata first, then audio blobs)
- Project serialization/deserialization for sync
- Progress UI showing cards syncing
- Sync completion confirmation
- Overwrite confirmation dialog

**Addresses features:**
- Sync completion confirmation (table stakes)
- Overwrite confirmation (should have)
- Core device handoff functionality

**Avoids pitfalls:**
- Pitfall 9: Editor role race — establish role in first message before operations

**Research flag:** Standard patterns. Skip research-phase.

### Phase 4: Real-Time Operation Sync
**Rationale:** After initial sync works, layer on real-time updates for collaboration. Builds on connection and channel infrastructure.

**Delivers:**
- Sync-aware action wrappers (add/update/delete/reorder cards)
- Operation broadcast when connected and isEditor
- Remote operation application to local reducer
- Operation deduplication (idempotent with UUID tracking)
- Optimistic local updates with pending state
- Sync indicator showing live sync status

**Addresses features:**
- Real-time bidirectional sync after connection
- Core collaboration functionality

**Avoids pitfalls:**
- Pitfall 2: Anti-pattern of sending full state — send operation deltas only
- Pitfall 5: No operation ordering — include timestamps, causal ordering

**Research flag:** Standard patterns. Skip research-phase.

### Phase 5: Editor Role Management
**Rationale:** Single-editor model is decided. Now implement the role swap UX. Can be deferred if needed (app works with assumption that initiator is always viewer, responder is always editor).

**Delivers:**
- Role indicator badge ("You are editing" / "You are viewing")
- Role swap request/grant protocol
- UI enforcement of edit permissions (disable actions when viewer)
- Role handshake on connection establishment

**Addresses features:**
- Role indicator (should have)
- Role swap button (should have)

**Avoids pitfalls:**
- Pitfall 9: Editor role race — explicit handshake before operations

**Research flag:** Standard patterns. Skip research-phase. (Could defer to post-MVP if time constrained)

### Phase 6: Reconnection & Polish
**Rationale:** Auto-reconnect is "should have" that improves UX but isn't critical for MVP. Handles network hiccups gracefully.

**Delivers:**
- ICE restart on disconnection (not full recreation)
- Connection health monitoring (heartbeat ping/pong)
- Exponential backoff for reconnection attempts
- "Reconnecting..." UI state
- Visibility change handling for background tabs
- Graceful disconnect button

**Addresses features:**
- Auto-reconnection via ICE restart (should have)
- Graceful disconnect (table stakes)

**Avoids pitfalls:**
- Pitfall 5: Full recreation instead of ICE restart — use restartIce() properly
- Pitfall 7: Background tab throttling — handle visibility changes

**Research flag:** Standard patterns documented in MDN. Skip research-phase.

### Phase Ordering Rationale

**Sequential dependencies:**
- Phases 1-2 establish foundation (connection + channels) that everything builds on
- Phase 3 (initial sync) must work before Phase 4 (real-time) makes sense
- Phase 5 (role management) can be deferred — app works without it by assuming roles
- Phase 6 (reconnection) is polish — core functionality works without it

**Grouping logic:**
- Phases 1-2 are pure infrastructure (no app logic)
- Phases 3-4 integrate with existing ProjectContext
- Phases 5-6 are UX polish

**Pitfall mitigation:**
- Critical pitfalls (1, 2, 3, 4) addressed in Phases 1-2 before any real data flows
- Moderate pitfalls (5, 6, 7, 9) addressed in respective phases
- Minor pitfalls (10, 11) woven into implementation

**Risk-driven ordering:**
- Highest risk items first (connection, chunking) to fail fast if fundamental issues
- Lower risk items later (role swap, reconnection polish)

### Research Flags

**All phases use standard patterns — skip research-phase for all:**
- Phase 1: Well-documented MDN/WebRTC.org connection patterns
- Phase 2: Official WebRTC samples cover chunking/backpressure
- Phase 3: Standard state serialization (existing export logic)
- Phase 4: Standard pub/sub operation broadcast pattern
- Phase 5: Straightforward role management state machine
- Phase 6: MDN documents ICE restart and reconnection

**No niche domains or sparse documentation.** All WebRTC patterns have extensive official documentation and multiple working examples.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Native WebRTC APIs verified via MDN, library choices verified via GitHub/npm, chunk sizes verified via cross-browser compatibility docs |
| Features | MEDIUM | Table stakes inferred from similar P2P products (ShareDrop, PairDrop), differentiators validated against UX patterns, but actual Voice Cards user needs may differ |
| Architecture | HIGH | Patterns verified via official WebRTC samples, React integration patterns standard, separation of concerns based on established practices |
| Pitfalls | HIGH | Critical pitfalls documented in official Mozilla blog posts and MDN, moderate pitfalls corroborated across multiple GitHub issues, Safari quirks verified via webrtcHacks guides |

**Overall confidence:** HIGH

The technical implementation is well-understood with excellent documentation. The main uncertainty is feature prioritization (what Voice Cards users actually want vs what similar products offer), but the decided constraints (manual exchange, single editor, full overwrite) simplify implementation significantly.

### Gaps to Address

**User expectations for manual SDP exchange:**
- Research documents technical feasibility but UX friction of copy-paste codes is unknown
- Gap: Need user testing of SDP exchange flow to validate if QR codes are essential vs nice-to-have
- Handling: Implement copy-paste first, add QR codes if user feedback shows high friction

**NAT traversal success rate:**
- Research cites ~10-15% failure rate without TURN, but specific Voice Cards network environments unknown
- Gap: Actual connection success rate for target users
- Handling: Implement connection diagnostics, track failure rates in production, document export/import fallback clearly

**Project size impact on sync time:**
- Research covers chunking/backpressure mechanics but doesn't predict Voice Cards project sizes
- Gap: Typical project size (number of cards, audio duration, total MB)
- Handling: Test with realistic projects (10-50 cards with 2-10 minute audio each), optimize chunk size if needed

**Safari-specific behavior:**
- Research documents Safari quirks but actual testing needed to uncover integration issues
- Gap: Safari behavior with existing Voice Cards IndexedDB and audio handling
- Handling: Safari testing from Phase 1, allocate buffer for Safari-specific debugging

**Role swap UX:**
- Research shows patterns but Voice Cards collaboration use case may have unique needs
- Gap: How often users actually want to swap roles in practice
- Handling: Implement simple version in Phase 5, iterate based on usage patterns

## Sources

### Primary (HIGH confidence)
- [MDN: WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API) — Connection lifecycle, DataChannel usage, Perfect Negotiation, ICE restart
- [WebRTC.org Official Samples](https://webrtc.github.io/samples/) — File transfer reference implementation
- [WebRTC.link RTCDataChannel Guide](https://webrtc.link/en/articles/rtcdatachannel-usage-and-message-size-limits/) — Chunk sizes, bufferedAmount, message limits
- [Mozilla WebRTC Blog](https://blog.mozilla.org/webrtc/large-data-channel-messages/) — Large message handling, buffer overflow mitigation
- [RFC 8831: WebRTC Data Channels](https://datatracker.ietf.org/doc/html/rfc8831) — Channel configuration, reliability modes

### Secondary (MEDIUM confidence)
- [ShareDrop GitHub](https://github.com/ShareDropio/sharedrop) — P2P file transfer UX patterns
- [PairDrop](https://pairdrop.net/) — Room-based P2P connection flow
- [WebRTC Manual SDP Tutorial](https://dev.to/hexshift/building-a-minimal-webrtc-peer-without-a-signaling-server-using-only-manual-sdp-exchange-mck) — Manual exchange patterns
- [webrtcHacks Safari Guide](https://webrtchacks.com/guide-to-safari-webrtc/) — Safari-specific quirks and workarounds
- [WebRTC.ventures Reconnection Guide](https://webrtc.ventures/2023/06/implementing-a-reconnection-mechanism-for-webrtc-mobile-applications/) — ICE restart patterns
- [fflate GitHub](https://github.com/101arrowz/fflate) — Compression library capabilities
- [lz-string GitHub](https://github.com/pieroxy/lz-string) — URL-safe encoding

### Tertiary (LOW confidence)
- Community GitHub issues (PeerJS, node-webrtc, simple-peer) — Anecdotal pitfall reports
- VideoSDK STUN guide — STUN server list (vendor documentation)
- Various webrtc-problems collections — Crowd-sourced troubleshooting

---
*Research completed: 2026-01-22*
*Ready for roadmap: yes*
