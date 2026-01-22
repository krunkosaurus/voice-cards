# Codebase Concerns

**Analysis Date:** 2026-01-22

## Tech Debt

**Large monolithic Home page component:**
- Issue: `client/src/pages/Home.tsx` contains 1245 lines with 70+ state variables and multiple concerns mixed together (recording, playback, editing, export/import, history)
- Files: `client/src/pages/Home.tsx`
- Impact: Difficult to maintain, test, and extend; high cognitive load; state management complexity; changes to one feature risk breaking others
- Fix approach: Extract into smaller composable components (RecordingController, PlaybackController, CardEditor, ExportController) and move their logic into custom hooks

**Deep cloning for state snapshots:**
- Issue: Using `JSON.parse(JSON.stringify(cards))` for deep cloning in history snapshots is inefficient and loses non-serializable properties
- Files: `client/src/contexts/HistoryContext.tsx:163`
- Impact: Potential data loss if Card types contain non-JSON-serializable properties; poor performance with large projects; fragile approach
- Fix approach: Implement structured clone or create a dedicated Card clone utility function that explicitly handles all Card properties

**No validation for imported audio files:**
- Issue: Audio validation in `client/src/services/importProject.ts` only checks if duration > 0 after loading, doesn't verify file format or integrity during ZIP extraction
- Files: `client/src/services/importProject.ts:75-90`
- Impact: Malformed audio files could fail silently during import; no format validation before processing
- Fix approach: Add MIME type checking and file signature validation (magic bytes) before attempting to load audio

**Raw API endpoint hardcoded:**
- Issue: Transcription API base URL is hardcoded to `https://voice.sogni.ai` with no fallback
- Files: `client/src/services/transcription.ts:4`
- Impact: Service breaks if API endpoint changes; no environment-based configuration; difficult to support different deployment environments; potential CORS issues not handled
- Fix approach: Move to environment variable or config file; add fallback URL; implement error handling for CORS failures

## Known Bugs

**localStorage inconsistency for microphone selection:**
- Symptoms: Different keys used for storing selected microphone ('voiceCards_selectedMicrophone' vs potential storage key mismatch)
- Files: `client/src/components/MicrophoneSetup.tsx`, `client/src/hooks/useRecorder.ts`
- Trigger: Selecting a microphone in setup, then trying to record in a new session
- Workaround: Manual key synchronization; currently working but inconsistent naming pattern

**Audio duration detection fallback chain incomplete:**
- Symptoms: Web Audio API might fail on some browsers, HTML Audio element fallback has multiple event listeners but no guaranteed event firing
- Files: `client/src/services/audioUtils.ts:5-56`
- Cause: iOS Safari and some mobile browsers have inconsistent audio loading behavior; timeout is 5 seconds which may be insufficient on slow connections
- Improvement path: Add exponential backoff retry logic; increase timeout with network speed detection; use MediaElementAudioSourceNode as additional fallback

**Import continues without all files:**
- Symptoms: If some audio files are missing in ZIP during import, those cards are silently skipped with only console.warn
- Files: `client/src/services/importProject.ts:37-40`
- Trigger: Corrupted or incomplete ZIP export file
- Workaround: Reimport from a complete export; currently logs warning but doesn't fail the import

**Transcription errors don't show user feedback:**
- Symptoms: Auto-transcription failures are silently caught and logged but no toast notification to user
- Files: `client/src/pages/Home.tsx:467-469` (comment says "transcript generation is optional")
- Trigger: Network failure or API error during transcription
- Workaround: Users have no visibility into failed transcriptions; feature appears broken but succeeds silently

## Security Considerations

**Direct transcription API exposure:**
- Risk: External API endpoint (`https://voice.sogni.ai`) is called directly from browser; audio data sent to external service without encryption/TLS verification
- Files: `client/src/services/transcription.ts`
- Current mitigation: Uses HTTPS (TLS) for transport security
- Recommendations: Add API key authentication; implement client-side encryption of audio data; add proxy endpoint in `server/index.ts` to handle transcription requests server-side instead of exposing external API to client

**IndexedDB data not encrypted:**
- Risk: Audio files and card metadata stored in browser IndexedDB are plaintext; no encryption for sensitive content
- Files: `client/src/services/db.ts` (all audio storage operations)
- Current mitigation: Relies on browser sandbox security model
- Recommendations: For production use with sensitive content, implement client-side encryption using SubtleCrypto API before storing in IndexedDB; add user authentication/password protection

**localStorage used for theme and microphone without validation:**
- Risk: Theme preference and microphone ID stored in localStorage without validation; could be exploited via XSS to inject invalid values
- Files: `client/src/contexts/ThemeContext.tsx`, `client/src/components/MicrophoneSetup.tsx`
- Current mitigation: Values used are limited in scope (theme values, device IDs)
- Recommendations: Validate stored values against whitelist before using; add CSP headers to prevent XSS injection

