# Roadmap: Voice Cards P2P Sync

**Milestone:** v1 P2P Sync
**Created:** 2026-01-22
**Depth:** Standard

## Phase Overview

| Phase | Name | Requirements | Description |
|-------|------|--------------|-------------|
| 1 | WebRTC Connection | CONN-01, CONN-02, CONN-03, CONN-04, CONN-05 | Establish P2P connection via manual SDP exchange |
| 2 | Initial Sync | XFER-01, XFER-02, XFER-03, XFER-04, XFER-05 | Full project transfer from editor to viewer |
| 3 | Real-Time Sync | SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05 | Live updates propagate while connected |
| 4 | Editor Role System | ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05 | Single-editor model with handoff |
| 5 | Connection Polish | CONN-07, CONN-08, PRES-01, PRES-02 | Auto-reconnect, disconnect, presence |
| 6 | QR Code Support | CONN-06 | Mobile-friendly code exchange |

**Total:** 25 requirements across 6 phases

---

## Phases

### Phase 1: WebRTC Connection

**Goal:** Users can establish a P2P connection by exchanging codes manually.

**Requirements:** CONN-01, CONN-02, CONN-03, CONN-04, CONN-05

**Depends on:** None

**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md — Types & SDP codec (lz-string compression)
- [x] 01-02-PLAN.md — WebRTCConnectionService (RTCPeerConnection lifecycle, dual DataChannels)
- [x] 01-03-PLAN.md — Connection hook & UI (useWebRTC, ConnectionDialog, SyncIndicator, Header integration)

**Deliverables:**
- WebRTCConnectionService with RTCPeerConnection lifecycle management
- SDP codec (compression with lz-string, encoding, validation)
- Connection state machine (disconnected -> creating_offer -> awaiting_answer -> connecting -> connected)
- ConnectionDialog component with step-by-step SDP exchange UI
- Connection status indicator (disconnected/connecting/connected/error)
- Dual DataChannel setup (control channel for metadata, binary channel for audio)

**Success Criteria:**
- [x] User can click "Connect" and generate a shareable code (CONN-01)
- [x] User can paste a received code to initiate pairing (CONN-02)
- [x] After entering offer code, user sees answer code to send back (CONN-03)
- [x] After both codes exchanged, connection establishes and DataChannels open (CONN-04)
- [x] User sees visual indicator of connection state at all times (CONN-05)

---

### Phase 2: Initial Sync

**Goal:** Viewer receives a complete copy of the editor's project when first connected.

**Requirements:** XFER-01, XFER-02, XFER-03, XFER-04, XFER-05

**Depends on:** Phase 1 (connection must be established)

**Plans:** 4 plans

Plans:
- [ ] 02-01-PLAN.md — Sync protocol types and message utilities
- [ ] 02-02-PLAN.md — AudioTransferService with chunking and backpressure
- [ ] 02-03-PLAN.md — SyncContext and projectSync utilities
- [ ] 02-04-PLAN.md — Sync UI components (progress, dialogs, integration)

**Deliverables:**
- SyncContext wrapping ProjectContext for sync-aware state
- Initial sync protocol (metadata first, then audio blobs)
- AudioTransferService with 16KB chunking and backpressure control
- Progress UI component showing cards transferred and percentage
- Overwrite confirmation dialog for receiver
- Sync completion notification

**Success Criteria:**
- [ ] When connected, editor's full project transfers to viewer automatically (XFER-01)
- [ ] Viewer sees progress bar with cards transferred and percentage (XFER-02)
- [ ] Viewer sees confirmation toast when sync completes (XFER-03)
- [ ] Viewer sees warning dialog before their existing project is overwritten (XFER-04)
- [ ] Audio files transfer correctly, can be played back on receiver (XFER-05)

---

### Phase 3: Real-Time Sync

**Goal:** Changes made by the editor propagate to the viewer in real-time.

**Requirements:** SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05

**Depends on:** Phase 2 (initial sync establishes baseline)

**Deliverables:**
- Sync-aware action wrappers (addCard, updateCard, deleteCard, reorderCards)
- Operation broadcast when connected and isEditor
- Remote operation application to local reducer
- Operation deduplication with UUID tracking (idempotent)
- Sync indicator showing live sync status
- Audio change sync (re-record, trim)

