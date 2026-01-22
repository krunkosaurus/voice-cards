# Coding Conventions

**Analysis Date:** 2026-01-22

## Naming Patterns

**Files:**
- Components: PascalCase with .tsx extension (e.g., `Card.tsx`, `CardList.tsx`, `Header.tsx`)
- Services: camelCase with .ts extension (e.g., `db.ts`, `exportAudio.ts`, `transcription.ts`)
- Utilities: camelCase with .ts extension (e.g., `utils.ts`, `constants.ts`)
- Context files: PascalCase with Context suffix (e.g., `ProjectContext.tsx`, `ThemeContext.tsx`)
- Hooks: camelCase starting with "use" (e.g., `useRecorder.ts`, `useComposition.ts`)
- Types: index.ts for type definitions, history.ts for history types
- UI components: camelCase (e.g., `button.tsx`, `dropdown-menu.tsx`, `input-otp.tsx`)

**Functions:**
- React components: PascalCase (e.g., `Card`, `Header`, `ErrorBoundary`)
- Regular functions: camelCase (e.g., `formatTime`, `uuid`, `slugify`, `mergeCardAudio`)
- Custom hooks: camelCase starting with "use" (e.g., `useProject`, `useTheme`, `useHistory`)
- Helper/utility functions: camelCase (e.g., `cn`, `getAudio`, `saveProject`)
- API functions: camelCase (e.g., `transcribeAudio`)

**Variables:**
- State variables: camelCase (e.g., `isPlaying`, `currentCardId`, `editingCardId`)
- Constants: SCREAMING_SNAKE_CASE for shared constants (e.g., `COOKIE_NAME`, `ONE_YEAR_MS`)
- Type discriminants: SCREAMING_SNAKE_CASE (e.g., action types like `'SET_CARDS'`, `'ADD_CARD'`)
- Booleans: "is" or "has" prefix (e.g., `isRecording`, `hasError`, `isPlaying`)

**Types:**
- Interfaces: PascalCase (e.g., `Card`, `Project`, `Settings`, `AppState`, `ProjectContextValue`)
- Type unions: PascalCase (e.g., `CardColor`, `TranscriptSegment`)
- Generic parameters: PascalCase single letters or descriptive names (e.g., `T`, `CardType`)
- Props interfaces: ComponentNameProps pattern (e.g., `CardProps`, `HeaderProps`, `CardListProps`)

## Code Style

**Formatting:**
- Tool: Prettier 3.6.2
- Semi-colons: enabled (true)
- Quote style: double quotes for JSX/strings
- Print width: 80 characters
- Tab width: 2 spaces
- Trailing commas: es5 (include in objects/arrays, not function params)
- Arrow functions: omit parentheses for single params (`e =>` not `(e) =>`)
- Brace spacing: true (opening brace space)
- No bracket same line for closing braces (bracketSameLine: false)
- JSX quotes: double quotes
- Line endings: LF

**Linting:**
- No ESLint configuration file detected
- Relies on TypeScript strict mode for type safety

## Import Organization

**Order:**
1. React and external library imports (React, React DOM)
2. Third-party component libraries (Radix UI, form libraries, icons)
3. @dnd-kit imports for drag-and-drop
4. Project path aliases (@/, @shared/, @assets/)
5. Relative imports from sibling or parent directories
6. CSS/style imports last

**Path Aliases:**
- `@/*` → `./client/src/*` (primary client code)
- `@shared/*` → `./shared/*` (shared utilities and constants)
- `@assets/*` → `./attached_assets/*` (static assets)

**Example pattern from codebase:**
```typescript
import { Mic, Sun, Moon, MoreVertical, Download, Upload, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useTheme } from '@/contexts/ThemeContext';
import type { Card } from '@/types';
import { formatTime, cn } from '@/lib/utils';
import { getAudio } from '@/services/db';
```

## Error Handling

**Patterns:**
- Throw `new Error()` with descriptive message for runtime errors
- Hook context validation: throw errors when hooks used outside provider context
  ```typescript
  const useProject = () => {
    const context = useContext(ProjectContext);
    if (!context) {
      throw new Error('useProject must be used within ProjectProvider');
    }
    return context;
  }
  ```
- Try-catch blocks for async operations (database, API calls, file operations)
- Audio operations wrap in try-catch for graceful degradation
- Error Boundary component at app root for React error catching
- Service functions propagate errors with descriptive messages (not silent failures)
- Example from transcription service:
  ```typescript
  if (!response.ok) {
    throw new Error(`Transcription failed: ${response.status} ${response.statusText}`);
  }
  if (!data.success) {
    throw new Error(data.error || 'Transcription failed');
  }
  ```

## Logging

**Framework:** Native console object (console.error, console.log)

**Patterns:**
- Server startup: `console.log()` for initialization messages
- Errors: `console.error()` for caught exceptions
- Silent failures not used; errors always thrown/logged
- No debug logger configured - use console during development

## Comments

**When to Comment:**
- Design system notes: "/* Design: Warm Analog Tape Aesthetic - ... */" at file top
- Complex algorithm explanations (e.g., composition end handling in `useComposition.ts`)
- Important business logic clarifications
- Browser compatibility notes (e.g., Safari compositionEnd ordering issues)
- Integration guides for complex features (see Map component JSDoc block)

**JSDoc/TSDoc:**
- Used selectively for exported functions with non-obvious parameters
- Service functions documented with param/return descriptions
- Example from `exportAudio.ts`:
  ```typescript
  /**
   * Merge all card audio files into a single audio blob
   * @param cards - Array of cards to merge
   * @param silenceGap - Gap in seconds between cards (default: 0.5)
   * @returns Merged audio blob
   */
  export async function mergeCardAudio(
    cards: Card[],
    silenceGap: number = 0.5
  ): Promise<Blob>
  ```
- Inline documentation for complex maps (see Map.tsx with GOOGLE MAPS FRONTEND INTEGRATION guide)

## Function Design

**Size:**
- Prefer functions under 80 lines
- Complex reducers and component renders may exceed this
- Break large components into smaller sub-components (see CardList with SortableCard subcomponent)

**Parameters:**
- Use destructuring in function signatures for object parameters
- React component props destructured in parameter list
- Service functions accept domain objects (Card, Project) over primitives
- Optional callbacks handled with `?.()` null coalescing

**Return Values:**
- Async functions return Promise<T>
- Service functions return domain types or void
- Components return JSX.Element
- Custom hooks return object with handlers and state (see `useComposition`)
- Utility functions return primitives or domain objects

## Module Design

**Exports:**
- Named exports for functions and types (preferred over default)
- Default exports for React components only
- Contexts export both Provider component and custom hook
- Services export typed functions only (no internal helpers exposed)

**Barrel Files:**
- `types/index.ts` exports all type definitions
- No barrel files in components or services directories
- Direct imports used instead: `import { Card } from '@/components/Card'`

---

*Convention analysis: 2026-01-22*