**Error stack traces exposed in ErrorBoundary:**
- Risk: Full error stack traces displayed to users in browser, could leak internal implementation details
- Files: `client/src/components/ErrorBoundary.tsx:38`
- Current mitigation: Stack traces are development-relevant but shown in production
- Recommendations: Only show full stack in development; in production, show generic error message and log stack server-side; add error reporting service (Sentry) for monitoring

## Performance Bottlenecks

**Audio merge operation for large projects:**
- Problem: Merging all audio files into one WAV in `exportProject` processes entire project in memory
- Files: `client/src/services/exportProject.ts:54-60`
- Cause: `mergeAudioBlobs` decodes all audio into AudioBuffer, creates offline audio context, and re-renders all at once
- Improvement path: Implement streaming approach with AudioWorklet for incremental processing; show progress updates; allow cancellation of export

**No pagination for card list:**
- Problem: All cards loaded and rendered in DOM simultaneously; no virtual scrolling
- Files: `client/src/components/CardList.tsx`, `client/src/pages/Home.tsx:38-51`
- Cause: No virtualization library integrated; list renders all filtered cards as full components
- Improvement path: Implement react-window or similar virtual scrolling; only render visible cards; test with 500+ card projects

**Waveform generation synchronous on main thread:**
- Problem: `generateWaveformData` decodes entire audio and processes it synchronously
- Files: `client/src/services/waveformGenerator.ts`
- Cause: No Web Worker usage; blocks UI during processing
- Improvement path: Move waveform generation to Web Worker; process in chunks; show progress

**History snapshots store entire project state:**
- Problem: Each undo/redo step creates complete snapshots of all cards and their audio blobs
- Files: `client/src/contexts/HistoryContext.tsx:21` (MAX_HISTORY_SIZE = 20 snapshots)
- Cause: No delta-based history; each snapshot is full copy of state + audio blobs
- Improvement path: Implement differential snapshots; store only changed card IDs and delta audio segments; implement compression for history blobs

## Fragile Areas

**Recording state machine not formalized:**
- Files: `client/src/pages/Home.tsx` (lines 31-68), `client/src/hooks/useRecorder.ts`
- Why fragile: Recording flow has multiple states (setup, countdown, recording, paused, trim, save) managed across hooks and parent component without explicit state machine; transitions not validated
- Safe modification: Define explicit state transitions; use xstate or similar for state management; add tests for each transition
- Test coverage: No tests for recording state transitions; manually tested only

**Master player timing calculations vulnerable to skew:**
- Files: `client/src/hooks/useMasterPlayer.ts:20-51`
- Why fragile: Cumulative timing calculations for card start times can accumulate floating-point errors over long projects; no resync mechanism
- Safe modification: Round to nearest millisecond; periodically resync from card index and audio element currentTime
- Test coverage: No tests for multi-card playback timing accuracy

**Import/Export data format coupled to Card type:**
- Files: `client/src/services/exportProject.ts`, `client/src/services/importProject.ts`
- Why fragile: Export data structure directly serializes Card type; if Card properties change (add/remove/rename), old exports become incompatible
- Safe modification: Implement schema versioning in ExportData; add migration functions for upgrading old exports; add tests for backwards compatibility
- Test coverage: No tests for importing older format exports or handling schema mismatches

**Modal state management scattered:**
- Files: `client/src/pages/Home.tsx:53-68` (7 modal state variables)
- Why fragile: Multiple useState calls for modal states (setup, recording, editing, trim, selection); no centralized modal stack; closing one modal might miss cleanup
- Safe modification: Extract to ModalProvider with stack-based management; ensure each modal properly cleans up on close
- Test coverage: No tests for modal open/close sequences

## Scaling Limits

**IndexedDB transaction batching needs optimization:**
- Current capacity: Tested with unknown number of cards; no documented limits
- Limit: Where it breaks with very large projects (1000+ cards): Transaction overhead becomes significant, each card save is separate operation
- Scaling path: Batch operations into larger transactions; use saveCards batch operation more; implement pagination on card operations

**Audio context creation on every playback:**
- Current capacity: Single card playback works smoothly
- Limit: 10+ concurrent card selections/playbacks within short time could exhaust audio context pool
- Scaling path: Reuse single AudioContext instance; implement proper audio context pooling; clean up old contexts promptly

**Browser storage limits:**
- Current capacity: IndexedDB typically 50MB per domain in Chrome (varies by browser)
- Limit: Projects with 100+ hours of high-quality audio exceed 50MB quota
- Scaling path: Implement quota checking before importing; offer optional cloud storage or local file system access; add compression for stored audio

