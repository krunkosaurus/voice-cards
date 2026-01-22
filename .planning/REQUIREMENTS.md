# Requirements: Voice Cards P2P Sync

**Defined:** 2026-01-22
**Core Value:** Frictionless voice capture and organization — P2P sync should feel magical while requiring zero infrastructure.

## v1 Requirements

Requirements for the P2P sync milestone. Each maps to roadmap phases.

### Connection

- [ ] **CONN-01**: User can generate shareable connection code (encoded SDP offer)
- [ ] **CONN-02**: User can enter connection code to initiate pairing
- [ ] **CONN-03**: User receives answer code after entering offer, to send back
- [ ] **CONN-04**: Connection establishes after both codes exchanged
- [ ] **CONN-05**: User sees connection status (disconnected/connecting/connected/error)
- [ ] **CONN-06**: User can scan QR code instead of copying text on mobile
- [ ] **CONN-07**: Connection auto-recovers from temporary drops (ICE restart)
- [ ] **CONN-08**: User can intentionally disconnect from peer

### Transfer

- [ ] **XFER-01**: Full project transfers from editor to viewer on initial sync
- [ ] **XFER-02**: User sees progress during initial sync (cards transferred, percentage)
- [ ] **XFER-03**: User sees confirmation when sync completes
- [ ] **XFER-04**: Receiver sees warning before their existing project is overwritten
- [ ] **XFER-05**: Audio blobs transfer correctly (chunked, reassembled)

### Real-Time Sync

- [ ] **SYNC-01**: Card creates propagate to peer in real-time
- [ ] **SYNC-02**: Card deletes propagate to peer in real-time
- [ ] **SYNC-03**: Card edits (metadata) propagate to peer in real-time
- [ ] **SYNC-04**: Card reorders propagate to peer in real-time
- [ ] **SYNC-05**: Audio changes (trim, re-record) propagate to peer

### Editor Role

- [ ] **ROLE-01**: User sees their current role (Editor or Viewer)
- [ ] **ROLE-02**: Viewer can request editor role
- [ ] **ROLE-03**: Editor receives request and can approve/deny
- [ ] **ROLE-04**: UI prevents editing when in Viewer role
- [ ] **ROLE-05**: Editing is paused during role transfer approval

### Presence

- [ ] **PRES-01**: User sees indicator that peer is connected
- [ ] **PRES-02**: User sees when connection is lost

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Transfer

- **XFER-06**: Selective sync (choose which cards to transfer)
- **XFER-07**: Compression of metadata for faster initial sync

### Connection Polish

- **CONN-09**: Connection quality indicator (latency/health)
- **CONN-10**: Sync history log ("3 cards synced at 10:42")

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Signaling server | Manual code exchange preserves zero-infrastructure promise |
| Cloud storage/relay | P2P only, no backend data storage per design |
| Multi-user simultaneous editing | Single editor model by design, avoids CRDT complexity |
| Persistent peer identity | Local-first philosophy, no accounts |
| Chat/messaging | Users communicate outside app |
| TURN server fallback | Accept ~10-15% NAT failures; export/import is fallback |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONN-01 | TBD | Pending |
| CONN-02 | TBD | Pending |
| CONN-03 | TBD | Pending |
| CONN-04 | TBD | Pending |
| CONN-05 | TBD | Pending |
| CONN-06 | TBD | Pending |
| CONN-07 | TBD | Pending |
| CONN-08 | TBD | Pending |
| XFER-01 | TBD | Pending |
| XFER-02 | TBD | Pending |
| XFER-03 | TBD | Pending |
| XFER-04 | TBD | Pending |
| XFER-05 | TBD | Pending |
| SYNC-01 | TBD | Pending |
| SYNC-02 | TBD | Pending |
| SYNC-03 | TBD | Pending |
| SYNC-04 | TBD | Pending |
| SYNC-05 | TBD | Pending |
| ROLE-01 | TBD | Pending |
| ROLE-02 | TBD | Pending |
| ROLE-03 | TBD | Pending |
| ROLE-04 | TBD | Pending |
| ROLE-05 | TBD | Pending |
| PRES-01 | TBD | Pending |
| PRES-02 | TBD | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 25

---
*Requirements defined: 2026-01-22*
*Last updated: 2026-01-22 after initial definition*
