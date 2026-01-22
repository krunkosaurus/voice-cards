# Milestone State: v1 P2P Sync

**Current Phase:** 6
**Phase Status:** In Progress (2/? plans)
**Updated:** 2026-01-23

## Progress

| Phase | Name | Status | Requirements |
|-------|------|--------|--------------|
| 1 | WebRTC Connection | Complete (verified by user) | CONN-01, CONN-02, CONN-03, CONN-04, CONN-05 |
| 2 | Initial Sync | Complete (4/4 plans) | XFER-01, XFER-02, XFER-03, XFER-04, XFER-05 |
| 3 | Real-Time Sync | Verified | SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05 |
| 4 | Editor Role System | Verified | ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05 |
| 5 | Connection Polish | Complete (4/4 plans) | CONN-07, CONN-08, PRES-01, PRES-02 |
| 6 | QR Code Support | In Progress (2/?) | CONN-06 |

**Overall:** 5/6 phases complete

Progress: [==========] 97%

## Current Focus

**Phase 6: QR Code Support - IN PROGRESS**
- Status: 2/? plans complete (06-01, 06-02)
- Goal: QR code generation and scanning for easier SDP exchange
- Plan 06-01 complete: QR libraries installed, QRCodeDisplay component, useCameraAvailability hook
- Plan 06-02 complete: QRScanner component with useQRScanner hook and ScannerOverlay

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
| RoleBadge follows SyncIndicator pattern | Consistent styling for header badges | 2026-01-22 |
| RoleBadge returns null when disconnected | No role indicator needed in local mode | 2026-01-22 |
| RoleBadge before SyncIndicator in header | Role status more prominent than connection status | 2026-01-22 |
| canEdit=true when disconnected | Local editing allowed when not connected | 2026-01-22 |
| canEdit=false during transferring | ROLE-05: No edits during role handoff | 2026-01-22 |
| Denied state auto-clears after 3s | Better UX, viewer can retry request | 2026-01-22 |
| Role transfer state resets on disconnect | Prevents stuck states | 2026-01-22 |
| canEdit prop drilling pattern | Pass canEdit from Home through CardList to Card for viewer restrictions | 2026-01-22 |
| Early-return guards in handlers | Defense in depth: check canEdit at start of editing handlers | 2026-01-22 |
| Drag handle faded not hidden | opacity-30 keeps UI consistent while preventing interaction | 2026-01-22 |
| sentAt in heartbeat ping/pong | Simple RTT calculation by echoing ping's sentAt in pong | 2026-01-22 |
| Disconnect reason discriminant | 'user_initiated' vs 'error' for clear routing logic | 2026-01-22 |
| HeartbeatMessage union type | Combined type guard for both ping and pong | 2026-01-22 |
| 5s heartbeat, 15s timeout | 3 missed pings = stale connection detection | 2026-01-23 |
| Heartbeat handled at connection layer | Not passed to onControlMessage, handled internally | 2026-01-23 |
| 100ms delay before close | Ensures disconnect message transmitted before channel closes | 2026-01-23 |
| 2s RECONNECT_DETECT_DELAY | Brief window to detect if connection self-recovers before showing failed | 2026-01-23 |
| No auto-reconnect | Due to manual SDP exchange, automatic ICE restart isn't feasible | 2026-01-23 |
| Peer disconnect skips reconnecting | Intentional disconnect goes directly to peer_disconnected state | 2026-01-23 |
| onOfflineClick prop for SyncIndicator | Allows Header to open ConnectionDialog when clicking badge while disconnected | 2026-01-23 |
| Popover conditional display | Only shows popover when connected or had connection (failed/peer_disconnected) | 2026-01-23 |
| gracefulDisconnect from context | SyncIndicator calls context directly, no prop drilling | 2026-01-23 |
| QR size 192px with level M | Good balance for ~1000 char SDP codes | 2026-01-23 |
| enumerateDevices() for camera detection | No permission prompt required | 2026-01-23 |
| useRef for scanner instance | Avoids StrictMode double initialization | 2026-01-23 |
| No 'exact' facingMode constraint | iOS Safari compatibility | 2026-01-23 |
| clip-path polygon for cutout overlay | Single div approach, cleaner than multiple positioned divs | 2026-01-23 |
| useId for scanner container ID | Supports multiple scanner instances on same page | 2026-01-23 |

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
- `client/src/services/webrtc/connection.ts` - WebRTCConnectionService class (with backpressure methods, heartbeat)
- `client/src/services/webrtc/syncProtocol.ts` - Message creators, binary chunk utilities, operation creators
- `client/src/services/sync/AudioTransferService.ts` - Chunked audio send/receive with progress callbacks
- `client/src/services/sync/projectSync.ts` - Project serialization/deserialization for sync, apply functions
- `client/src/contexts/SyncContext.tsx` - Sync state management, orchestration, operation handlers, role transfer, reconnection state
- `client/src/components/SyncProgress.tsx` - Progress bar during sync transfer (XFER-02)
- `client/src/components/OverwriteConfirmDialog.tsx` - Warning dialog before overwrite (XFER-04)
- `client/src/hooks/useSyncedActions.ts` - Hook wrapping ProjectContext actions with broadcast logic
- `client/src/components/RoleBadge.tsx` - Role indicator badge with clickable viewer state
- `client/src/components/RoleRequestDialog.tsx` - Dialog for editor to approve/deny role requests
- `client/src/components/SyncIndicator.tsx` - Connection status badge with popover, disconnect button, toast notifications
- `client/src/components/QRCodeDisplay.tsx` - QR code rendering component using qrcode.react
- `client/src/hooks/useCameraAvailability.ts` - Camera detection hook using enumerateDevices()
- `client/src/components/QRScanner/QRScanner.tsx` - Camera-based QR scanner with custom overlay
- `client/src/components/QRScanner/ScannerOverlay.tsx` - Cutout overlay with corner brackets
- `client/src/components/QRScanner/useQRScanner.ts` - Html5Qrcode lifecycle management hook

