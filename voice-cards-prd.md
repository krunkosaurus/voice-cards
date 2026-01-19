# PRD: Voice Cards

**Version:** 2.0 Final  
**Date:** January 19, 2025  
**Status:** Ready for Development

---

## Table of Contents

1. [Overview](#overview)
2. [User Stories](#user-stories)
3. [Feature Specifications](#feature-specifications)
   - [Recording](#1-recording)
   - [Card Data Model](#2-card-data-model)
   - [Card UI Component](#3-card-ui-component)
   - [Card List / Timeline](#4-card-list--timeline)
   - [Master Playback Controls](#5-master-playback-controls)
   - [Edit Modal](#6-edit-modal)
   - [Delete Confirmation](#7-delete-confirmation-dialog)
   - [Clear Project](#8-clear-project)
   - [Export (ZIP)](#9-export-zip)
   - [Import (ZIP)](#10-import-zip)
   - [Theme Toggle](#11-theme-toggle)
4. [Application Layout](#application-layout)
5. [Technical Architecture](#technical-architecture)
6. [Responsive Design](#responsive-breakpoints)
7. [Accessibility](#accessibility)
8. [Error Handling](#error-handling)
9. [Performance Considerations](#performance-considerations)
10. [Out of Scope](#out-of-scope-v1)

---

## Overview

A single-page web application for recording, organizing, and sequencing audio clips. Users record voice memos, organize them as draggable cards in a vertical timeline, and play them back as a continuous sequence. All data persists in IndexedDB. Users can export their project as a ZIP (individual files + merged audio + config) and import a ZIP to restore.

---

## User Stories

1. **As a user**, I can record audio of any length and see a live waveform so I know my mic is working.
2. **As a user**, I can save recordings as cards with labels, notes, tags, and color coding.
3. **As a user**, I can re-record or append to an existing card's audio.
4. **As a user**, I can reorder cards via drag-and-drop.
5. **As a user**, I can insert a new recording at any position in the timeline.
6. **As a user**, I can play individual cards in full.
7. **As a user**, I can play all cards in sequence with a master play button.
8. **As a user**, I can see playback progress via a global slider and card highlighting.
9. **As a user**, I can click any card to jump to it during playback.
10. **As a user**, I can export my project as a ZIP file containing all audio and configuration.
11. **As a user**, I can import a ZIP file to restore a project (overwrites current).
12. **As a user**, I can clear the entire project with confirmation.
13. **As a user**, I can switch between dark and light mode.

---

## Feature Specifications

### 1. Recording

| Aspect | Spec |
|--------|------|
| Duration | Unlimited |
| Format | WebM (Opus codec) |
| Waveform | Real-time visualization using AnalyserNode FFT data |
| Controls | Record, Stop, Cancel |
| Feedback | Elapsed time counter, pulsing red indicator, live waveform |

#### Recording Panel

- Slides in or appears as modal when user taps "New Recording" or an insertion button
- Live waveform canvas (full width, ~100px height)
- Elapsed time display: `00:00` format, updates every 100ms
- Buttons: Cancel (discard & close), Stop (save & close)

#### Waveform Rendering

- Use `AnalyserNode.getByteTimeDomainData()` for time-domain waveform
- Canvas renders at 60fps during recording
- Green/teal color for waveform line against dark background

---

### 2. Card Data Model

| Field | Type | Required | Default | Editable |
|-------|------|----------|---------|----------|
| `id` | string (UUID) | Yes | Generated | No |
| `audioBlob` | Blob | Yes | — | Yes (re-record/append) |
| `label` | string | No | "Untitled" | Yes |
| `notes` | string | No | "" | Yes |
| `tags` | string[] | No | [] | Yes |
| `color` | string (enum) | No | "neutral" | Yes |
| `duration` | number (seconds) | Yes | Calculated | Auto |
| `createdAt` | string (ISO) | Yes | Generated | No |
| `updatedAt` | string (ISO) | Yes | Generated | Auto |

#### Color Options

| Key | Hex | Display Name |
|-----|-----|--------------|
| neutral | #6B7280 | Gray |
| red | #EF4444 | Red |
| orange | #F97316 | Orange |
| yellow | #EAB308 | Yellow |
| green | #22C55E | Green |
| blue | #3B82F6 | Blue |
| purple | #8B5CF6 | Purple |
| pink | #EC4899 | Pink |

---

### 3. Card UI Component

```
┌─[color bar 4px]─────────────────────────┐
│                                         │
│  ▶  Label Text Here              01:23  │
│     [tag1] [tag2] [tag3]            ⋮   │
│     Notes preview text truncat...       │
│                                         │
└─────────────────────────────────────────┘
```

#### Elements

- **Color bar**: 4px solid bar at top edge in card's color
- **Play button**: Left side, plays this card's audio in full
- **Label**: Bold, primary text color, truncate with ellipsis if > 1 line
- **Duration**: Right-aligned, muted color, format `MM:SS`
- **Tags**: Row of small pills below label, muted background, max 3 visible + "+N more"
- **Notes**: Truncated to ~60 chars, italic, secondary text color
- **Menu button**: Three-dot icon, right side, opens dropdown

#### Card States

| State | Visual Treatment |
|-------|------------------|
| Default | Subtle border, background surface color |
| Hover (desktop) | Slight elevation/shadow |
| Dragging | Elevated shadow, slight rotation (2°), reduced opacity on original position |
| Playing | Accent border glow or left accent bar, background tint |

#### Overflow Menu Actions

| Action | Icon | Behavior |
|--------|------|----------|
| Edit Details | Pencil | Opens edit modal |
| Re-record | Microphone | Opens recorder, replaces audio |
| Append Audio | Plus-circle | Opens recorder, appends to end |
| Duplicate | Copy | Creates copy below this card |
| Delete | Trash | Confirmation dialog, then removes |

---

### 4. Card List / Timeline

```
┌─────────────────────────────────────────┐
│         [+ Add Recording Here]          │
├─────────────────────────────────────────┤
│              Card 1                     │
├─────────────────────────────────────────┤
│         [+ Add Recording Here]          │
├─────────────────────────────────────────┤
│              Card 2                     │
├─────────────────────────────────────────┤
│         [+ Add Recording Here]          │
└─────────────────────────────────────────┘
```

#### Insertion Buttons

- Dashed border, muted text "+ Add Recording"
- On hover/tap: border solidifies, text brightens
- Clicking opens recording panel; on save, card inserts at that position

#### Empty State

- Centered illustration or icon (microphone)
- Text: "No voice cards yet"
- Subtext: "Tap below to record your first clip"
- Prominent "+ Record" button

#### Drag and Drop

- Use `@dnd-kit/core` (React) for accessible, touch-friendly sorting
- Drop zones highlight when dragging over
- Cards reorder in state array; `order` is implicit (array index)

---

### 5. Master Playback Controls

Fixed bottom bar:

```
┌─────────────────────────────────────────┐
│   advancement slider [━━━━━●━━━━━━━━━━]  │
│  [▶]  00:45 / 03:22                     │
└─────────────────────────────────────────┘
```

| Element | Behavior |
|---------|----------|
| Play/Pause button | Toggle. Icon changes between ▶ and ⏸ |
| Slider | Horizontal range input. Thumb shows position in total sequence. Draggable to seek. |
| Time display | `current / total` in `MM:SS` format |

#### Playback Logic

- Concatenate cards conceptually: card 0 is 0:00–duration[0], card 1 starts at cumulative, etc.
- Seeking via slider calculates which card and offset within that card
- Seamless playback: when one card ends, immediately start next (use `ended` event + pre-buffering)
- Currently-playing card: highlight style, auto-scroll into view if off-screen
- Click card during playback: jump to that card's start time
- End of sequence: pause, reset to 0:00, highlight nothing

---

### 6. Edit Modal

```
┌─────────────────────────────────────────┐
│  Edit Card                          ✕   │
├─────────────────────────────────────────┤
│                                         │
│  Label                                  │
│  ┌─────────────────────────────────┐    │
│  │ Introduction                    │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Notes                                  │
│  ┌─────────────────────────────────┐    │
│  │ Remember to speak slowly and    │    │
│  │ pause between sentences.        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Tags (comma-separated)                 │
│  ┌─────────────────────────────────┐    │
│  │ intro, v2, needs-review         │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Color                                  │
│  (●)(○)(○)(○)(○)(○)(○)(○)              │
│   ↑ selected                            │
│                                         │
│  Audio                    Duration: 1:23│
│  [▶ Play]  [Re-record]  [+ Append]      │
│                                         │
├─────────────────────────────────────────┤
│              [Cancel]   [Save]          │
└─────────────────────────────────────────┘
```

#### Field Validation

| Field | Constraint |
|-------|------------|
| Label | Max 100 characters |
| Notes | Max 500 characters |
| Tags | Split by comma, trim whitespace, max 10 tags |

#### Audio Actions

| Action | Behavior |
|--------|----------|
| Play | Plays audio within modal |
| Re-record | Opens recording panel inline or as sub-modal; replaces blob on stop |
| Append | Opens recording panel; on stop, concatenates new audio to existing |

---

### 7. Delete Confirmation Dialog

```
┌─────────────────────────────────────────┐
│  Delete Card?                           │
├─────────────────────────────────────────┤
│                                         │
│  Are you sure you want to delete        │
│  "Introduction"? This cannot be undone. │
│                                         │
├─────────────────────────────────────────┤
│              [Cancel]   [Delete]        │
└─────────────────────────────────────────┘
```

- Delete button is red/destructive style
- Focus trapped in dialog
- Escape or Cancel closes without action

---

### 8. Clear Project

**Trigger:** Button in header/settings area: "Clear Project"

#### Confirmation Dialog

```
┌─────────────────────────────────────────┐
│  Clear Entire Project?                  │
├─────────────────────────────────────────┤
│                                         │
│  This will delete all cards and audio.  │
│  This cannot be undone. Consider        │
│  exporting first.                       │
│                                         │
├─────────────────────────────────────────┤
│        [Cancel]   [Clear Everything]    │
└─────────────────────────────────────────┘
```

**Behavior:**
- Clears all cards from IndexedDB
- Resets to empty state
- Preserves theme preference

---

### 9. Export (ZIP)

**Trigger:** Button in header: "Export Project"

#### ZIP Contents

```
voice-cards-export-2025-01-19T10-30-00/
├── project.json           # metadata + card config (no audio)
├── merged.webm            # all cards concatenated in order
└── cards/
    ├── 001-introduction.webm
    ├── 002-main-point.webm
    └── 003-conclusion.webm
```

#### project.json Structure

```json
{
  "version": 1,
  "appName": "Voice Cards",
  "exportedAt": "2025-01-19T10:30:00Z",
  "project": {
    "createdAt": "2025-01-15T08:00:00Z",
    "updatedAt": "2025-01-19T10:25:00Z"
  },
  "cards": [
    {
      "id": "uuid-1",
      "filename": "001-introduction.webm",
      "label": "Introduction",
      "notes": "Remember to speak slowly",
      "tags": ["intro", "v2"],
      "color": "blue",
      "duration": 45.2,
      "createdAt": "2025-01-15T08:05:00Z",
      "updatedAt": "2025-01-15T08:10:00Z"
    }
  ],
  "settings": {
    "theme": "dark"
  }
}
```

#### Filename Convention

- `{order+1 padded to 3 digits}-{label slugified}.webm`
- Example: `001-introduction.webm`

#### Merged Audio

- Use Web Audio API `OfflineAudioContext` to decode all blobs, concatenate, render
- Export as WebM

#### ZIP Library

Use `JSZip` for client-side ZIP creation

#### UX Flow

1. User clicks "Export Project"
2. Show progress modal: "Preparing export... Merging audio..."
3. On complete, trigger browser download
4. Close modal

---

### 10. Import (ZIP)

**Trigger:** Button in header: "Import Project"

#### UX Flow

1. User clicks "Import Project"
2. If cards exist, show warning: "This will replace your current project. Continue?"
3. File picker opens (accept `.zip`)
4. On select, validate ZIP structure
5. Show progress: "Importing..."
6. On success: load cards, show toast "Project imported successfully"
7. On error: show error message, keep current project

#### Validation Requirements

- Must contain `project.json`
- `project.json` must have valid structure
- Each card in config must have corresponding audio file in `cards/`
- Audio files must be playable (try decoding)

#### Import Logic

1. Parse `project.json`
2. For each card, read corresponding audio file from `cards/`
3. Store audio blobs in IndexedDB
4. Store card metadata in IndexedDB
5. Update UI state

---

### 11. Theme Toggle

**Location:** Header, icon button (sun/moon)

**Behavior:**
- Toggle between light and dark
- Persist preference in IndexedDB under settings
- Apply immediately via CSS custom properties or class on `<html>`

#### Color Tokens

| Token | Light | Dark |
|-------|-------|------|
| `--bg-primary` | #FFFFFF | #0F172A |
| `--bg-surface` | #F8FAFC | #1E293B |
| `--bg-elevated` | #FFFFFF | #334155 |
| `--text-primary` | #0F172A | #F1F5F9 |
| `--text-secondary` | #64748B | #94A3B8 |
| `--text-muted` | #94A3B8 | #64748B |
| `--border` | #E2E8F0 | #334155 |
| `--accent` | #3B82F6 | #60A5FA |
| `--accent-hover` | #2563EB | #3B82F6 |
| `--destructive` | #EF4444 | #F87171 |

---

## Application Layout

### Header

```
┌─────────────────────────────────────────┐
│  🎤 Voice Cards              [☀][⚙][⋮] │
└─────────────────────────────────────────┘
```

| Element | Purpose |
|---------|---------|
| Logo/Title | App identity |
| Theme toggle | Sun/moon icon |
| Settings/Menu | Dropdown with: Import, Export, Clear Project |

### Main Content Area

- Scrollable card list
- Max-width container on desktop (~600px), full-width on mobile
- Padding for comfortable reading

### Footer / Playback Bar

- Fixed to bottom of viewport
- Full width
- Slight elevation/shadow to separate from content
- Respects safe areas on mobile (notches, home indicators)

### Overall Structure

```
┌─────────────────────────────────────────┐
│                 Header                  │
├─────────────────────────────────────────┤
│                                         │
│                                         │
│             Card List                   │
│           (scrollable)                  │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│            Playback Bar                 │
└─────────────────────────────────────────┘
```

---

## Technical Architecture

### Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18 |
| Build | Vite |
| Language | TypeScript |
| Styling | CSS Modules or Tailwind CSS |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| ZIP | JSZip |
| Audio | Web Audio API (native) |
| Storage | IndexedDB via idb (lightweight wrapper) |
| State | React Context + useReducer (or Zustand) |

### File Structure

```
voice-cards/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── public/
│   └── favicon.svg
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    │
    ├── components/
    │   ├── Header/
    │   │   ├── Header.tsx
    │   │   └── Header.module.css
    │   ├── CardList/
    │   │   ├── CardList.tsx
    │   │   ├── Card.tsx
    │   │   ├── InsertionButton.tsx
    │   │   └── CardList.module.css
    │   ├── PlaybackBar/
    │   │   ├── PlaybackBar.tsx
    │   │   └── PlaybackBar.module.css
    │   ├── RecordingPanel/
    │   │   ├── RecordingPanel.tsx
    │   │   ├── Waveform.tsx
    │   │   └── RecordingPanel.module.css
    │   ├── Modals/
    │   │   ├── EditCardModal.tsx
    │   │   ├── ConfirmDialog.tsx
    │   │   └── Modals.module.css
    │   └── ui/
    │       ├── Button.tsx
    │       ├── IconButton.tsx
    │       ├── Slider.tsx
    │       └── Tag.tsx
    │
    ├── hooks/
    │   ├── useRecorder.ts
    │   ├── useAudioPlayer.ts
    │   ├── useMasterPlayer.ts
    │   └── useWaveform.ts
    │
    ├── context/
    │   ├── ProjectContext.tsx
    │   └── ThemeContext.tsx
    │
    ├── services/
    │   ├── db.ts              # IndexedDB operations
    │   ├── audioUtils.ts      # decode, concatenate, duration
    │   ├── exportProject.ts   # ZIP creation
    │   └── importProject.ts   # ZIP parsing & validation
    │
    ├── types/
    │   └── index.ts           # Card, Project, Settings interfaces
    │
    └── utils/
        ├── uuid.ts
        ├── formatTime.ts
        ├── slugify.ts
        └── cn.ts              # classname helper if needed
```

### IndexedDB Schema

**Database Name:** `voice-cards-db`

#### Object Stores

| Store | Key | Indexes | Data |
|-------|-----|---------|------|
| `project` | `"singleton"` | — | `{ createdAt, updatedAt }` |
| `cards` | `id` | — | Card metadata (no audio blob) |
| `audio` | `cardId` | — | `{ cardId, blob }` |
| `settings` | `"singleton"` | — | `{ theme }` |

**Why Separate Audio?**
- Keeps card metadata queries fast
- Audio blobs can be large; loading them lazily improves performance

### State Shape

```typescript
interface Card {
  id: string;
  label: string;
  notes: string;
  tags: string[];
  color: 'neutral' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink';
  duration: number;
  createdAt: string;
  updatedAt: string;
}

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  isDestructive?: boolean;
}

interface AppState {
  // Project
  project: {
    createdAt: string;
    updatedAt: string;
  };

  // Cards (ordered array)
  cards: Card[];

  // Playback
  playback: {
    isPlaying: boolean;
    currentCardId: string | null;
    currentTime: number;       // seconds into current card
    globalTime: number;        // seconds into total sequence
    totalDuration: number;
  };

  // Recording
  recording: {
    isRecording: boolean;
    targetPosition: number | null;  // insert index, or null for append
    mode: 'new' | 're-record' | 'append';
    targetCardId: string | null;    // for re-record/append
  };

  // UI
  ui: {
    editingCardId: string | null;
    confirmDialog: ConfirmDialogState | null;
    isExporting: boolean;
    isImporting: boolean;
  };

  // Settings
  settings: {
    theme: 'light' | 'dark';
  };
}
```

### Key Audio Operations

#### Recording

```typescript
// useRecorder.ts
const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
mediaRecorder.onstop = () => {
  const blob = new Blob(chunks, { type: 'audio/webm' });
  // Calculate duration via AudioContext.decodeAudioData
  // Save to IndexedDB
};
```

#### Waveform Visualization

```typescript
// useWaveform.ts
const analyser = audioContext.createAnalyser();
source.connect(analyser);
const dataArray = new Uint8Array(analyser.fftSize);

function draw() {
  analyser.getByteTimeDomainData(dataArray);
  // Draw to canvas
  requestAnimationFrame(draw);
}
```

#### Master Playback

```typescript
// useMasterPlayer.ts
// Maintain array of Audio elements or use single AudioContext with scheduled buffers
// On card end: check if next card exists, immediately play it
// Track global time by summing completed durations + current card time
```

#### Audio Concatenation (Export)

```typescript
// audioUtils.ts
async function mergeAudioBlobs(blobs: Blob[]): Promise<Blob> {
  const audioContext = new OfflineAudioContext(channels, totalLength, sampleRate);
  // Decode each blob, copy to buffer at offset
  // Render and encode result
}
```

---

## Responsive Breakpoints

| Breakpoint | Width | Adjustments |
|------------|-------|-------------|
| Mobile | < 640px | Full-width cards, larger touch targets, bottom sheet modals |
| Desktop | ≥ 640px | Centered container (max 600px), hover states, centered modals |

---

## Accessibility

| Requirement | Implementation |
|-------------|----------------|
| Keyboard navigation | All interactive elements focusable, logical tab order |
| Screen reader | ARIA labels on icon buttons, live regions for playback status |
| Focus management | Trap focus in modals, return focus on close |
| Color contrast | 4.5:1 minimum for text |
| Motion | Respect `prefers-reduced-motion` for animations |
| Touch targets | Minimum 44×44px on mobile |

---

## Error Handling

| Scenario | Response |
|----------|----------|
| Mic permission denied | Toast with instructions; disable record buttons |
| IndexedDB unavailable | Show persistent error banner; app non-functional |
| Audio decode failure | Show error on specific card; offer re-record |
| Import: invalid ZIP | Toast "Invalid file format" |
| Import: missing audio | Toast "Some audio files missing"; skip those cards |
| Export: merge fails | Toast error; offer to export without merged file |
| Storage quota exceeded | Warn when nearing limit; block new recordings at limit |

---

## Performance Considerations

- **Lazy load audio blobs**: Only fetch from IndexedDB when needed (playback, export)
- **Virtualize long lists**: If > 50 cards, consider virtualization (unlikely for typical use)
- **Debounce saves**: Batch IndexedDB writes during drag-and-drop reordering
- **Web Workers**: Consider offloading audio merge to worker for large projects

---

## Out of Scope (V1)

- Undo/redo
- Keyboard shortcuts
- Waveform thumbnails on cards
- Audio trimming/splitting
- Import external audio files
- Multiple projects
- Cloud sync
- PWA/offline
- Sharing/collaboration

---

## Appendix: TypeScript Interfaces

```typescript
// types/index.ts

export type CardColor = 
  | 'neutral' 
  | 'red' 
  | 'orange' 
  | 'yellow' 
  | 'green' 
  | 'blue' 
  | 'purple' 
  | 'pink';

export interface Card {
  id: string;
  label: string;
  notes: string;
  tags: string[];
  color: CardColor;
  duration: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  theme: 'light' | 'dark';
}

export interface AudioRecord {
  cardId: string;
  blob: Blob;
}

export interface ExportData {
  version: number;
  appName: string;
  exportedAt: string;
  project: Project;
  cards: Array<Card & { filename: string }>;
  settings: Settings;
}
```

---

## Appendix: Color Constants

```typescript
// constants/colors.ts

export const CARD_COLORS = {
  neutral: { hex: '#6B7280', name: 'Gray' },
  red: { hex: '#EF4444', name: 'Red' },
  orange: { hex: '#F97316', name: 'Orange' },
  yellow: { hex: '#EAB308', name: 'Yellow' },
  green: { hex: '#22C55E', name: 'Green' },
  blue: { hex: '#3B82F6', name: 'Blue' },
  purple: { hex: '#8B5CF6', name: 'Purple' },
  pink: { hex: '#EC4899', name: 'Pink' },
} as const;

export const THEME_TOKENS = {
  light: {
    bgPrimary: '#FFFFFF',
    bgSurface: '#F8FAFC',
    bgElevated: '#FFFFFF',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
    border: '#E2E8F0',
    accent: '#3B82F6',
    accentHover: '#2563EB',
    destructive: '#EF4444',
  },
  dark: {
    bgPrimary: '#0F172A',
    bgSurface: '#1E293B',
    bgElevated: '#334155',
    textPrimary: '#F1F5F9',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    border: '#334155',
    accent: '#60A5FA',
    accentHover: '#3B82F6',
    destructive: '#F87171',
  },
} as const;
```
