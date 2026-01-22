# Milestone State: v1 P2P Sync

**Current Phase:** 2
**Phase Status:** In Progress
**Updated:** 2026-01-22

## Progress

| Phase | Name | Status | Requirements |
|-------|------|--------|--------------|
| 1 | WebRTC Connection | Complete (verified by user) | CONN-01, CONN-02, CONN-03, CONN-04, CONN-05 |
| 2 | Initial Sync | In Progress (2/3 plans) | XFER-01, XFER-02, XFER-03, XFER-04, XFER-05 |
| 3 | Real-Time Sync | Not Started | SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05 |
| 4 | Editor Role System | Not Started | ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05 |
| 5 | Connection Polish | Not Started | CONN-07, CONN-08, PRES-01, PRES-02 |
| 6 | QR Code Support | Not Started | CONN-06 |

**Overall:** 1/6 phases complete (Phase 2: 2/3 plans complete)

Progress: [=====.....] 50%

## Current Focus

**Phase 2: Initial Sync**
- Status: In Progress (Plan 2 of 3 complete)
- Goal: Editor can send full project to viewer on connection
- Last Completed: 02-02-PLAN.md (Audio Transfer Service)
- Next Action: Execute 02-03-PLAN.md (Sync Receiver)

## Key Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Manual SDP exchange | Zero infrastructure, user controls sharing | 2026-01-22 |
| Single editor role | Avoids CRDT/conflict resolution complexity | 2026-01-22 |
| Full project sync | Simpler mental model, matches existing import | 2026-01-22 |
| Native WebRTC APIs | Manual SDP exchange needs direct control | 2026-01-22 |
| Dual DataChannels | Separate control/binary prevents blocking | 2026-01-22 |
| 16KB chunks | Cross-browser stable for audio transfer | 2026-01-22 |
| lz-string for SDP encoding | URL-safe, good compression, no external deps | 2026-01-22 |
| Compact JSON (t/s keys) | Minimizes encoded SDP size | 2026-01-22 |
| SDPCodecResult pattern | Type-safe error handling without exceptions | 2026-01-22 |
| ICE timeout resolves (not rejects) | Allows partial candidate list rather than failing | 2026-01-22 |
| Wait for BOTH DataChannels | Only 'connected' when controlReady && binaryReady | 2026-01-22 |
| Safari Blob compatibility | Convert Blob to ArrayBuffer in binary handler | 2026-01-22 |
| Little-endian binary headers | Consistent cross-platform chunk encoding | 2026-01-22 |
| 8-byte chunk header | cardIndex (4B) + chunkIndex (4B) for routing | 2026-01-22 |
| MessageWithoutMeta pattern | Caller adds timestamp/id for flexibility | 2026-01-22 |
| 64KB buffer threshold | Standard backpressure threshold for WebRTC | 2026-01-22 |
| audio/webm type preserved | Blob reassembly maintains browser audio compatibility | 2026-01-22 |

## Technical Context

**Stack decisions from research:**
- Native RTCPeerConnection/RTCDataChannel (not PeerJS/simple-peer)
- lz-string for URL-safe SDP encoding (installed v1.5.0)
- fflate for compression (optional, defer if unneeded)
- Google/Cloudflare STUN servers (no TURN = accept ~10-15% failures)

**Critical pitfalls to address:**
1. Buffer overflow on large transfers - 16KB chunks, bufferedAmount monitoring
2. SDP timeout during copy-paste - non-trickle ICE, wait for gathering complete
3. NAT blocking (~10-15%) - set expectations, export/import fallback
4. DataChannel state races - wait for readyState === 'open'
5. Safari quirks - Promise-based API only, test early

**Key files created:**
- `client/src/types/sync.ts` - ConnectionState, SDPCodecResult, sync protocol message types
- `client/src/services/webrtc/sdpCodec.ts` - encodeSDP, decodeSDP functions
- `client/src/services/webrtc/connection.ts` - WebRTCConnectionService class (with backpressure methods)
- `client/src/services/webrtc/syncProtocol.ts` - Message creators, binary chunk utilities
- `client/src/services/sync/AudioTransferService.ts` - Chunked audio send/receive with progress callbacks

## Session Continuity

Last session: 2026-01-22T11:24:56Z
Stopped at: Completed 02-02-PLAN.md
Resume file: None

## Blockers

None currently.

## Notes

Phase 2 Plan 2 complete. Audio transfer infrastructure established.
- WebRTCConnectionService extended with backpressure control methods
- AudioTransferService handles chunked send with waitForBinaryBufferDrain
- AudioTransferService handles chunked receive with ordered reassembly
- Progress callbacks enable UI updates during large transfers

Ready for Plan 3: Sync receiver implementation (SyncReceiverService).

---

*State initialized: 2026-01-22*
*Last updated: 2026-01-22*
