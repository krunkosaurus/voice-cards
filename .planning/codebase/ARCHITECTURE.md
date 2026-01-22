# Architecture

**Analysis Date:** 2026-01-22

## Pattern Overview

**Overall:** Client-server SPA with centralized state management and local-first data persistence

**Key Characteristics:**
- React 19 SPA with Vite build system
- Context API for state management with useReducer pattern
- IndexedDB for client-side data persistence
- Express server for static file serving
- Component-driven UI with Radix UI primitive components
- Modular service layer for domain logic (audio, export/import, database)

## Layers

**Presentation Layer:**
- Purpose: User interface components and page routing
- Location: `client/src/components/`, `client/src/pages/`
- Contains: React components (layouts, modals, cards), UI primitives, pages
- Depends on: Contexts, Hooks, Services, Types
- Used by: React rendering pipeline

**State Management Layer:**
- Purpose: Global application state, actions, and persistence triggers
- Location: `client/src/contexts/`
- Contains: ProjectContext (cards, playback, recording, settings), HistoryContext (undo/redo), ThemeContext
- Depends on: Types, Services (db)
- Used by: Components via hooks (useProject, useHistory)

**Domain Logic Layer:**
- Purpose: Audio processing, data import/export, utility functions
- Location: `client/src/services/`
- Contains: Audio utilities, export/import logic, transcription, waveform generation, audio trimming
- Depends on: Types, DB layer, External APIs
- Used by: Components, Contexts, Hooks

**Data Persistence Layer:**
- Purpose: IndexedDB operations and local storage management
- Location: `client/src/services/db.ts`
- Contains: CRUD operations for cards, audio, project metadata, settings
- Depends on: Types, idb package
- Used by: Contexts, Services, Hooks

**Server Layer:**
- Purpose: HTTP server and static file serving
- Location: `server/index.ts`
- Contains: Express app configuration, route handlers for SPA fallback
- Depends on: Express, file system
- Used by: Deployment/production

**Shared Layer:**
- Purpose: Constants and utilities shared across client and server
- Location: `shared/`
- Contains: Constants (cookie names, time values), utility functions
- Depends on: Nothing
- Used by: Client and server modules

## Data Flow

**Recording Flow:**

1. User initiates recording via UI (RecordingSetupModal)
2. RecordingPanel captures audio using Web Audio API (via useRecorder hook)
3. On save: Audio blob stored in IndexedDB (`db.saveAudio()`), card metadata in cards store
4. ProjectContext reducer updates global state: ADD_CARD or UPDATE_CARD action
5. useEffect in ProjectContext persists card to IndexedDB
6. Card added to filtered cards list in Home.tsx, triggers re-render
7. History context records snapshot of cards + audio for undo/redo

**Playback Flow:**

1. User clicks play button on card or master timeline
2. useMasterPlayer hook loads audio blob from IndexedDB via getAudio()
3. Creates Audio element with Blob URL, sets playback rate
4. Updates globalTime and currentCardProgress via requestAnimationFrame
5. Dispatches time updates to ProjectContext via onTimeUpdate callback
6. PlaybackBar and CardList UI update in sync with playback state
7. On next card: playCard() function loads next audio blob, manages sequential playback

**State Initialization:**

1. App mounts → ProjectProvider useEffect fires
2. Calls initDB() to open IndexedDB connection
3. getAllCards(), getProject(), getSettings() queries run in parallel
4. Results dispatched via INIT_STATE action to reducer
5. Cards sorted by order field (with createdAt fallback for legacy)
6. ThemeProvider applies saved theme from settings
7. HistoryProvider initialized with empty past/future stacks

**Edit Flow:**

1. User clicks edit button on card → EditCardModal opens with card data
2. Form updates trigger temp state in modal component
3. On save: updateCard() dispatched to ProjectContext
4. Card updated in IndexedDB via saveCard()
5. History snapshot created for undo/redo
6. Card re-renders in CardList with new metadata

**Export/Import Flow:**

1. **Export:** exportProject() serializes cards + audio → ZIP file with JSON metadata + individual WAV files
2. **Import:** importProject() parses ZIP, validates schema, saves cards and audio to IndexedDB
3. Dialog prevents concurrent import/export via isImporting/isExporting UI flags

**State Management:**

