# Codebase Structure

**Analysis Date:** 2026-01-22

## Directory Layout

```
voice-cards/
├── client/                  # React SPA application
│   ├── public/              # Static assets
│   ├── src/
│   │   ├── components/      # React components
│   │   │   ├── ui/          # Radix UI primitive wrappers
│   │   │   └── *.tsx        # Feature components
│   │   ├── contexts/        # Context API providers
│   │   ├── hooks/           # Custom React hooks
│   │   ├── pages/           # Page components
│   │   ├── services/        # Domain logic and utilities
│   │   ├── types/           # TypeScript type definitions
│   │   ├── lib/             # Shared utilities
│   │   ├── main.tsx         # React entry point
│   │   ├── App.tsx          # Root component
│   │   ├── index.css        # Global styles
│   │   └── const.ts         # Client constants
│   └── vite.config.ts       # Vite configuration
├── server/                  # Express server
│   └── index.ts             # Server entry point
├── shared/                  # Shared constants
│   └── const.ts             # Shared constants
├── .planning/               # GSD planning documents
│   └── codebase/            # Architecture analysis
├── dist/                    # Built output
├── node_modules/            # Dependencies
├── package.json             # Project manifest
├── tsconfig.json            # TypeScript config
├── vite.config.ts           # Vite build config
└── pnpm-lock.yaml           # Lock file
```

## Directory Purposes

**client/:**
- Purpose: React Single Page Application frontend
- Contains: Components, hooks, services, types, styling
- Key files: `src/main.tsx` (entry), `src/App.tsx` (root component), `src/pages/Home.tsx` (main page)

**client/src/components/:**
- Purpose: Reusable React components
- Contains: UI components, feature components, layout components
- Key files:
  - `ui/` subdirectory: Radix UI wrapped primitives (button, dialog, card, etc.)
  - Feature components: Header, CardList, Card, PlaybackBar, RecordingPanel, EditCardModal, AudioTrimmer

**client/src/components/ui/:**
- Purpose: Reusable UI primitives built on Radix UI
- Contains: Wrapper components for Radix components (20+ files)
- Key files: button, card, dialog, input-group, sheet, sidebar, table
- Pattern: Consistent styling with Tailwind CSS via clsx/tailwind-merge

**client/src/contexts/:**
- Purpose: Global state and context providers
- Contains: ProjectContext (main app state), HistoryContext (undo/redo), ThemeContext (theming)
- Key files:
  - `ProjectContext.tsx`: Cards, playback, recording, UI state management
  - `HistoryContext.tsx`: Undo/redo functionality with state snapshots
  - `ThemeContext.tsx`: Light/dark mode management

**client/src/hooks/:**
- Purpose: Custom React hooks for domain logic
- Contains: Recording, playback, keyboard shortcuts, composition
- Key files:
  - `useMasterPlayer.ts`: Sequential audio playback control
  - `useRecorder.ts`: Audio recording via Web Audio API
  - `useKeyboardShortcuts.ts`: Application keyboard bindings
  - `useComposition.ts`: Composition-related utilities

**client/src/pages/:**
- Purpose: Page-level components for routing
- Contains: Full page layouts
- Key files:
  - `Home.tsx`: Main application page (orchestrates all features)
  - `NotFound.tsx`: 404 page

**client/src/services/:**
- Purpose: Business logic, data operations, and utilities
- Contains: Database operations, audio processing, import/export
- Key files:
  - `db.ts`: IndexedDB CRUD operations (cards, audio, project, settings)
  - `audioUtils.ts`: Audio blob manipulation (append, split, trim)
  - `audioTrimmer.ts`: Advanced audio trimming/splitting
  - `waveformGenerator.ts`: Waveform visualization data generation
  - `exportProject.ts`: Export cards + audio as ZIP
  - `importProject.ts`: Import ZIP files into app
  - `exportAudio.ts`: Export individual card audio
  - `transcription.ts`: Speech-to-text integration

**client/src/types/:**
- Purpose: TypeScript type definitions
- Contains: Interfaces and types for domain model
- Key files:
  - `index.ts`: Core types (Card, Project, Settings, AppState, etc.)
  - `history.ts`: History-related types

**client/src/lib/:**
- Purpose: Utility functions and constants
- Contains: Helper functions, path aliases, UI utilities
- Key files:
  - `utils.ts`: uuid generation, className utilities
  - `constants.ts`: Magic numbers and constants

**shared/:**
- Purpose: Code shared between client and server
- Contains: Constants usable in both environments
- Key files: `const.ts` (cookie names, time values)

**server/:**
- Purpose: Express HTTP server for production deployment
- Contains: Server configuration and routing
- Key files: `index.ts` (main server entry, static file serving)

## Key File Locations

**Entry Points:**
- `client/src/main.tsx`: React DOM mount point
- `client/src/App.tsx`: Root React component with provider setup
- `client/src/pages/Home.tsx`: Main application page
- `server/index.ts`: Express server startup

**Configuration:**
- `package.json`: Dependencies, scripts, pnpm configuration
- `tsconfig.json`: TypeScript compiler options, path aliases (@/, @shared/)
- `vite.config.ts`: Vite build and dev server settings
- `.prettierrc`: Code formatting rules
- `components.json`: shadcn/ui component metadata (if using CLI)