**Success Criteria:**
- [ ] When editor creates a card, viewer sees it appear within 1 second (SYNC-01)
- [ ] When editor deletes a card, viewer sees it disappear within 1 second (SYNC-02)
- [ ] When editor edits card metadata (label, notes, tags, color), viewer sees changes (SYNC-03)
- [ ] When editor reorders cards, viewer sees new order (SYNC-04)
- [ ] When editor trims or re-records audio, viewer receives updated audio (SYNC-05)

---

### Phase 4: Editor Role System

**Goal:** Only one person can edit at a time, with ability to hand off editing rights.

**Requirements:** ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05

**Depends on:** Phase 3 (sync must be working)

**Deliverables:**
- Role indicator badge ("You are editing" / "Viewing only")
- Role handshake on connection establishment
- Role request/grant protocol messages
- Role swap dialog for editor to approve/deny requests
- UI enforcement: disable editing controls when viewer
- Editing pause during role transfer

**Success Criteria:**
- [ ] Both users see their current role clearly displayed (ROLE-01)
- [ ] Viewer can click button to request editor role (ROLE-02)
- [ ] Editor sees request notification and can approve or deny (ROLE-03)
- [ ] When in Viewer role, editing controls are disabled/hidden (ROLE-04)
- [ ] During role transfer approval, editing is paused to prevent conflicts (ROLE-05)

---

### Phase 5: Connection Polish

**Goal:** Connection handles drops gracefully and users always know peer status.

**Requirements:** CONN-07, CONN-08, PRES-01, PRES-02

**Depends on:** Phase 1 (connection layer exists)

**Deliverables:**
- ICE restart on disconnection (not full peer connection recreation)
- Connection health monitoring with heartbeat ping/pong (5s interval)
- Exponential backoff for reconnection attempts
- "Reconnecting..." UI state
- Graceful disconnect button
- Peer connected indicator
- Connection lost notification

**Success Criteria:**
- [ ] When connection drops temporarily, it auto-recovers without user action (CONN-07)
- [ ] User can click "Disconnect" to cleanly end the session (CONN-08)
- [ ] User sees indicator showing peer is connected (PRES-01)
- [ ] User sees notification when connection is lost (PRES-02)

---

### Phase 6: QR Code Support

**Goal:** Mobile users can scan QR codes instead of copy-pasting long codes.

**Requirements:** CONN-06

**Depends on:** Phase 1 (connection codes exist)

**Deliverables:**
- QR code generation from SDP offer code
- QR code scanner component using device camera
- Mobile-optimized connection dialog
- Fallback to text copy-paste when camera unavailable

**Success Criteria:**
- [ ] User can display QR code for their connection offer (CONN-06)
- [ ] Other user can scan QR code with phone camera to initiate connection (CONN-06)

---

## Requirement Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONN-01 | 1 | Complete |
| CONN-02 | 1 | Complete |
| CONN-03 | 1 | Complete |
| CONN-04 | 1 | Complete |
| CONN-05 | 1 | Complete |
| CONN-06 | 6 | Pending |
| CONN-07 | 5 | Pending |
| CONN-08 | 5 | Pending |
| XFER-01 | 2 | Pending |
| XFER-02 | 2 | Pending |
| XFER-03 | 2 | Pending |
| XFER-04 | 2 | Pending |
| XFER-05 | 2 | Pending |
| SYNC-01 | 3 | Pending |
| SYNC-02 | 3 | Pending |
| SYNC-03 | 3 | Pending |
| SYNC-04 | 3 | Pending |
| SYNC-05 | 3 | Pending |
| ROLE-01 | 4 | Pending |
| ROLE-02 | 4 | Pending |
| ROLE-03 | 4 | Pending |
| ROLE-04 | 4 | Pending |
| ROLE-05 | 4 | Pending |
| PRES-01 | 5 | Pending |
| PRES-02 | 5 | Pending |

**Coverage:** 25/25 requirements mapped

---

## Phase Dependencies

```
Phase 1: WebRTC Connection
    |
    v
Phase 2: Initial Sync
    |
    v
Phase 3: Real-Time Sync
    |
    v
Phase 4: Editor Role System

Phase 1: WebRTC Connection
    |
    +---> Phase 5: Connection Polish
    |
    +---> Phase 6: QR Code Support
```

**Notes:**
- Phases 1-4 are sequential (each builds on previous)
- Phases 5 and 6 branch from Phase 1 (can be done after core flow works)
- Phase 5 (polish) and Phase 6 (QR) are independent of each other

---

*Roadmap created: 2026-01-22*
*Phase 1 planned: 2026-01-22*
*Phase 2 planned: 2026-01-22*
