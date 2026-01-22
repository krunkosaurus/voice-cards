# Phase 5: Connection Polish - Context

**Gathered:** 2026-01-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Connection lifecycle handling — auto-recovery from network issues, graceful disconnect, and peer status awareness. Users always know connection state and can cleanly end sessions.

</domain>

<decisions>
## Implementation Decisions

### Reconnection behavior
- Only auto-reconnect for network issues (ICE/network failures), NOT when peer explicitly disconnects
- 3 attempts with exponential backoff, then stop and show manual "Try again" button
- Show attempt counter during reconnect: "Reconnecting (2/3)..."
- Resume where left off after successful reconnect — keep roles, no re-sync needed if brief disconnect

### Disconnect experience
- No confirmation dialog — click disconnect, immediately ends session
- Disconnect button lives inside SyncIndicator — click badge to reveal disconnect option
- Viewer keeps synced copy after disconnect — can continue viewing/editing locally
- Instant toast notification to other peer: "Peer disconnected"

### Peer status display
- Enhance existing SyncIndicator to show peer connection status (no separate indicator)
- No connection quality indicator — just connected/disconnected states
- 5 distinct states: Disconnected, Connecting, Connected, Reconnecting, Syncing
- Click SyncIndicator shows popover with: connection duration, peer role, disconnect button

### Connection loss handling
- Toast notification for connection loss (auto-dismisses after standard duration)
- Editor continues editing freely during connection loss — changes sync when reconnected
- Full re-sync after reconnection (send entire project again for consistency)
- Heartbeat/ping runs invisibly — user only sees connected/lost result, no technical details

### Claude's Discretion
- Exact exponential backoff timing (e.g., 2s, 4s, 8s)
- Heartbeat interval (5s mentioned in roadmap)
- Toast duration and styling
- ICE restart implementation details
- Popover component styling and animation

</decisions>

<specifics>
## Specific Ideas

- SyncIndicator already exists from Phase 1 — enhance it rather than creating new components
- "Try again" button should appear where reconnect counter was showing
- Popover on SyncIndicator click — similar to how the RoleBadge interaction works

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-connection-polish*
*Context gathered: 2026-01-22*