**Core Logic:**
- `client/src/contexts/ProjectContext.tsx`: Application state management and card CRUD
- `client/src/contexts/HistoryContext.tsx`: Undo/redo functionality
- `client/src/hooks/useMasterPlayer.ts`: Audio playback orchestration
- `client/src/services/db.ts`: IndexedDB data layer

**Testing:**
- No test files currently present
- No test configuration (vitest installed but not configured)

## Naming Conventions

**Files:**
- Components: PascalCase with .tsx extension (e.g., `CardList.tsx`, `EditCardModal.tsx`)
- Services: camelCase with .ts extension (e.g., `audioUtils.ts`, `waveformGenerator.ts`)
- Utilities: camelCase with .ts extension (e.g., `utils.ts`)
- Types: camelCase with .ts extension (e.g., `index.ts`, `history.ts`)
- Contexts: PascalCase with Context suffix (e.g., `ProjectContext.tsx`)
- Hooks: camelCase with "use" prefix (e.g., `useMasterPlayer.ts`, `useRecorder.ts`)

**Directories:**
- Plural names for collections: `components/`, `contexts/`, `hooks/`, `services/`, `pages/`, `types/`
- Lowercase: `ui/`, `lib/`, `public/`
- Domain areas: Organized by feature (not by file type)

**TypeScript/React:**
- Types: PascalCase (Card, Project, AppState, TranscriptSegment)
- Interfaces: PascalCase (ProjectContextValue, HistoryContextValue)
- Functions: camelCase (useProject, addCard, createSnapshot)
- Constants: UPPER_SNAKE_CASE (DB_NAME, MAX_HISTORY_SIZE)
- React components: PascalCase function names (Home, Header, CardList)

## Where to Add New Code

**New Feature (e.g., collaborative editing, cloud sync):**
- Primary code: `client/src/services/newFeature.ts`
- Context updates: `client/src/contexts/ProjectContext.tsx` (add action types and state)
- Components: `client/src/components/NewFeatureUI.tsx`
- Types: Add to `client/src/types/index.ts`
- Database: Update `client/src/services/db.ts` if new stores needed

**New UI Component:**
- Implementation: `client/src/components/ComponentName.tsx`
- If it's a primitive: `client/src/components/ui/componentName.tsx`
- If it's a feature: `client/src/components/ComponentName.tsx` (directly in components/)
- Follow Radix UI + Tailwind CSS pattern seen in existing components

**New Custom Hook:**
- Location: `client/src/hooks/useFeatureName.ts`
- Export hook and type signature
- Document with comments if logic is non-obvious

**Utilities/Helpers:**
- Shared utilities: `client/src/lib/utils.ts` (if small)
- Feature-specific: `client/src/services/featureName.ts` (if larger service)
- Shared across client/server: `shared/const.ts` or `shared/utils.ts` (if applicable)

**Type Definitions:**
- Core domain types: `client/src/types/index.ts`
- Feature-specific types: Create `client/src/types/featureName.ts` if substantial
- Cross-cutting types (history, validation): Consider appropriateness of location

**Database Changes:**
- Schema changes: Update `initDB()` function in `client/src/services/db.ts`
- New CRUD operations: Add functions in `client/src/services/db.ts` following existing patterns
- Increment DB_VERSION and add upgrade logic for schema migrations

**Pages/Routes:**
- New routes: Create page in `client/src/pages/PageName.tsx`
- Register in App.tsx router (wouter Switch/Route)
- Add link/navigation from Header or other navigation component

## Special Directories

**node_modules/:**
- Purpose: Installed npm dependencies
- Generated: Yes
- Committed: No (git ignored)

**dist/:**
- Purpose: Build output
- Generated: Yes (by `npm run build`)
- Committed: No (git ignored)
- Structure: dist/public/ contains Vite output (HTML, JS, CSS), dist/index.js is bundled server

**.planning/codebase/:**
- Purpose: GSD mapping documents
- Generated: No (maintained by claude code)
- Committed: Yes
- Contents: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md

**patches/:**
- Purpose: Local npm package patches
- Generated: No
- Committed: Yes
- Notable: Contains patch for wouter@3.7.1 (custom fork handling)

**.claude/:**
- Purpose: Claude-specific project metadata
- Generated: Yes (by Claude Code)
- Committed: No (git ignored)

## Architecture Decisions

**Monorepo Layout:**
- Three independent directories (client, server, shared) in single package.json workspace
- Allows code sharing via path aliases while keeping concerns separated
- Server is minimal (static file serving only), not a full backend

**Vite for Client Build:**
- Fast dev experience with HMR
- Smaller bundle size than Create React App
- Manual configuration needed for aliases and env variables

**IndexedDB for Data:**
- Browser-based persistence without backend
- Allows offline-first operation
- Manual sync/export needed for backup (no automatic cloud sync)

**React Context instead of Redux:**
- Simpler for this app's state complexity
- useReducer provides predictable state updates
- No middleware needed for current requirements

**Express for Server:**
- Minimal - only serves static files and handles SPA fallback
- Could be replaced with any static file server (Nginx, Vercel, etc.)
- No API routes needed (data is local)

---

*Structure analysis: 2026-01-22*
