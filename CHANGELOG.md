# Changelog

All notable changes to Voice Cards will be documented in this file.

## [Unreleased] - 2026-01-19

### Fixed
- **Card play button**: Fixed play button on individual cards not working. Now properly uses master player for sequential playback
- **Dropdown menu actions**: Fixed dropdown menu items (Edit, Re-record, Append, Trim/Split, Duplicate, Delete) not responding to clicks by moving drag listeners from entire card wrapper to just the color bar
- **Drag and drop**: Improved drag interaction by making only the color bar at the top of each card the drag handle, allowing all other card interactions to work normally

### Added
- **Inline title editing**: Double-click any card title to edit it in place. Press Enter to save or Escape to cancel
- **Improved insertion button UX**: Insertion buttons between cards now appear as thin lines that expand on hover to show "Add Recording" button, reducing visual clutter

### Changed
- Drag handle is now limited to the colored bar at the top of each card (shows cursor-grab)
- Card interactions (play, edit, dropdown menu) are no longer blocked by drag listeners

## [2.0.0] - 2026-01-19

### Added
- **Keyboard shortcuts**:
  - `Space`: Play/Pause master playback
  - `R`: Record new card at end of timeline
  - `E`: Edit first card
  - `←`: Seek backward 5 seconds
  - `→`: Seek forward 5 seconds
- **Waveform thumbnails**: Each card displays a mini waveform visualization matching its color
- **Audio trim/split functionality**:
  - Visual waveform editor with draggable markers
  - Trim mode: Remove unwanted sections from start/end
  - Split mode: Split one card into two separate cards
  - Preview playback before applying changes

### Changed
- Enhanced card visualization with real-time audio waveform previews
- Improved power user workflow with comprehensive keyboard shortcuts

## [1.0.0] - 2026-01-18

### Added
- Initial release of Voice Cards
- Unlimited duration audio recording with real-time waveform visualization
- Draggable card timeline with color coding, labels, tags, and notes
- Master playback with sequential card playback and global progress tracking
- Full card editing modal with metadata and audio controls
- ZIP export/import with individual files, merged audio, and project configuration
- Light/dark theme toggle with warm analog tape aesthetic
- IndexedDB persistence for all data
- 8 color options for card organization
- Re-record and append audio functionality
- Card duplication feature
- Responsive design with mobile support

### Design
- Warm Analog Tape Aesthetic inspired by vintage audio equipment
- Cream backgrounds (#FAF8F3) with burnt orange (#D97642) and deep teal (#2A7A7A) accents
- Typography: Fraunces (display), Inter (body), JetBrains Mono (technical)
- Subtle paper texture overlay for tactile feel
- Soft shadows and rounded corners
