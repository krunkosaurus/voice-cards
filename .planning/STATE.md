# Milestone State: v1 P2P Sync

**Current Phase:** 4
**Phase Status:** In progress (1/5 plans)
**Updated:** 2026-01-22

## Progress

| Phase | Name | Status | Requirements |
|-------|------|--------|--------------|
| 1 | WebRTC Connection | Complete (verified by user) | CONN-01, CONN-02, CONN-03, CONN-04, CONN-05 |
| 2 | Initial Sync | Complete (4/4 plans) | XFER-01, XFER-02, XFER-03, XFER-04, XFER-05 |
| 3 | Real-Time Sync | Verified | SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05 |
| 4 | Editor Role System | In Progress (1/5) | ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05 |
| 5 | Connection Polish | Not Started | CONN-07, CONN-08, PRES-01, PRES-02 |
| 6 | QR Code Support | Not Started | CONN-06 |

**Overall:** 3/6 phases complete

Progress: [========..] 80%

## Current Focus

**Phase 4: Editor Role System - IN PROGRESS**
- Status: Plan 04-01 complete (role message types)
- Goal: Enable role transfer between editor and viewer
- Plan 04-01: Role protocol message types (COMPLETE)
- Next Action: Plan 04-02 (role state management)

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
| Full project replacement sync | Viewer's data cleared before commit; becomes read-only copy | 2026-01-22 |
| 500ms auto-sync delay | Stability delay after connection before auto-starting sync | 2026-01-22 |
| Receiver accumulates before commit | Data stored in state, then explicitly committed via commitSync | 2026-01-22 |
| INIT_STATE dispatch for reload | After IndexedDB commit, dispatch to ProjectContext reloads UI | 2026-01-22 |
| Role detection based on offer vs answer | If user created offer (has offerCode), they are editor. If they accepted offer, they are viewer. | 2026-01-22 |
| Auto-commit on viewer after sync_complete | Viewer should see synced project immediately without manual action | 2026-01-22 |
| Sync wiring in Home.tsx not Header.tsx | Home.tsx already manages WebRTC hook state, keeps wiring co-located | 2026-01-22 |
| Operation types extend ControlMessage | Timestamp/id metadata for message tracking | 2026-01-22 |
| CardUpdateOperation limited to metadata | Audio changes use separate CardAudioChangeOperation | 2026-01-22 |
| CardReorderOperation uses {id, order} array | Efficiency over full card objects | 2026-01-22 |
| audioSize triggers binary transfer | Operation creator signals when audio data follows | 2026-01-22 |
| isApplyingRemoteRef timing | Flag set true BEFORE dispatch, false in finally block for proper deduplication | 2026-01-22 |
| pendingAudioOps Map approach | Track audio operations awaiting binary data by cardId | 2026-01-22 |
| Operation routing before sync messages | Operations are more specific, route first in callback | 2026-01-22 |
| Card state from ProjectContext | Use projectState.cards for merge operations | 2026-01-22 |
| Card.tsx calls syncedUpdateCard directly | Avoids double dispatch through callback chain | 2026-01-22 |
| shouldBroadcast() helper pattern | Centralizes 3-condition check for broadcasting | 2026-01-22 |
| broadcastCardCreate pattern | Separate broadcast from local state add for existing cards | 2026-01-22 |
| pendingCardCreatesRef Map<string, Card> | Store full card data to avoid stale closure issues | 2026-01-22 |
| Track audio BEFORE async ops | Prevent race where chunks complete before cardId tracked | 2026-01-22 |
| Reset sync progress after real-time op | Real-time ops don't have sync_complete message | 2026-01-22 |
| WaveformThumbnail key with updatedAt | Force remount to load audio after real-time sync | 2026-01-22 |

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
- `client/src/types/sync.ts` - ConnectionState, SDPCodecResult, sync protocol message types, operation types
- `client/src/services/webrtc/sdpCodec.ts` - encodeSDP, decodeSDP functions
- `client/src/services/webrtc/connection.ts` - WebRTCConnectionService class (with backpressure methods)
- `client/src/services/webrtc/syncProtocol.ts` - Message creators, binary chunk utilities, operation creators
- `client/src/services/sync/AudioTransferService.ts` - Chunked audio send/receive with progress callbacks
- `client/src/services/sync/projectSync.ts` - Project serialization/deserialization for sync, apply functions
- `client/src/contexts/SyncContext.tsx` - Sync state management, orchestration, operation handlers
- `client/src/components/SyncProgress.tsx` - Progress bar during sync transfer (XFER-02)
- `client/src/components/OverwriteConfirmDialog.tsx` - Warning dialog before overwrite (XFER-04)
- `client/src/hooks/useSyncedActions.ts` - Hook wrapping ProjectContext actions with broadcast logic

## Session Continuity

Last session: 2026-01-22T13:05:00Z
Stopped at: Completed 04-01-PLAN.md
Resume file: None

## Blockers

None currently.

## Notes

Phase 4 in progress. Role protocol message types complete.

**Plan 04-01:** Role protocol message types (COMPLETE)
- RoleRequestMessage, RoleGrantMessage, RoleDenyMessage, RoleTransferCompleteMessage interfaces
- RoleMessage union type
- Updated SyncControlMessage to include role messages
- createRoleRequest, createRoleGrant, createRoleDeny, createRoleTransferComplete functions
- isRoleMessage type guard for routing

Phase 3 complete. Broadcast wrappers implemented.

**Plan 03-01:** Sync operation types and message creators (COMPLETE)
- CardCreateOperation, CardUpdateOperation, CardDeleteOperation
- CardReorderOperation, CardAudioChangeOperation
- SyncOperation union type
- isOperationMessage type guard
- 5 message creator functions

**Plan 03-02:** Operation handlers in SyncContext (COMPLETE)
- applyRemoteCardCreate/Update/Delete/Reorder/AudioChange functions
- handleOperationMessage with switch for all 5 operation types
- isApplyingRemoteRef for origin-based deduplication
- pendingAudioOps Map for audio change coordination
- getConnection/getAudioTransfer accessors exposed

**Plan 03-03:** Broadcast wrappers (COMPLETE)
- useSyncedActions hook with synced versions of all card operations
- shouldBroadcast() pattern: connected + editor + not applying remote
- Home.tsx uses synced actions for all card operations
- Card.tsx uses synced action for inline title edits
- All SYNC-01 through SYNC-05 requirements now fulfilled

Key capabilities now available:
- Editor broadcasts all card operations to viewer via WebRTC
- Viewer receives operations and applies to local state
- Origin flag prevents infinite broadcast loops
- Audio changes include full chunk protocol

**Phase 3 Complete:** All 3 plans executed successfully
- Operation types and message creators (03-01)
- Operation handlers in SyncContext (03-02)
- Broadcast wrappers with useSyncedActions hook (03-03)

**User Testing Complete:** Real-time sync verified working.

Bugs found and fixed during testing:
- Recording not using synced actions (fixed with broadcastCardCreate)
- Audio not saving for real-time ops (fixed pendingCardCreatesRef)
- Waveform not displaying (fixed with key prop on WaveformThumbnail)
- Stale closure issue (changed Set to Map with full card data)
- Race condition (track audio BEFORE async operations)
- Sync progress stuck (reset after real-time op completes)

---

*State initialized: 2026-01-22*
*Last updated: 2026-01-22*