- **AppState:** Managed by ProjectContext reducer with 8 action types (SET_CARDS, ADD_CARD, UPDATE_CARD, DELETE_CARD, REORDER_CARDS, SET_PLAYBACK, SET_RECORDING, SET_UI, SET_THEME, SET_TRANSCRIPTS_ENABLED, INIT_STATE)
- **Playback state:** Tracks isPlaying, currentCardId, currentTime (within card), globalTime (timeline), totalDuration
- **Recording state:** Tracks isRecording, targetPosition (insertion point), mode (new/re-record/append), targetCardId
- **UI state:** editingCardId, confirmDialog, isExporting, isImporting, searchQuery
- **Settings:** Persisted separately, theme + transcriptsEnabled
- **History state:** Stacks of past/future HistoryActions with full card snapshots + audio blobs

## Key Abstractions

**Card Model:**
- Purpose: Represents a single voice recording unit with metadata
- Examples: `client/src/types/index.ts`
- Pattern: Immutable data structure with id, label, notes, tags, color, duration, order, timestamps
- Contains optional waveformData and transcript segments
- Used throughout: state, components, persistence

**HistoryAction:**
- Purpose: Encapsulates before/after state for undo/redo operations
- Examples: Used in HistoryContext.tsx
- Pattern: Stores complete snapshots of cards array + affected audio blobs
- Enables reverting state changes and audio modifications

**AudioContext (implicit via hooks):**
- Purpose: Manages audio playback lifecycle and synchronization
- Examples: useMasterPlayer hook, useRecorder hook
- Pattern: Encapsulates Web Audio API and HTML5 audio element management
- Handles timing, buffering, sequential playback

**Project Metadata:**
- Purpose: Stores project-level metadata (creation/update timestamps)
- Examples: `client/src/types/index.ts` Project interface
- Pattern: Singleton stored in IndexedDB, automatically updated on card changes

## Entry Points

**Client Application:**
- Location: `client/src/main.tsx`
- Triggers: Browser load of index.html
- Responsibilities: Mount React app to DOM, initialize root context providers

**Application Root:**
- Location: `client/src/App.tsx`
- Triggers: Called by main.tsx
- Responsibilities: Set up provider hierarchy (ErrorBoundary, ThemeProvider, ProjectProvider, HistoryProviderWrapper, TooltipProvider), initialize router with Home page

**Home Page:**
- Location: `client/src/pages/Home.tsx`
- Triggers: Route "/" matches
- Responsibilities: Main application layout, orchestrate all major components (Header, CardList, PlaybackBar, RecordingPanel, modals), manage top-level recording/editing state, implement keyboard shortcuts

**Server Entry:**
- Location: `server/index.ts`
- Triggers: Node process startup in production
- Responsibilities: Start Express server, serve static files from dist/public, handle SPA fallback routing (/* → index.html)

## Error Handling

**Strategy:** Layered error handling with user-facing toasts and console logging

**Patterns:**
- IndexedDB errors: Logged to console, displayed via toast notifications (sonner)
- Recording errors: Caught in RecordingPanel component, toast notification prevents silent failures
- Playback errors: useMasterPlayer catches audio load failures, logs to console
- History operations (undo/redo): Try-catch with toast feedback (success/error messages)
- Unhandled component errors: ErrorBoundary component catches React errors, prevents white screen
- Validation: Form validation via react-hook-form with Zod schemas in EditCardModal

## Cross-Cutting Concerns

**Logging:**
- Ad-hoc console.log/error statements for debugging
- No centralized logging service
- Visible in browser dev tools and server stdout

**Validation:**
- Client-side form validation: react-hook-form + Zod in EditCardModal
- Card metadata validation: TypeScript type checking
- Audio file validation: Implicit through blob operations and duration parsing

**Authentication:**
- OAuth portal integration available (constants in client/src/const.ts)
- getLoginUrl() generates dynamic OAuth URLs
- Current implementation: No authentication enforced (local-first app)
- Credential handling: Environment variables (VITE_OAUTH_PORTAL_URL, VITE_APP_ID)

**Persistence:**
- Automatic via useEffect patterns in ProjectContext
- Cards persist on every state change (useEffect dependency on state.cards)
- Settings persist on state.settings change
- Audio persists separately in saveAudio() calls (decoupled from card metadata)

**Theming:**
- ThemeContext wrapper provides light/dark mode toggle
- next-themes integration for system preference detection
- Theme setting persisted in settings store
- CSS class binding via theme attribute on root element

---

*Architecture analysis: 2026-01-22*
