---
phase: 03-real-time-sync
plan: 03
subsystem: sync
tags: [webrtc, hooks, broadcast, real-time]

# Dependency graph
requires:
  - phase: 03-02
    provides: Operation handlers in SyncContext (applyRemoteCard* functions)
  - phase: 03-01
    provides: Operation types and message creators
provides:
  - useSyncedActions hook with broadcast-enabled card operations
  - Home.tsx wired to broadcast on card create/update/delete/reorder
  - Card.tsx wired to broadcast on inline title edits
affects: [03-04, role-system, connection-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Hook wraps context actions with sync logic
    - shouldBroadcast() pattern for conditional broadcasting
    - Audio changes use chunk protocol with progress

key-files:
  created:
    - client/src/hooks/useSyncedActions.ts
  modified:
    - client/src/pages/Home.tsx
    - client/src/components/Card.tsx

key-decisions:
  - "syncedAddCard takes optional audioBlob parameter for new card broadcasts"
  - "syncedUpdateCard sends only metadata fields (label/notes/tags/color)"
  - "syncedAudioChange handles all audio modifications (re-record, append, trim, silence ops)"
  - "Card.tsx calls syncedUpdateCard directly for inline title edits"

patterns-established:
  - "useSyncedActions wraps ProjectContext actions with broadcast logic"
  - "shouldBroadcast() checks: connected + editor + not applying remote"
  - "Audio changes include chunk_start/sendAudio/chunk_complete sequence"

# Metrics
duration: 8min
completed: 2026-01-22
---

# Phase 03 Plan 03: Broadcast Wrappers Summary

**useSyncedActions hook wraps ProjectContext card actions to broadcast operations via WebRTC when connected as editor**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-22T12:26:20Z
- **Completed:** 2026-01-22T12:34:15Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Created useSyncedActions hook with synced versions of all card operations
- Wired Home.tsx to broadcast card creates, updates, deletes, reorders, and audio changes
- Wired Card.tsx to broadcast inline title edits directly
- All audio modifications (re-record, append, trim, silence) now sync to viewer

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useSyncedActions hook** - `de89a5d` (feat)
2. **Task 2: Update Home.tsx to use synced actions** - `ef87503` (feat)
3. **Task 3: Update Card.tsx to use synced actions** - `5a40a31` (feat)

## Files Created/Modified
- `client/src/hooks/useSyncedActions.ts` - Hook wrapping ProjectContext actions with broadcast logic
- `client/src/pages/Home.tsx` - Uses synced actions for all card operations
- `client/src/components/Card.tsx` - Uses synced action for inline title editing

## Decisions Made
- **Card.tsx calls syncedUpdateCard directly:** Avoids double dispatch through callback chain
- **syncedUpdateCard metadata-only:** Audio changes use separate syncedAudioChange function
- **shouldBroadcast() helper:** Centralizes the 3-condition check for broadcasting
- **Raw actions exposed:** Hook also exports rawAddCard/rawUpdateCard/etc for non-sync cases

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Editor broadcasts all card operations to viewer
- Viewer receives operations via SyncContext handlers (from 03-02)
- SYNC-01 through SYNC-05 requirements now fulfilled
- Ready for 03-04: Connection wiring and role enforcement (if any)

---
*Phase: 03-real-time-sync*
*Completed: 2026-01-22*
