# Voice Cards

## What This Is

A voice recording app that organizes audio as cards on a timeline. Users record voice notes, arrange them, trim audio, add metadata, and transcribe speech. Now adding real-time P2P sync to collaborate with others or hand off to another device — no cloud storage needed.

## Core Value

Frictionless voice capture and organization. Recording and arranging audio cards must be instant and intuitive — everything else builds on that foundation.

## Requirements

### Validated

- ✓ Voice recording with microphone selection — existing
- ✓ Cards with metadata (label, notes, tags, color) — existing
- ✓ Timeline playback across all cards — existing
- ✓ Drag-and-drop card reordering — existing
- ✓ Audio trimming — existing
- ✓ Speech-to-text transcription — existing
- ✓ Project export/import as ZIP — existing
- ✓ Undo/redo with audio snapshots — existing
- ✓ Light/dark theme — existing
- ✓ Waveform visualization — existing

### Active

- [ ] WebRTC P2P connection via manual code exchange (offer/answer)
- [ ] Initial project sync (full transfer, overwrites receiver's project with warning)
- [ ] Real-time bidirectional sync (creates, deletes, reorders, edits)
- [ ] Editor role with request/approve handoff (one editor at a time)
- [ ] Auto-reconnect on connection drop
- [ ] Connection status UI and sync indicators

### Out of Scope

- Server-hosted signaling service — using manual code exchange instead
- Cloud storage or sync — P2P only, no backend data storage
- Multi-user editing simultaneously — one editor at a time by design
- Persistent connection history — each session is fresh

## Context

**Hosting:** App is live at voicecards.org — both peers open the same site.

**Use cases:**
1. Collaborate with another person (share work in progress)
2. Device handoff (continue on your iPhone/laptop)

**Technical environment:**
- React 19 + TypeScript + Vite
- IndexedDB for local persistence (idb wrapper)
- Existing export/import uses jszip for ZIP files
- Context API with useReducer for state management
- Web Audio API for recording/playback

**Signaling approach:** SDP offer/answer encoded as shareable codes. No backend relay — users exchange codes via text/chat.

## Constraints

- **No backend for sync**: All data transfer via WebRTC DataChannel. No server stores or relays user data.
- **Browser-only**: Must work in modern browsers. WebRTC support required (Chrome, Firefox, Safari, Edge).
- **Existing architecture**: Build on current Context/reducer patterns. New sync layer integrates with existing state management.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Manual code exchange over relay | Zero infrastructure, user controls sharing | — Pending |
| Single editor role | Avoids conflict resolution complexity | — Pending |
| Full project sync (not selective) | Simpler mental model, matches existing import behavior | — Pending |
| Auto-reconnect on drops | P2P connections are fragile, should recover gracefully | — Pending |

---
*Last updated: 2026-01-22 after initialization*
