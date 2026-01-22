# Feature Landscape: WebRTC P2P Sync

**Domain:** P2P data synchronization for Voice Cards (audio recording app)
**Researched:** 2026-01-22
**Confidence:** MEDIUM (WebSearch findings, cross-verified across multiple sources)

## Context: Voice Cards P2P Sync Use Cases

Based on the project context, Voice Cards is adding P2P sync for:
1. **Device handoff** - Continue on your phone what you started on desktop
2. **Collaboration** - Work with a friend on the same project

Key design decisions already made:
- Manual code exchange (offer/answer SDP)
- Full project sync (receiver's data is overwritten)
- Real-time bidirectional sync after initial connection
- Single editor role (one person edits at a time)

---

## Table Stakes

Features users expect from any P2P sync product. Missing these = product feels broken or incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Connection status indicator** | Users need to know if they're connected, connecting, or disconnected | Low | States: disconnected, connecting, connected, error. Visual feedback essential. |
| **Clear connection flow** | Manual SDP exchange requires explicit step-by-step guidance | Medium | Copy offer -> paste on other device -> copy answer -> paste back. Each step needs clear UI. |
| **Transfer progress feedback** | Users need to know sync is happening and when it's done | Low | Determinate progress bar for initial sync, indeterminate for ongoing changes |
| **Sync completion confirmation** | Users need to know when it's safe to disconnect | Low | Clear "Sync complete" state with timestamp |
| **Graceful disconnection** | Users expect to intentionally end the connection | Low | "Disconnect" button that cleanly closes the WebRTC connection |
| **Error messages** | When connection fails, users need to know why and what to do | Medium | Common failures: invalid code, timeout, network issues, firewall blocking |
| **Works across networks** | P2P should work internet-wide, not just same network | Medium | STUN servers (free from Google), TURN servers if needed for symmetric NAT |

### Connection Flow Table Stakes

| Step | What User Sees | Why Important |
|------|----------------|---------------|
| Generate offer | Copy button with offer code | Must be obvious and one-click |
| Paste offer | Input field on receiving device | Clear placeholder text explaining what goes here |
| Generate answer | Copy button with answer code | Auto-generated after pasting offer |
| Paste answer | Input field on original device | Completes the handshake |
| Connection established | Visual confirmation | Both parties need to know it worked |

---

## Differentiators

Features that would make Voice Cards P2P sync feel magical. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **QR code for mobile pairing** | Scan instead of copying long codes between devices | Low | Encode offer SDP in QR, mobile scans and auto-fills. Eliminates copy/paste friction for phone. |
| **Connection quality indicator** | Shows network health, warns before problems | Medium | MOS (Mean Opinion Score) calculation or simpler ping/latency display |
| **Auto-reconnection** | If connection drops, automatically try to restore | Medium | ICE restart on disconnection, with user notification. "Connection restored" toast. |
| **Compressed transfer** | Faster initial sync, less data | Medium | Compress JSON data before transfer. Audio blobs already compressed as webm. |
| **Transfer rate display** | Shows how fast data is moving | Low | Bytes/second during sync gives confidence something is happening |
| **"Sync paused" mode** | Temporarily stop syncing while reviewing changes | Low | Useful for receiver to look at what they got before accepting more |
| **Sync history/log** | See what changed and when | Medium | "3 cards synced at 10:42", "Card 'Interview pt 2' updated" |
| **Role indicator** | Clear display of who is Editor vs Viewer | Low | Badge or header showing current role. Critical for single-editor model. |
| **Role swap button** | One-click to transfer editor role | Low | "Pass editing to [peer]" button. Requires confirmation from other party. |
| **Presence indicators** | See that peer is still connected and active | Low | "Connected to iPhone" with green dot |
| **Conflict preview** | Before overwrite, show what will change | Medium | Side-by-side diff of project state. "This will replace 5 cards on your device." |
| **Selective sync** | Choose which cards to sync | High | Checkboxes for cards. Adds complexity but useful for partial handoff. |
| **Connection shortcut/bookmark** | Remember frequent pairing partners | High | Store peer info for one-click reconnect. Requires persistent peer identity. |

### Differentiators by Use Case

**Device Handoff Focus:**
| Feature | Why It Shines |
|---------|---------------|
| QR code pairing | Phone camera is faster than typing codes |
| Overwrite confirmation | "Replace all 12 cards on this phone?" before sync |
| Sync complete indicator | Know when you can close laptop |

**Collaboration Focus:**
| Feature | Why It Shines |
|---------|---------------|
| Role indicator | Always know who can edit |
| Role swap | Pass the mic smoothly |
| Presence indicator | Know your collaborator is still there |

---

## Anti-Features

Features to deliberately NOT build for Voice Cards P2P sync. Either over-engineered for the use case, technically problematic, or against the product philosophy.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Multi-user simultaneous editing** | Requires CRDT/OT complexity, Voice Cards has single-editor model by design | Single editor role with explicit handoff |
| **Central signaling server** | Adds infrastructure, maintenance, and defeats "nothing leaves your device" privacy promise | Manual SDP exchange preserves privacy |
| **Persistent peer identity / accounts** | Against Voice Cards philosophy of no accounts, local-only data | Fresh connection each time, no stored peer data |
| **Automatic discovery (same network)** | Requires WebSocket server or mDNS, not truly P2P | Manual pairing is more explicit and privacy-preserving |
| **Cloud relay fallback** | Breaks privacy promise, adds cost | Accept that some network configurations won't work (symmetric NAT without TURN) |
| **Merge/diff conflict resolution** | Full overwrite model is simpler and matches device handoff use case | Receiver confirms they want to overwrite their data |
| **Partial/incremental sync on connect** | Adds complexity for marginal benefit in audio app context | Full project sync on connect, then real-time delta sync |
| **Audio streaming during sync** | Unnecessary complexity, audio blobs are small-ish | Transfer complete files, let receiver play locally |
| **Version history** | Scope creep, not core to P2P sync feature | Overwrite is intentional, user can export before sync |
| **Chat/messaging channel** | Scope creep, users have other ways to communicate | Focus on data sync only |

### Why Single Editor Model

The decision to use single-editor (turn-taking) instead of simultaneous editing is smart for Voice Cards because:

1. **Simplicity**: No conflict resolution logic needed
2. **Audio focus**: Recording is inherently single-user (one mic)
3. **Clear mental model**: "One person works, others watch"
4. **Lower complexity**: No CRDT/OT libraries needed
5. **Matches handoff use case**: One device active at a time

---

## Feature Dependencies

```
[Connection Established]
    |
    ├── [Connection Status Indicator] (shows connecting/connected/error)
    |
    ├── [Transfer Progress] (requires data channel open)
    |       |
    |       └── [Sync Complete Confirmation] (when progress = 100%)
    |
    ├── [Role Indicator] (requires knowing which peer is editor)
    |       |
    |       └── [Role Swap] (requires both peers to be editor-capable)
    |
    └── [Presence Indicator] (heartbeat over data channel)
            |
            └── [Auto-Reconnection] (detects presence loss, triggers ICE restart)
```

### Critical Path for MVP P2P

1. **SDP Exchange UI** - The foundation
2. **Connection State Machine** - connecting/connected/disconnected/error
3. **Data Serialization** - How to send project data over data channel
4. **Progress Feedback** - User knows something is happening
5. **Role Assignment** - Who is editor on connect

---

## MVP Recommendation

For MVP P2P sync in Voice Cards, prioritize:

### Must Have (Table Stakes)
1. **Clear SDP exchange flow** - Step-by-step UI with copy buttons
2. **Connection status indicator** - Visual state machine
3. **Transfer progress** - Progress bar during initial sync
4. **Sync complete confirmation** - "Done" state
5. **Graceful disconnect** - Clean termination
6. **Error handling** - Meaningful messages for common failures

### Should Have (High-Value Differentiators)
1. **Role indicator** - "You are editing" / "You are viewing"
2. **Role swap** - Button to transfer editor role
3. **QR code for mobile** - Massive UX improvement for phone pairing
4. **Overwrite confirmation** - "This will replace your project" dialog

### Defer to Post-MVP
- Auto-reconnection (complex state management)
- Connection quality indicator (requires WebRTC stats API)
- Sync history/log (nice-to-have)
- Selective sync (scope creep)
- Compression (premature optimization)

---

## UX Patterns from Research

### Connection Flow Best Practices

Based on research of ShareDrop, PairDrop, and similar tools:

1. **Step numbering**: "Step 1: Copy this code", "Step 2: Paste on other device"
2. **Code format**: SDP is long; use text area with scroll, not input field
3. **Copy feedback**: "Copied!" toast when button clicked
4. **Paste detection**: Auto-detect when valid SDP is pasted
5. **Timeout handling**: If connection doesn't establish in ~30s, show retry option

### Progress Indicator Patterns

| Duration | Pattern |
|----------|---------|
| < 3 seconds | Spinner or skeleton |
| 3-10 seconds | Progress bar with percentage |
| > 10 seconds | Progress bar + time estimate |

For Voice Cards initial sync (likely 3-30 seconds depending on project size):
- Progress bar with percentage
- Show what's transferring: "Syncing card 3 of 12..."
- Show bytes transferred for transparency

### Role Handoff Patterns

1. **Request model**: "Sarah wants to edit. Allow?" [Yes] [No]
2. **Release model**: "Pass editing to Sarah" [Confirm]
3. **Timeout model**: After X minutes inactive, prompt to release

For Voice Cards, **release model** is simpler and matches "device handoff" mental model.

---

## Sources

### WebRTC Fundamentals
- [RTCDataChannel Guide](https://webrtc.link/en/articles/rtcdatachannel-usage-and-message-size-limits/) - File transfer, message size limits
- [MDN: Using WebRTC Data Channels](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels) - Official documentation
- [WebRTC.org Data Channels](https://webrtc.org/getting-started/data-channels) - Getting started guide

### P2P File Transfer Products
- [ShareDrop](https://github.com/ShareDropio/sharedrop) - AirDrop-inspired P2P transfer
- [PairDrop](https://pairdrop.net/) - Cross-platform P2P with room codes
- [Snapdrop](https://snapdrop.net/) - Local network P2P

### Manual Signaling
- [WebRTC Manual SDP Signaling](https://github.com/david-tkalcec/webrtc-manual-sdp-signaling) - Copy/paste SDP demo
- [WebRTC for the Curious: Signaling](https://webrtcforthecurious.com/docs/02-signaling/) - Deep dive on signaling

### Connection Management
- [WebRTC.ventures: Reconnection Mechanism](https://webrtc.ventures/2023/06/implementing-a-reconnection-mechanism-for-webrtc-mobile-applications/) - ICE restart patterns
- [BlogGeek: Handling Session Disconnections](https://bloggeek.me/handling-session-disconnections-in-webrtc/) - Disconnection handling

### Device Handoff Inspiration
- [Apple Handoff](https://support.apple.com/en-us/102426) - Continue tasks between devices
- [Windows 11 Cross-Device Resume](https://windowsforum.com/threads/microsoft-windows-11-cross-device-handoff-a-game-changer-in-seamless-workflow.367316/) - Microsoft's approach

### QR Code Pairing
- [QR Code Device Pairing](https://www.qrcode-tiger.com/device-pairing-with-qr-codes) - Best practices
- [PairShare QR Sharing](https://pairshare.io/blog/qr-code-sharing-explained) - P2P QR implementation

### Progress Indicators
- [Mobbin: Progress Indicator UI](https://mobbin.com/glossary/progress-indicator) - Design patterns
- [Cieden: Progress Indicator UI](https://cieden.com/book/atoms/progress-indicator/progress-indicator-ui) - Best practices

### Conflict Resolution (Reference)
- [Automerge](https://automerge.org/docs/hello/) - CRDT library (not recommended for Voice Cards, but good reference)
- [Hoverify: Conflict Resolution in Collaborative Editing](https://tryhoverify.com/blog/conflict-resolution-in-real-time-collaborative-editing/) - Why single-editor is simpler
