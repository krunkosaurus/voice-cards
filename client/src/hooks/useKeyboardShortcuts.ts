// hooks/useKeyboardShortcuts.ts - Global keyboard shortcuts
import { useEffect } from 'react';

interface KeyboardShortcuts {
  onPlayPause?: () => void;
  onRecord?: () => void;
  onSeekForward?: () => void;
  onSeekBackward?: () => void;
  onEdit?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onJumpToCard?: (index: number) => void;
}

export function useKeyboardShortcuts({
  onPlayPause,
  onRecord,
  onSeekForward,
  onSeekBackward,
  onEdit,
  onUndo,
  onRedo,
  onJumpToCard,
}: KeyboardShortcuts) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Don't trigger global shortcuts when a dialog/modal is open
      // Check for shadcn/ui Dialog with data-state="open" or any dialog element
      const isDialogOpen = document.querySelector('[role="dialog"][data-state="open"]') !== null;
      if (isDialogOpen) {
        return;
      }

      // Spacebar - Play/Pause
      if (e.code === 'Space' && onPlayPause) {
        e.preventDefault();
        onPlayPause();
      }

      // R - Record
      if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && onRecord) {
        e.preventDefault();
        onRecord();
      }

      // E - Edit (first/selected card)
      if (e.code === 'KeyE' && !e.ctrlKey && !e.metaKey && onEdit) {
        e.preventDefault();
        onEdit();
      }

      // Arrow Right - Seek forward 5 seconds
      if (e.code === 'ArrowRight' && onSeekForward) {
        e.preventDefault();
        onSeekForward();
      }

      // Arrow Left - Seek backward 5 seconds
      if (e.code === 'ArrowLeft' && onSeekBackward) {
        e.preventDefault();
        onSeekBackward();
      }

      // Ctrl+Z or Cmd+Z - Undo
      if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && !e.shiftKey && onUndo) {
        e.preventDefault();
        onUndo();
      }

      // Ctrl+Shift+Z or Cmd+Shift+Z or Ctrl+Y - Redo
      if (
        ((e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && e.shiftKey) ||
        (e.code === 'KeyY' && (e.ctrlKey || e.metaKey))) &&
        onRedo
      ) {
        e.preventDefault();
        onRedo();
      }

      // Number keys 1-9 - Jump to card by position
      if (onJumpToCard && e.code.match(/^Digit[1-9]$/) && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const cardIndex = parseInt(e.code.replace('Digit', '')) - 1;
        e.preventDefault();
        onJumpToCard(cardIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onPlayPause, onRecord, onSeekForward, onSeekBackward, onEdit, onUndo, onRedo, onJumpToCard]);
}
