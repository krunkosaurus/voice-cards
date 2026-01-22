// pages/Home.tsx - Main Voice Cards application page
/* Design: Warm Analog Tape Aesthetic - Complete application layout */

import { useState, useRef, useCallback, useMemo } from 'react';
import { useProject } from '@/contexts/ProjectContext';
import { useHistory } from '@/contexts/HistoryContext';
import { createSnapshot } from '@/contexts/HistoryContext';
import { Header } from '@/components/Header';
import { useWebRTC } from '@/hooks/useWebRTC';
import { ConnectionDialog } from '@/components/ConnectionDialog';
import { SelectionToolbar } from '@/components/SelectionToolbar';
import { MicrophoneSetup } from '@/components/MicrophoneSetup';
import { CardList } from '@/components/CardList';
import { PlaybackBar } from '@/components/PlaybackBar';
import { RecordingPanel } from '@/components/RecordingPanel';
import { RecordingSetupModal } from '@/components/RecordingSetupModal';
import { EditCardModal } from '@/components/EditCardModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AudioTrimmer } from '@/components/AudioTrimmer';
import { useMasterPlayer } from '@/hooks/useMasterPlayer';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { saveCard, saveAudio, deleteCard } from '@/services/db';
import { getAudioDuration, appendAudioBlobs } from '@/services/audioUtils';
import { trimAudio, splitAudio, addSilenceToStart, addSilenceToEnd, removeSilenceFromStart, removeSilenceFromEnd } from '@/services/audioTrimmer';
import { generateWaveformData } from '@/services/waveformGenerator';
import { exportProject, downloadBlob } from '@/services/exportProject';
import { importProject } from '@/services/importProject';
import { exportAsAudio } from '@/services/exportAudio';
import { uuid } from '@/lib/utils';
import { toast } from 'sonner';
import type { Card, TranscriptSegment } from '@/types';

type RecordingMode = 'new' | 're-record' | 'append';