## Session Continuity

Last session: 2026-01-23T18:03:00Z
Stopped at: Completed 06-02-PLAN.md
Resume file: None

## Blockers

None currently.

## Notes

**Plan 06-01:** QR Foundation (COMPLETE)
- Installed qrcode.react and html5-qrcode libraries
- Created QRCodeDisplay component (192px, level M error correction)
- Created useCameraAvailability hook using enumerateDevices()
- Ready for integration into ConnectionDialog

**Plan 05-04:** Connection status UI polish (COMPLETE)
- Reconnecting state with orange styling and spinning RefreshCw icon
- Popover showing connection duration and user role when connected
- Disconnect button using gracefulDisconnect from SyncContext
- Toast notifications for connection lost, peer disconnected, and connected events
- "Start New Session" button for failed/peer_disconnected states
- onOfflineClick prop for Header to open ConnectionDialog when offline

**Plan 05-03:** SyncContext heartbeat integration (COMPLETE)
- ReconnectionState type (idle/reconnecting/failed/peer_disconnected)
- connectedAt timestamp for connection duration tracking
- Heartbeat wiring: startHeartbeat on 'connected', stopHeartbeat on disconnect/error
- handleHeartbeatTimeout: brief 'reconnecting' state (2s) then 'failed'
- handlePeerDisconnect: direct transition to 'peer_disconnected'
- gracefulDisconnect for user-initiated disconnect
- resetReconnectionState for "Try again" functionality

**Plan 05-02:** Heartbeat service and graceful disconnect (COMPLETE)
- startHeartbeat() / stopHeartbeat() methods for connection health monitoring
- Heartbeat pings every 5s, timeout after 15s (3 missed pongs)
- gracefulDisconnect() sends disconnect message and waits 100ms before closing
- onHeartbeatTimeout callback fired when heartbeat times out
- onPeerDisconnect callback fired when peer sends disconnect message
- Heartbeat messages handled internally, not passed to external handlers

**Plan 05-01:** Heartbeat protocol types (COMPLETE)
- HeartbeatPing, HeartbeatPong interfaces with sentAt timestamp
- DisconnectMessage interface with reason discriminant
- HeartbeatMessage union type
- ConnectionState 'reconnecting' added
- createHeartbeatPing, createHeartbeatPong, createDisconnect message creators
- isHeartbeatMessage, isDisconnectMessage type guards

**Phase 5 Complete:** All 4 plans executed successfully
- Heartbeat protocol types (05-01)
- Heartbeat service with graceful disconnect (05-02)
- SyncContext heartbeat integration (05-03)
- Connection status UI polish (05-04)

**Phase 4 Complete:** All 4 plans executed and verified successfully
- Role protocol message types (04-01)
- Role state management in SyncContext (04-02)
- Role UI components: RoleBadge, RoleRequestDialog (04-03)
- UI editing restrictions for viewers (04-04)

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
*Last updated: 2026-01-23 18:00Z*