**History memory usage:**
- Current capacity: 20 snapshots with typical 10 card project ~5-10MB
- Limit: With MAX_HISTORY_SIZE=20 and large audio blobs, each snapshot can consume 1-5MB
- Scaling path: Implement configurable history limit; add compression; implement LRU eviction; offer history export/archive

## Dependencies at Risk

**Chart.js via recharts (dangerouslySetInnerHTML usage):**
- Risk: Chart rendering uses `dangerouslySetInnerHTML` which could be vulnerability vector if data not sanitized
- Files: `client/src/components/ui/chart.tsx`
- Impact: Currently only used for chart labels/tooltips; if user-generated content passed to charts, could enable XSS
- Migration plan: Review recharts API for safer alternatives; sanitize all chart data inputs; consider switch to victory or other sanitization-aware charting library

**Patched wouter dependency:**
- Risk: Custom patch applied to wouter@3.7.1; custom patches are maintenance burden
- Files: `patches/wouter@3.7.1.patch`
- Impact: Upgrading wouter requires reapplying patch; patch compatibility unknown with future versions
- Migration plan: Check if patch fixes are addressed in newer wouter versions; if addressed, remove patch and upgrade; if not addressed upstream, consider switch to TanStack Router or Remix

**Transcription API dependency (voice.sogni.ai):**
- Risk: Transcription feature depends on external API that could become unavailable
- Files: `client/src/services/transcription.ts`
- Impact: Feature silently fails if API unreachable; no health check or user notification
- Migration plan: Add API health check on app load; implement fallback to local speech-to-text (Web Speech API); add feature flag to disable transcription when API unavailable

## Missing Critical Features

**No conflict resolution for concurrent edits:**
- Problem: If user opens same project in multiple browser tabs, changes in one tab overwrite others silently
- Blocks: Multi-device sync, collaborative editing, crash recovery
- Recommendation: Implement last-write-wins with timestamp; add conflict detection UI; implement operation-based sync with CRDT

**No backup/recovery mechanism:**
- Problem: Only data is IndexedDB; no automatic backups; clearing app data loses everything
- Blocks: Data loss protection, account recovery, device migration
- Recommendation: Add automatic scheduled exports to local file system; implement cloud backup option; add browser storage quota warning

**No transcription progress feedback:**
- Problem: Transcription requests to external API give no user feedback while waiting
- Blocks: Users unclear if transcription is working or hung
- Recommendation: Add progress indicator; show API response time; allow cancellation; cache recent transcriptions

**No audio format conversion:**
- Problem: Only accepts WebM from recorder; export is WebM; some users may need MP3/AAC/WAV
- Blocks: Compatibility with other audio tools; file size optimization
- Recommendation: Add ffmpeg.wasm for client-side transcoding; or server-side conversion endpoint

## Test Coverage Gaps

**Recording state transitions untested:**
- What's not tested: Recording flow from setup → countdown → recording → pause → resume → stop/trim/save; edge cases like browser sleep during recording
- Files: `client/src/hooks/useRecorder.ts`, `client/src/components/RecordingPanel.tsx`
- Risk: Regression in recording feature goes unnoticed; pause/resume timing bugs
- Priority: High (core feature)

**Audio operations error handling:**
- What's not tested: Audio decode failures, format mismatches, corrupted blobs, insufficient browser storage
- Files: `client/src/services/audioUtils.ts`, `client/src/services/audioTrimmer.ts`
- Risk: Corrupted audio files crash app; no graceful degradation
- Priority: High (data integrity)

**Import/Export round-trip integrity:**
- What's not tested: Export project, then import it back; verify all data matches (cards, audio durations, metadata)
- Files: `client/src/services/exportProject.ts`, `client/src/services/importProject.ts`
- Risk: Data loss or corruption during export/import cycle
- Priority: High (data preservation)

**Master playback timing accuracy:**
- What's not tested: Multi-card sequential playback timing; verify currentTime matches expected duration of previous cards
- Files: `client/src/hooks/useMasterPlayer.ts`
- Risk: Timing skew accumulates; playback progress bar desynchronizes
- Priority: Medium (UX degradation)

**History undo/redo state consistency:**
- What's not tested: Complex undo sequences; verify database state matches after multiple undo/redo operations
- Files: `client/src/contexts/HistoryContext.tsx`
- Risk: History state diverges from actual IndexedDB; undo restores wrong version
- Priority: Medium (data safety)

**TranscriptionContext API failure paths:**
- What's not tested: Network failures, API timeouts, invalid responses, malformed JSON
- Files: `client/src/services/transcription.ts`
- Risk: Unhandled API errors cause app crashes; no user feedback
- Priority: Medium (reliability)

---

*Concerns audit: 2026-01-22*