export default function Home() {
  const { state, dispatch, addCard, updateCard, deleteCard: removeCard, reorderCards, showConfirmDialog, hideConfirmDialog, clearProject, toggleTranscripts } = useProject();
  const { recordAction, canUndo, canRedo, undo, redo } = useHistory();
  
  // Filter cards based on search query
  const filteredCards = useMemo(() => {
    const query = state.ui.searchQuery.toLowerCase().trim();
    if (!query) return state.cards;
    
    return state.cards.filter(card => {
      // Search in title
      if (card.label.toLowerCase().includes(query)) return true;
      // Search in notes
      if (card.notes.toLowerCase().includes(query)) return true;
      // Search in tags
      if (card.tags.some(tag => tag.toLowerCase().includes(query))) return true;
      return false;
    });
  }, [state.cards, state.ui.searchQuery]);
  
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [isRecordingPanelOpen, setIsRecordingPanelOpen] = useState(false);
  const [recordingMode, setRecordingMode] = useState<RecordingMode>('new');
  const [targetCardId, setTargetCardId] = useState<string | null>(null);
  const [insertPosition, setInsertPosition] = useState<number | null>(null);
  const [recordingMetadata, setRecordingMetadata] = useState<{
    label: string;
    notes: string;
    tags: string[];
    color: Card['color'];
  } | null>(null);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [trimSplitCard, setTrimSplitCard] = useState<Card | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());

  // WebRTC connection state
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const webrtc = useWebRTC();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isPlaying, currentCardId, currentCardProgress, globalTime, totalDuration, playbackSpeed, isLooping, play, pause, seekToTime, seekWithinCurrentCard, jumpToCard, setPlaybackSpeed, setIsLooping } = useMasterPlayer(
    filteredCards,
    (cardId) => {
      dispatch({ type: 'SET_PLAYBACK', payload: { currentCardId: cardId } });
    },
    (globalTime, currentTime) => {
      dispatch({ type: 'SET_PLAYBACK', payload: { globalTime, currentTime } });
    }
  );

  const handlePlayPause = () => {
    // If an individual card is playing, pause/resume it
    if (playingCardId && currentAudio) {
      if (currentAudio.paused) {
        currentAudio.play();
      } else {
        currentAudio.pause();
      }
    } else {
      // Otherwise, control master timeline
      if (isPlaying) {
        pause();
      } else {
        play();
      }
    }
  };

  const handleSeek = (time: number) => {
    seekToTime(time);
  };

  // Individual card playback (separate from master player)
  const [playingCardId, setPlayingCardId] = useState<string | null>(null);
  const [isIndividualPlaying, setIsIndividualPlaying] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  const handleIndividualCardPlay = async (cardId: string) => {
    try {
      // If the same card is paused, resume it
      if (playingCardId === cardId && currentAudio && currentAudio.paused) {
        await currentAudio.play();
        setIsIndividualPlaying(true);
        // Restart progress tracking
        const updateProgress = () => {
          if (currentAudio && currentAudio.duration > 0) {
            setPlaybackProgress(currentAudio.currentTime / currentAudio.duration);
          }
          if (currentAudio && !currentAudio.paused) {
            animationFrameRef.current = requestAnimationFrame(updateProgress);
          }
        };
        animationFrameRef.current = requestAnimationFrame(updateProgress);
        return;
      }

      // Stop any currently playing audio (different card)
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = '';
        setCurrentAudio(null);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      }

      const { getAudio } = await import('@/services/db');
      const audioBlob = await getAudio(cardId);
      if (!audioBlob) {
        toast.error('Audio not found');
        return;
      }

      // Create temporary audio element for this card only
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setPlayingCardId(null);
        setIsIndividualPlaying(false);
        setCurrentAudio(null);
        setPlaybackProgress(0);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        toast.error('Failed to play audio');
        setPlayingCardId(null);
        setIsIndividualPlaying(false);
        setCurrentAudio(null);
        setPlaybackProgress(0);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };

      setPlayingCardId(cardId);
      setIsIndividualPlaying(true);
      setCurrentAudio(audio);
      setPlaybackProgress(0);
      await audio.play();

      // Start progress tracking
      const updateProgress = () => {
        if (audio.duration > 0) {
          setPlaybackProgress(audio.currentTime / audio.duration);
        }
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      };
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    } catch (error) {
      console.error('Error playing card audio:', error);
      toast.error('Failed to play audio');
      setPlayingCardId(null);
      setIsIndividualPlaying(false);
    }
  };

  const handleIndividualCardPause = () => {
    if (currentAudio) {
      currentAudio.pause();
      // Don't clear the audio source - keep it for resume
    }
    setIsIndividualPlaying(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    // Don't reset playingCardId or playbackProgress - keep them for resume
  };

  const handleCardSeek = (cardId: string, progress: number) => {
    // Case 1: This card is being played individually (playing or paused) - seek within it
    // This allows moving the caret while paused, then resuming from that position
    if (playingCardId === cardId && currentAudio) {
      const targetTime = currentAudio.duration * progress;
      currentAudio.currentTime = targetTime;
      setPlaybackProgress(progress);
      return;
    }

    // Case 2: Master timeline is playing this card - fast seek within it (no audio reload)
    if (isPlaying && currentCardId === cardId) {
      seekWithinCurrentCard(progress);
      return;
    }

    // Case 3: Master timeline is playing a different card - jump to clicked card
    if (isPlaying) {
      const card = state.cards.find(c => c.id === cardId);
      if (card) {
        const targetTime = card.duration * progress;
        const cardIndex = state.cards.findIndex(c => c.id === cardId);
        const cardStartTime = state.cards.slice(0, cardIndex).reduce((sum, c) => sum + c.duration, 0);
        seekToTime(cardStartTime + targetTime);
      }
      return;
    }

    // Case 4: Nothing is playing - do nothing (don't auto-start playback)
    // User must explicitly click play button to start playback
  };

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onPlayPause: handlePlayPause,
    onRecord: () => handleInsertAt(state.cards.length),
    onSeekForward: () => seekToTime(Math.min(globalTime + 5, totalDuration)),
    onSeekBackward: () => seekToTime(Math.max(globalTime - 5, 0)),
    onEdit: () => {
      if (state.cards.length > 0) {
        setEditingCard(state.cards[0]);
      }
    },
    onUndo: undo,
    onRedo: redo,
    onJumpToCard: (index: number) => {
      if (index >= 0 && index < filteredCards.length) {
        const card = filteredCards[index];
        jumpToCard(card.id);
        if (!isPlaying) {
          play();
        }
      }
    },
  });

  const handleInsertAt = (position: number) => {
    setInsertPosition(position);
    setRecordingMode('new');
    setTargetCardId(null);
    setIsSetupModalOpen(true);
  };

  const handleStartRecording = (metadata: {
    label: string;
    notes: string;
    tags: string[];
    color: Card['color'];
  }) => {
    setRecordingMetadata(metadata);
    setIsSetupModalOpen(false);
    setIsRecordingPanelOpen(true);
  };

  const handleSaveRecording = async (blob: Blob, duration: number) => {
    try {
      if (recordingMode === 'new') {
        // Create new card with metadata
        // Determine order based on insertion position or append to end
        const order = insertPosition !== null
          ? insertPosition
          : state.cards.length;

        const newCard: Card = {
          id: uuid(),
          label: recordingMetadata?.label || 'Untitled',
          notes: recordingMetadata?.notes || '',
          tags: recordingMetadata?.tags || [],
          color: recordingMetadata?.color || 'neutral',
          duration,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          order,
        };

        await saveCard(newCard);
        await saveAudio(newCard.id, blob);

        // Insert at position
        if (insertPosition !== null) {
          const newCards = [...state.cards];
          newCards.splice(insertPosition, 0, newCard);
          dispatch({ type: 'SET_CARDS', payload: newCards });
          // Note: saveCards is handled by effect in ProjectContext with order values
        } else {
          addCard(newCard);
        }

        toast.success('Recording saved!');

        // Auto-generate transcript in background
        generateTranscriptForCard(newCard.id, blob);
      } else if (recordingMode === 're-record' && targetCardId) {
        // Replace audio and update metadata
        const card = state.cards.find(c => c.id === targetCardId);
        if (card) {
          // Generate new waveform from new audio
          const { generateWaveformData } = await import('@/services/waveformGenerator');
          const waveformData = await generateWaveformData(blob);
          
          const updatedCard = {
            ...card,
            label: recordingMetadata?.label || card.label,
            notes: recordingMetadata?.notes || card.notes,
            tags: recordingMetadata?.tags || card.tags,
            color: recordingMetadata?.color || card.color,
            duration,
            waveformData,
            updatedAt: new Date().toISOString()
          };
          await saveCard(updatedCard);
          await saveAudio(targetCardId, blob);
          updateCard(updatedCard);
          toast.success('Recording updated!');
        }
      } else if (recordingMode === 'append' && targetCardId) {
        // Append audio and update metadata
        const card = state.cards.find(c => c.id === targetCardId);
        if (card) {
          const existingBlob = await import('@/services/db').then(m => m.getAudio(targetCardId));
          if (existingBlob) {
            const mergedBlob = await appendAudioBlobs(existingBlob, blob);
            const newDuration = await getAudioDuration(mergedBlob);
            
            // Generate new waveform from merged audio
            const { generateWaveformData } = await import('@/services/waveformGenerator');
            const waveformData = await generateWaveformData(mergedBlob);
            
            const updatedCard = {
              ...card,
              label: recordingMetadata?.label || card.label,
              notes: recordingMetadata?.notes || card.notes,
              tags: recordingMetadata?.tags || card.tags,
              color: recordingMetadata?.color || card.color,
              duration: newDuration,
              waveformData,
              updatedAt: new Date().toISOString()
            };
            await saveCard(updatedCard);
            await saveAudio(targetCardId, mergedBlob);
            updateCard(updatedCard);
            toast.success('Audio appended!');
          }
        }
      }
    } catch (error) {
      console.error('Failed to save recording:', error);
      toast.error('Failed to save recording');
    }

    setIsRecordingPanelOpen(false);
    setInsertPosition(null);
  };

  const handleCardEdit = (card: Card) => {
    setEditingCard(card);
  };

  const handleCardReRecord = (card: Card) => {
    setTargetCardId(card.id);
    setRecordingMode('re-record');
    setRecordingMetadata({
      label: card.label,
      notes: card.notes,
      tags: card.tags,
      color: card.color,
    });
    setIsSetupModalOpen(true);
  };

  const handleCardAppend = (card: Card) => {
    setTargetCardId(card.id);
    setRecordingMode('append');
    setRecordingMetadata({
      label: card.label,
      notes: card.notes,
      tags: card.tags,
      color: card.color,
    });
    // Skip setup modal and go directly to recording
    setIsRecordingPanelOpen(true);
  };

  const handleCardDuplicate = async (card: Card) => {
    try {
      const audioBlob = await import('@/services/db').then(m => m.getAudio(card.id));
      if (!audioBlob) {
        toast.error('Failed to duplicate: audio not found');
        return;
      }

      const newCard: Card = {
        ...card,
        id: uuid(),
        label: `${card.label} (Copy)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveCard(newCard);
      await saveAudio(newCard.id, audioBlob);

      // Insert after original
      const index = state.cards.findIndex(c => c.id === card.id);
      const newCards = [...state.cards];
      newCards.splice(index + 1, 0, newCard);
      dispatch({ type: 'SET_CARDS', payload: newCards });
      // Note: saveCards is handled by effect in ProjectContext with order values

      toast.success('Card duplicated!');
    } catch (error) {
      console.error('Failed to duplicate card:', error);
      toast.error('Failed to duplicate card');
    }
  };

  const handleCardTrimSplit = (card: Card) => {
    setTrimSplitCard(card);
  };

  const handleCardTitleUpdate = (updatedCard: Card) => {
    updateCard(updatedCard);
  };

  const handleTranscriptGenerated = async (cardId: string, transcript: TranscriptSegment[]) => {
    const card = state.cards.find(c => c.id === cardId);
    if (!card) return;

    const updatedCard = {
      ...card,
      transcript,
      updatedAt: new Date().toISOString(),
    };

    await saveCard(updatedCard);
    updateCard(updatedCard);
    toast.success('Transcript generated!');
  };

  // Auto-generate transcript for a card
  const generateTranscriptForCard = async (cardId: string, audioBlob: Blob) => {
    try {
      const { transcribeAudio } = await import('@/services/transcription');
      const transcript = await transcribeAudio(audioBlob);
      await handleTranscriptGenerated(cardId, transcript);
    } catch (error) {
      console.error('Auto-transcription failed:', error);
      // Don't show error toast - transcript generation is optional
    }
  };

  const handleTrim = async (startTime: number, endTime: number) => {
    if (!trimSplitCard) return;

    try {
      const audioBlob = await import('@/services/db').then(m => m.getAudio(trimSplitCard.id));
      if (!audioBlob) {
        toast.error('Audio not found');
        return;
      }

      // Create snapshot before trim
      const beforeSnapshot = await createSnapshot(state.cards, [trimSplitCard.id]);

      const trimmedBlob = await trimAudio(audioBlob, startTime, endTime);
      const newDuration = await getAudioDuration(trimmedBlob);
      const newWaveformData = await generateWaveformData(trimmedBlob, 50);

      const updatedCard = {
        ...trimSplitCard,
        duration: newDuration,
        waveformData: newWaveformData,
        updatedAt: new Date().toISOString(),
      };

      await saveCard(updatedCard);
      await saveAudio(trimSplitCard.id, trimmedBlob);
      updateCard(updatedCard);

      // Create snapshot after trim
      const updatedCards = state.cards.map(c => c.id === updatedCard.id ? updatedCard : c);
      const afterSnapshot = await createSnapshot(updatedCards, [trimSplitCard.id]);

      // Record history action
      await recordAction({
        type: 'TRIM',
        timestamp: Date.now(),
        description: `Trimmed "${trimSplitCard.label}"`,
        before: beforeSnapshot,
        after: afterSnapshot,
      });

      toast.success('Audio trimmed!');
    } catch (error) {
      console.error('Failed to trim audio:', error);
      toast.error('Failed to trim audio');
    }
  };

  const handleSplit = async (splitTime: number) => {
    if (!trimSplitCard) return;

    try {
      const audioBlob = await import('@/services/db').then(m => m.getAudio(trimSplitCard.id));
      if (!audioBlob) {
        toast.error('Audio not found');
        return;
      }

      // Create snapshot before split
      const beforeSnapshot = await createSnapshot(state.cards, [trimSplitCard.id]);

      const [firstBlob, secondBlob] = await splitAudio(audioBlob, splitTime);
      const firstDuration = await getAudioDuration(firstBlob);
      const secondDuration = await getAudioDuration(secondBlob);
      const firstWaveformData = await generateWaveformData(firstBlob, 50);
      const secondWaveformData = await generateWaveformData(secondBlob, 50);

      // Update first card
      const updatedFirstCard = {
        ...trimSplitCard,
        duration: firstDuration,
        waveformData: firstWaveformData,
        label: `${trimSplitCard.label} (Part 1)`,
        updatedAt: new Date().toISOString(),
      };

      // Create second card
      const secondCard: Card = {
        ...trimSplitCard,
        id: uuid(),
        duration: secondDuration,
        waveformData: secondWaveformData,
        label: `${trimSplitCard.label} (Part 2)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveCard(updatedFirstCard);
      await saveAudio(trimSplitCard.id, firstBlob);
      await saveCard(secondCard);
      await saveAudio(secondCard.id, secondBlob);

      // Insert second card after first
      const index = state.cards.findIndex(c => c.id === trimSplitCard.id);
      const newCards = [...state.cards];
      newCards[index] = updatedFirstCard;
      newCards.splice(index + 1, 0, secondCard);
      dispatch({ type: 'SET_CARDS', payload: newCards });
      // Note: saveCards is handled by effect in ProjectContext with order values

      // Create snapshot after split
      const afterSnapshot = await createSnapshot(newCards, [updatedFirstCard.id, secondCard.id]);

      // Record history action
      await recordAction({
        type: 'SPLIT',
        timestamp: Date.now(),
        description: `Split "${trimSplitCard.label}" into 2 cards`,
        before: beforeSnapshot,
        after: afterSnapshot,
      });

      toast.success('Audio split into 2 cards!');
    } catch (error) {
      console.error('Failed to split audio:', error);
      toast.error('Failed to split audio');
    }
  };

  const handleCardAddSilenceStart = async (card: Card) => {
    try {
      // Create snapshot before modification
      const beforeSnapshot = await createSnapshot(state.cards, [card.id]);

      const audioBlob = await import('@/services/db').then(m => m.getAudio(card.id));
      if (!audioBlob) {
        toast.error('Failed to add silence: audio not found');
        return;
      }

      // Add 1 second of silence to start
      const modifiedBlob = await addSilenceToStart(audioBlob, 1.0);
      const newDuration = await getAudioDuration(modifiedBlob);

      // Update card with new duration
      const updatedCard = {
        ...card,
        duration: newDuration,
        updatedAt: new Date().toISOString(),
      };

      await saveCard(updatedCard);
      await saveAudio(card.id, modifiedBlob);
      updateCard(updatedCard);

      // Create snapshot after modification
      const afterCards = state.cards.map(c => c.id === card.id ? updatedCard : c);
      const afterSnapshot = await createSnapshot(afterCards, [card.id]);

      // Record history action
      await recordAction({
        type: 'TRIM',
        timestamp: Date.now(),
        description: `Added 1s silence to start of "${card.label}"`,
        before: beforeSnapshot,
        after: afterSnapshot,
      });

      toast.success('Added 1s silence to start');
    } catch (error) {
      console.error('Failed to add silence:', error);
      toast.error('Failed to add silence');
    }
  };

  const handleCardRemoveSilenceStart = async (card: Card) => {
    try {
      const audioBlob = await import('@/services/db').then(m => m.getAudio(card.id));
      if (!audioBlob) {
        toast.error('Failed to remove silence: audio not found');
        return;
      }

      // Check if card is long enough
      if (card.duration <= 1.0) {
        toast.error('Cannot remove 1s from a clip shorter than 1s');
        return;
      }

      // Create snapshot before modification
      const beforeSnapshot = await createSnapshot(state.cards, [card.id]);

      // Remove 1 second from start
      const modifiedBlob = await removeSilenceFromStart(audioBlob, 1.0);
      const newDuration = await getAudioDuration(modifiedBlob);

      // Update card with new duration
      const updatedCard = {
        ...card,
        duration: newDuration,
        updatedAt: new Date().toISOString(),
      };

      await saveCard(updatedCard);
      await saveAudio(card.id, modifiedBlob);
      updateCard(updatedCard);

      // Create snapshot after modification
      const afterCards = state.cards.map(c => c.id === card.id ? updatedCard : c);
      const afterSnapshot = await createSnapshot(afterCards, [card.id]);

      // Record history action
      await recordAction({
        type: 'TRIM',
        timestamp: Date.now(),
        description: `Removed 1s from start of "${card.label}"`,
        before: beforeSnapshot,
        after: afterSnapshot,
      });

      toast.success('Removed 1s from start');
    } catch (error) {
      console.error('Failed to remove silence:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove silence';
      toast.error(errorMessage);
    }
  };

  const handleCardRemoveSilenceEnd = async (card: Card) => {
    try {
      const audioBlob = await import('@/services/db').then(m => m.getAudio(card.id));
      if (!audioBlob) {
        toast.error('Failed to remove silence: audio not found');
        return;
      }

      // Check if card is long enough
      if (card.duration <= 1.0) {
        toast.error('Cannot remove 1s from a clip shorter than 1s');
        return;
      }

      // Create snapshot before modification
      const beforeSnapshot = await createSnapshot(state.cards, [card.id]);

      // Remove 1 second from end
      const modifiedBlob = await removeSilenceFromEnd(audioBlob, 1.0);
      const newDuration = await getAudioDuration(modifiedBlob);

      // Update card with new duration
      const updatedCard = {
        ...card,
        duration: newDuration,
        updatedAt: new Date().toISOString(),
      };

      await saveCard(updatedCard);
      await saveAudio(card.id, modifiedBlob);
      updateCard(updatedCard);

      // Create snapshot after modification
      const afterCards = state.cards.map(c => c.id === card.id ? updatedCard : c);
      const afterSnapshot = await createSnapshot(afterCards, [card.id]);

      // Record history action
      await recordAction({
        type: 'TRIM',
        timestamp: Date.now(),
        description: `Removed 1s from end of "${card.label}"`,
        before: beforeSnapshot,
        after: afterSnapshot,
      });

      toast.success('Removed 1s from end');
    } catch (error) {
      console.error('Failed to remove silence:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove silence';
      toast.error(errorMessage);
    }
  };

  const handleCardAddSilenceEnd = async (card: Card) => {
    try {
      // Create snapshot before modification
      const beforeSnapshot = await createSnapshot(state.cards, [card.id]);

      const audioBlob = await import('@/services/db').then(m => m.getAudio(card.id));
      if (!audioBlob) {
        toast.error('Failed to add silence: audio not found');
        return;
      }

      // Add 1 second of silence to end
      const modifiedBlob = await addSilenceToEnd(audioBlob, 1.0);
      const newDuration = await getAudioDuration(modifiedBlob);

      // Update card with new duration
      const updatedCard = {
        ...card,
        duration: newDuration,
        updatedAt: new Date().toISOString(),
      };

      await saveCard(updatedCard);
      await saveAudio(card.id, modifiedBlob);
      updateCard(updatedCard);

      // Create snapshot after modification
      const afterCards = state.cards.map(c => c.id === card.id ? updatedCard : c);
      const afterSnapshot = await createSnapshot(afterCards, [card.id]);

      // Record history action
      await recordAction({
        type: 'TRIM',
        timestamp: Date.now(),
        description: `Added 1s silence to end of "${card.label}"`,
        before: beforeSnapshot,
        after: afterSnapshot,
      });

      toast.success('Added 1s silence to end');
    } catch (error) {
      console.error('Failed to add silence:', error);
      toast.error('Failed to add silence');
    }
  };

  const handleCardDelete = (card: Card) => {
    showConfirmDialog({
      title: 'Delete Card?',
      message: `Are you sure you want to delete "${card.label}"? You can undo this action.`,
      confirmLabel: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        try {
          // Create snapshot before delete
          const beforeSnapshot = await createSnapshot(state.cards, [card.id]);

          await deleteCard(card.id);
          removeCard(card.id);

          // Create snapshot after delete
          const afterCards = state.cards.filter(c => c.id !== card.id);
          const afterSnapshot = await createSnapshot(afterCards, []);

          // Record history action
          await recordAction({
            type: 'DELETE',
            timestamp: Date.now(),
            description: `Deleted "${card.label}"`,
            before: beforeSnapshot,
            after: afterSnapshot,
          });

          toast.success('Card deleted');
        } catch (error) {
          console.error('Failed to delete card:', error);
          toast.error('Failed to delete card');
        }
        hideConfirmDialog();
      },
    });
  };

  // Selection mode handlers
  const handleEnterSelectionMode = () => {
    setIsSelectionMode(true);
    setSelectedCardIds(new Set());
  };

  const handleExitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedCardIds(new Set());
  };

  const handleSelectAll = () => {
    setSelectedCardIds(new Set(filteredCards.map(c => c.id)));
  };

  const handleDeselectAll = () => {
    setSelectedCardIds(new Set());
  };

  const handleToggleCardSelection = (cardId: string) => {
    setSelectedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

  const handleBatchDelete = () => {
    if (selectedCardIds.size === 0) return;

    showConfirmDialog({
      title: 'Delete Selected Cards?',
      message: `Are you sure you want to delete ${selectedCardIds.size} card${selectedCardIds.size > 1 ? 's' : ''}? You can undo this action.`,
      confirmLabel: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        try {
          // Create snapshot before delete
          const affectedIds = Array.from(selectedCardIds);
          const beforeSnapshot = await createSnapshot(state.cards, affectedIds);

          // Delete all selected cards
          const cardIdsArray = Array.from(selectedCardIds);
          for (const cardId of cardIdsArray) {
            await deleteCard(cardId);
            removeCard(cardId);
          }

          // Create snapshot after delete
          const afterCards = state.cards.filter(c => !selectedCardIds.has(c.id));
          const afterSnapshot = await createSnapshot(afterCards, []);

          // Record history action
          await recordAction({
            type: 'DELETE',
            timestamp: Date.now(),
            description: `Deleted ${selectedCardIds.size} card${selectedCardIds.size > 1 ? 's' : ''}`,
            before: beforeSnapshot,
            after: afterSnapshot,
          });

          toast.success(`${selectedCardIds.size} card${selectedCardIds.size > 1 ? 's' : ''} deleted`);
          handleExitSelectionMode();
        } catch (error) {
          console.error('Failed to delete cards:', error);
          toast.error('Failed to delete cards');
        }
        hideConfirmDialog();
      },
    });
  };

  const handleMerge = async () => {
    if (selectedCardIds.size < 2) {
      toast.error('Select at least 2 cards to merge');
      return;
    }

    try {
      // Get selected cards in order
      const selectedCards = filteredCards.filter(c => selectedCardIds.has(c.id));
      
      if (selectedCards.length < 2) {
        toast.error('Select at least 2 cards to merge');
        return;
      }

      // Create snapshot before merge
      const affectedIds = selectedCards.map(c => c.id);
      const beforeSnapshot = await createSnapshot(state.cards, affectedIds);

      // Load all audio blobs
      const audioBlobs: Blob[] = [];
      for (const card of selectedCards) {
        const audioBlob = await import('@/services/db').then(m => m.getAudio(card.id));
        if (!audioBlob) {
          toast.error(`Audio not found for "${card.label}"`);
          return;
        }
        audioBlobs.push(audioBlob);
      }

      // Merge audio blobs by chaining append operations
      let mergedBlob = audioBlobs[0];
      for (let i = 1; i < audioBlobs.length; i++) {
        mergedBlob = await appendAudioBlobs(mergedBlob, audioBlobs[i]);
      }
      const mergedDuration = await getAudioDuration(mergedBlob);
      const mergedWaveformData = await generateWaveformData(mergedBlob, 50);

      // Update first card with merged audio
      const firstCard = selectedCards[0];
      const updatedCard = {
        ...firstCard,
        duration: mergedDuration,
        waveformData: mergedWaveformData,
        label: `${firstCard.label} (merged)`,
        updatedAt: new Date().toISOString(),
      };

      await saveCard(updatedCard);
      await saveAudio(firstCard.id, mergedBlob);
      updateCard(updatedCard);

      // Delete other cards
      for (let i = 1; i < selectedCards.length; i++) {
        await deleteCard(selectedCards[i].id);
        removeCard(selectedCards[i].id);
      }

      // Create snapshot after merge
      const afterCards = state.cards
        .filter(c => c.id === firstCard.id || !selectedCardIds.has(c.id))
        .map(c => c.id === firstCard.id ? updatedCard : c);
      const afterSnapshot = await createSnapshot(afterCards, [firstCard.id]);

      // Record history action
      await recordAction({
        type: 'EDIT',
        timestamp: Date.now(),
        description: `Merged ${selectedCards.length} cards`,
        before: beforeSnapshot,
        after: afterSnapshot,
      });

      toast.success(`${selectedCards.length} cards merged!`);
      handleExitSelectionMode();
    } catch (error) {
      console.error('Failed to merge cards:', error);
      toast.error('Failed to merge cards');
    }
  };

  const handleExport = async () => {
    if (state.cards.length === 0) {
      toast.error('No cards to export');
      return;
    }

    setIsExporting(true);
    try {
      const zipBlob = await exportProject(
        state.cards,
        state.project,
        state.settings,
        (message) => toast.info(message)
      );

      const timestamp = new Date().toISOString().split('T')[0];
      downloadBlob(zipBlob, `voice-cards-export-${timestamp}.zip`);
      toast.success('Project exported!');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export project');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (state.cards.length > 0) {
      showConfirmDialog({
        title: 'Import Project?',
        message: 'This will replace your current project. Continue?',
        confirmLabel: 'Import',
        isDestructive: true,
        onConfirm: async () => {
          await performImport(file);
          hideConfirmDialog();
        },
      });
    } else {
      await performImport(file);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const performImport = async (file: File) => {
    try {
      const { cards, settings } = await importProject(
        file,
        (message) => toast.info(message)
      );

      dispatch({ type: 'SET_CARDS', payload: cards });
      dispatch({ type: 'SET_THEME', payload: settings.theme });
      toast.success('Project imported successfully!');
    } catch (error) {
      console.error('Import failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to import project');
    }
  };

  const handleClearProject = () => {
    showConfirmDialog({
      title: 'Clear Entire Project?',
      message: 'This will delete all cards and audio. This cannot be undone. Consider exporting first.',
      confirmLabel: 'Clear Everything',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await clearProject();
          toast.success('Project cleared');
        } catch (error) {
          console.error('Failed to clear project:', error);
          toast.error('Failed to clear project');
        }
        hideConfirmDialog();
      },
    });
  };

  const handleExportAudio = async () => {
    if (state.cards.length === 0) {
      toast.error('No cards to export');
      return;
    }

    try {
      toast.loading('Merging audio files...');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      await exportAsAudio(state.cards, `voice-cards-${timestamp}.wav`, 0.5);
      toast.dismiss();
      toast.success('Audio exported successfully');
    } catch (error) {
      toast.dismiss();
      console.error('Export audio error:', error);
      toast.error('Failed to export audio');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header
        searchQuery={state.ui.searchQuery}
        onSearchChange={(query) => dispatch({ type: 'SET_UI', payload: { searchQuery: query } })}
        onExport={handleExport}
        onImport={handleImport}
        onClearProject={handleClearProject}
        onExportAudio={state.cards.length > 0 ? handleExportAudio : undefined}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        connectionState={webrtc.state}
        onConnectClick={() => setConnectionDialogOpen(true)}
      />

      <main className="flex-1 pb-32">
        <div className="container max-w-3xl py-8">
          <div className="flex justify-end mb-4">
            <MicrophoneSetup />
          </div>
          {filteredCards.length > 0 && (
            <SelectionToolbar
              isSelectionMode={isSelectionMode}
              selectedCount={selectedCardIds.size}
              totalCount={filteredCards.length}
              transcriptsEnabled={state.settings.transcriptsEnabled}
              onEnterSelectionMode={handleEnterSelectionMode}
              onExitSelectionMode={handleExitSelectionMode}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onDelete={handleBatchDelete}
              onMerge={handleMerge}
              onToggleTranscripts={toggleTranscripts}
            />
          )}
          <CardList
            cards={filteredCards}
            currentCardId={currentCardId}
            playingCardId={playingCardId}
            isIndividualPlaying={isIndividualPlaying}
            individualPlaybackProgress={playbackProgress}
            masterPlaybackProgress={currentCardProgress}
            transcriptsEnabled={state.settings.transcriptsEnabled}
            onReorder={reorderCards}
            onCardPlay={handleIndividualCardPlay}
            onCardPause={handleIndividualCardPause}
            onCardSeek={handleCardSeek}
            onCardEdit={handleCardEdit}
            onCardReRecord={handleCardReRecord}
            onCardAppend={handleCardAppend}
            onCardDuplicate={handleCardDuplicate}
            onCardDelete={handleCardDelete}
            onCardTrimSplit={handleCardTrimSplit}
            onCardAddSilenceStart={handleCardAddSilenceStart}
            onCardAddSilenceEnd={handleCardAddSilenceEnd}
            onCardRemoveSilenceStart={handleCardRemoveSilenceStart}
            onCardRemoveSilenceEnd={handleCardRemoveSilenceEnd}
            onCardTitleUpdate={handleCardTitleUpdate}
            onCardTranscriptGenerated={handleTranscriptGenerated}
            onInsertAt={handleInsertAt}
            isSelectionMode={isSelectionMode}
            selectedCardIds={selectedCardIds}
            onToggleCardSelection={handleToggleCardSelection}
          />
        </div>
      </main>

      <PlaybackBar
        isPlaying={isPlaying}
        currentTime={globalTime}
        totalDuration={totalDuration}
        playbackSpeed={playbackSpeed}
        cards={filteredCards}
        isLooping={isLooping}
        onPlayPause={handlePlayPause}
        onSeek={seekToTime}
        onSpeedChange={setPlaybackSpeed}
        onLoopToggle={() => setIsLooping(!isLooping)}
      />

      <RecordingSetupModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
        onStartRecording={handleStartRecording}
        mode={recordingMode}
        existingLabel={recordingMetadata?.label}
        existingNotes={recordingMetadata?.notes}
        existingTags={recordingMetadata?.tags}
        existingColor={recordingMetadata?.color}
      />

      <RecordingPanel
        isOpen={isRecordingPanelOpen}
        onClose={() => setIsRecordingPanelOpen(false)}
        onSave={handleSaveRecording}
        title={recordingMetadata?.label || 'New Recording'}
      />

      <EditCardModal
        card={editingCard}
        isOpen={!!editingCard}
        onClose={() => setEditingCard(null)}
        onSave={(updatedCard) => {
          saveCard(updatedCard);
          updateCard(updatedCard);
          setEditingCard(null);
          toast.success('Card updated');
        }}
        onReRecord={() => {
          if (editingCard) {
            handleCardReRecord(editingCard);
          }
        }}
        onAppend={() => {
          if (editingCard) {
            handleCardAppend(editingCard);
          }
        }}
      />

      {state.ui.confirmDialog && (
        <ConfirmDialog
          isOpen={true}
          title={state.ui.confirmDialog.title}
          message={state.ui.confirmDialog.message}
          confirmLabel={state.ui.confirmDialog.confirmLabel}
          isDestructive={state.ui.confirmDialog.isDestructive}
          onConfirm={state.ui.confirmDialog.onConfirm}
          onCancel={hideConfirmDialog}
        />
      )}

      <AudioTrimmer
        isOpen={!!trimSplitCard}
        cardId={trimSplitCard?.id || null}
        duration={trimSplitCard?.duration || 0}
        onClose={() => setTrimSplitCard(null)}
        onTrim={handleTrim}
        onSplit={handleSplit}
      />

      <ConnectionDialog
        open={connectionDialogOpen}
        onOpenChange={setConnectionDialogOpen}
        state={webrtc.state}
        offerCode={webrtc.offerCode}
        answerCode={webrtc.answerCode}
        error={webrtc.error}
        onCreateOffer={webrtc.createOffer}
        onAcceptOffer={webrtc.acceptOffer}
        onAcceptAnswer={webrtc.acceptAnswer}
        onDisconnect={webrtc.disconnect}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
