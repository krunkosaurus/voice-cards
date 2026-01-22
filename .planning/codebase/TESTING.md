# Testing Patterns

**Analysis Date:** 2026-01-22

## Test Framework

**Runner:**
- Vitest 2.1.4
- Config: Not yet configured (vitest installed but no vitest.config.ts file exists)
- Uses Vite as the underlying build system

**Assertion Library:**
- Not yet configured (no test files exist)
- Recommendation: Use Vitest's built-in assertion methods or install additional library

**Run Commands:**
```bash
# Tests not yet configured - would typically be:
npm run test              # Run all tests (command not yet in package.json)
npm run test:watch       # Watch mode (not configured)
npm run test:coverage    # Coverage report (not configured)
```

**TypeScript Support:**
- TypeScript strict mode enabled in tsconfig.json
- Test files would need .test.ts or .spec.ts extensions
- Types available for React (19.2.1) and Node

## Test File Organization

**Current State:**
- No test files exist in the codebase
- Vitest is installed and available
- Structure should follow conventions for new tests:

**Location:**
- Co-located with source files (recommended pattern for this project size)
- Or separate `__tests__` directories at module level

**Naming:**
- Component tests: `ComponentName.test.tsx`
- Service tests: `serviceName.test.ts`
- Hook tests: `useHookName.test.ts`
- Utility tests: `utils.test.ts`

**Structure:**
```
client/src/
├── components/
│   ├── Card.tsx
│   ├── Card.test.tsx          # Co-located test
│   └── ...
├── hooks/
│   ├── useProject.ts
│   ├── useProject.test.ts      # Co-located test
│   └── ...
├── services/
│   ├── db.ts
│   ├── db.test.ts              # Co-located test
│   └── ...
└── lib/
    ├── utils.ts
    └── utils.test.ts           # Co-located test
```

## Test Structure

**Suite Organization:**
When tests are implemented, follow this pattern observed in the codebase:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react'; // would need to install

describe('Card Component', () => {
  describe('rendering', () => {
    it('should render card with title', () => {
      // Test implementation
    });
  });

  describe('interactions', () => {
    it('should play audio on button click', () => {
      // Test implementation
    });
  });
});
```

**Patterns:**
- Setup pattern: Use `beforeEach` for common component/provider setup
- Teardown pattern: Use `afterEach` for cleanup (closing databases, unmounting)
- Assertion pattern: expect() with specific matchers for UI testing

## Mocking

**Framework:** Vitest provides built-in mocking via `vi` object

**Patterns:**
Areas that need mocking when tests are implemented:

```typescript
// Mock IndexedDB operations
vi.mock('@/services/db', () => ({
  getAudio: vi.fn(),
  saveProject: vi.fn(),
  getAllCards: vi.fn(),
}));

// Mock external APIs
vi.mock('@/services/transcription', () => ({
  transcribeAudio: vi.fn(),
}));

// Mock browser APIs
global.AudioContext = vi.fn();
global.fetch = vi.fn();
```

**What to Mock:**
- Database operations (`@/services/db.ts` - IndexedDB calls)
- External APIs (transcription service, Google Maps)
- Browser Audio APIs (AudioContext, MediaRecorder)
- File I/O operations (export/import)
- Network requests (fetch calls)
- Timer functions (setTimeout, setInterval) for animation testing

**What NOT to Mock:**
- React hooks and Context API (render with providers instead)
- Radix UI components (use real components)
- Tailwind CSS classes
- Component composition and render logic
- State management logic (test through user interactions)

## Fixtures and Factories

**Test Data:**
When implementing tests, create factories for common objects:

```typescript
// fixtures/cardFactory.ts
import type { Card } from '@/types';

export const createMockCard = (overrides?: Partial<Card>): Card => ({
  id: 'test-card-1',
  label: 'Test Card',
  notes: '',
  tags: [],
  color: 'neutral',
  duration: 30,
  order: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

export const createMockAppState = (overrides?: Partial<AppState>): AppState => ({
  cards: [createMockCard()],
  // ... other fields
  ...overrides,
});
```

**Location:**
- Create `client/src/__fixtures__` directory for shared test factories
- Or `client/src/__mocks__` for mock implementations
- Import from fixtures in test files

## Coverage

**Requirements:** Not enforced (no coverage configuration)

**Implement when needed:**
```bash
# Command to generate coverage report
npm run test:coverage
```

**Coverage targets when implementing:**
- Components: 80%+ (UI logic important)
- Services: 90%+ (business logic critical)
- Hooks: 85%+
- Utilities: 95%+

**View Coverage:**
```bash
vitest run --coverage
# Generates coverage/index.html report
```

## Test Types

**Unit Tests:**
- Scope: Individual functions, hooks, and utility functions
- Approach: Test with various inputs, edge cases, and error conditions
- Example areas: `utils.ts` functions (formatTime, uuid, slugify, cn)
- Example: `services/db.ts` database operations with mocked IndexedDB

**Integration Tests:**
- Scope: Component interactions with Context/state management
- Approach: Render with providers, test through user interactions
- Example areas: Card component with ProjectProvider, Header with theme context
- Example: CardList with drag-and-drop interactions
- Testing that state changes propagate through the app

**E2E Tests:**
- Framework: Not currently used
- Could be added with Playwright or Cypress if needed
- Would test full user flows: record -> edit -> export -> import

## Common Patterns

**Async Testing:**
```typescript
it('should load audio when card mounts', async () => {
  render(<Card card={mockCard} ... />);

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument();
  });
});

// For Promise-returning functions:
it('should transcribe audio', async () => {
  const result = await transcribeAudio(mockBlob);
  expect(result).toHaveLength(3); // 3 segments
});
```

**Error Testing:**
```typescript
it('should handle transcription errors', async () => {
  vi.mocked(transcribeAudio).mockRejectedValue(
    new Error('Transcription failed')
  );

  render(<Card card={mockCard} ... />);

  // Trigger transcription
  fireEvent.click(screen.getByRole('button', { name: /transcribe/i }));

  await waitFor(() => {
    expect(screen.getByText(/transcription failed/i)).toBeInTheDocument();
  });
});
```

**Context Testing:**
```typescript
it('should use project context', () => {
  render(
    <ProjectProvider>
      <TestComponent />
    </ProjectProvider>
  );

  // Component has access to context value
  expect(screen.getByText(/cards loaded/i)).toBeInTheDocument();
});

// Testing context updates:
it('should add card to context', () => {
  const { rerender } = render(
    <ProjectProvider>
      <CardList />
    </ProjectProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: /add card/i }));

  expect(screen.getAllByRole('article')).toHaveLength(2); // 1 + new card
});
```

## Testing Libraries Needed

When implementing tests, install:
```bash
npm install -D @testing-library/react @testing-library/user-event vitest
```

**Libraries to consider:**
- @testing-library/react - Component testing utilities
- @testing-library/user-event - User interaction simulation
- @vitest/ui - Visual test runner interface
- happy-dom or jsdom - DOM implementation for testing

## Next Steps for Test Implementation

1. Create vitest.config.ts:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});
```

2. Add test scripts to package.json:
```json
{
  "scripts": {
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest run --coverage"
  }
}
```

3. Install testing libraries
4. Start with highest-impact areas: services (db.ts, transcription.ts), utils, then components

---

*Testing analysis: 2026-01-22*
