# Voice Cards

A web application for recording, organizing, and sequencing audio clips with a warm analog tape aesthetic.

## Features

### Core Functionality
- **Recording**: Unlimited duration audio recording with real-time waveform visualization
- **Card Timeline**: Draggable cards with color coding, labels, tags, and notes
- **Master Playback**: Sequential playback of all cards with global progress tracking
- **Edit Modal**: Full card editing with metadata and audio controls
- **Export/Import**: ZIP export with individual files, merged audio, and project configuration
- **Theme Toggle**: Light and dark mode with warm analog aesthetic
- **Data Persistence**: All data stored locally in IndexedDB

### Enhancement Features (v2)
- **Keyboard Shortcuts**:
  - `Space`: Play/Pause
  - `R`: Record new card
  - `E`: Edit first card
  - `←`: Seek backward 5 seconds
  - `→`: Seek forward 5 seconds

- **Waveform Thumbnails**: Visual audio preview on each card matching the card's color

- **Audio Trim/Split**:
  - Trim silence or unwanted sections from recordings
  - Split long recordings into multiple cards
  - Visual waveform editor with preview playback

### Transcription Features (v3)
- **Auto-Transcription**: Automatic speech-to-text transcription using Sogni Voice API
  - Generates transcripts with segment-level timestamps
  - Auto-generates transcript after new recordings (when enabled)

- **Animated Transcript Display**:
  - Segment highlighting synchronized with audio playback
  - Click any segment to seek to that time
  - Auto-scroll keeps current segment visible
  - Slide-in/out animation during playback

- **Global Transcripts Toggle**:
  - "Transcripts On/Off" button next to Select
  - Setting persists across page refreshes
  - When off, transcripts won't auto-show during playback

- **Manual Transcript Generation**:
  - Click the T (FileText) button on any card to generate/toggle transcript
  - Existing transcripts can be toggled on/off per card

## Design Philosophy

**Warm Analog Tape Aesthetic** - Inspired by vintage audio recording equipment:
- Cream backgrounds (#FAF8F3) with warm grays and sepia tones
- Burnt orange (#D97642) and deep teal (#2A7A7A) accents
- Soft shadows and rounded corners suggesting physical depth
- Typography: Fraunces (display), Inter (body), JetBrains Mono (technical)
- Subtle paper texture overlay for tactile feel

## Technology Stack

- **Framework**: React 19 with TypeScript
- **Styling**: Tailwind CSS 4 with custom warm color palette
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Drag & Drop**: @dnd-kit for accessible, touch-friendly sorting
- **Audio**: Web Audio API for recording, playback, and processing
- **Storage**: IndexedDB via idb wrapper
- **Export**: JSZip for client-side ZIP generation
- **Build**: Vite

## Project Structure

```
client/src/
├── components/
│   ├── Card.tsx                 # Individual card component
│   ├── CardList.tsx             # Draggable timeline
│   ├── Header.tsx               # App header with menu
│   ├── PlaybackBar.tsx          # Master playback controls
│   ├── RecordingPanel.tsx       # Recording interface
│   ├── EditCardModal.tsx        # Card editing modal
│   ├── ConfirmDialog.tsx        # Confirmation dialogs
│   ├── Waveform.tsx             # Real-time waveform
│   ├── WaveformThumbnail.tsx    # Card waveform preview
│   ├── AudioTrimmer.tsx         # Trim/split interface
│   ├── Transcript.tsx           # Animated transcript display
│   └── SelectionToolbar.tsx     # Multi-select & transcripts toggle
├── contexts/
│   ├── ProjectContext.tsx       # Global state management
│   └── ThemeContext.tsx         # Theme provider
├── hooks/
│   ├── useRecorder.ts           # Audio recording hook
│   ├── useMasterPlayer.ts       # Sequential playback
│   └── useKeyboardShortcuts.ts  # Global shortcuts
├── services/
│   ├── db.ts                    # IndexedDB operations
│   ├── audioUtils.ts            # Audio processing
│   ├── audioTrimmer.ts          # Trim/split utilities
│   ├── waveformGenerator.ts     # Waveform visualization
│   ├── transcription.ts         # Sogni Voice API transcription
│   ├── exportProject.ts         # ZIP export
│   └── importProject.ts         # ZIP import
├── types/
│   └── index.ts                 # TypeScript definitions
└── pages/
    └── Home.tsx                 # Main application page
```

## Card Data Model

Each card contains:
- `id`: Unique identifier (UUID)
- `label`: Card title (max 100 chars)
- `notes`: Additional notes (max 500 chars)
- `tags`: Array of tag strings (max 10)
- `color`: One of 8 color options (neutral, red, orange, yellow, green, blue, purple, pink)
- `duration`: Audio length in seconds
- `waveformData`: Array of amplitude values for visualization
- `transcript`: Array of transcript segments with `start`, `end`, `text`
- `order`: Position in the card list (persisted for drag/drop ordering)
- `createdAt`: ISO timestamp
- `updatedAt`: ISO timestamp

Audio blobs are stored separately in IndexedDB for performance.

## Export Format

ZIP structure:
```
voice-cards-export-YYYY-MM-DD/
├── project.json           # Metadata + card config
├── merged.webm            # All cards concatenated
└── cards/
    ├── 001-label.webm
    ├── 002-label.webm
    └── ...
```

## Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 14.1+

Requires:
- MediaRecorder API
- Web Audio API
- IndexedDB
- ES2020+ JavaScript features

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build for production
pnpm build

# Type check
pnpm check
```

## License

MIT
