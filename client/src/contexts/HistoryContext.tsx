// contexts/HistoryContext.tsx - Undo/redo history management
/* Design: Warm Analog Tape Aesthetic - History state management */

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { Card } from '@/types';
import type { HistoryAction, HistoryState } from '@/types/history';
import { getAllCards, saveCard, saveAudio, deleteCard as deleteCardFromDB, saveCards } from '@/services/db';
import { toast } from 'sonner';

interface HistoryContextValue {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  recordAction: (action: HistoryAction) => Promise<void>;
  clearHistory: () => void;
}

const HistoryContext = createContext<HistoryContextValue | undefined>(undefined);

const MAX_HISTORY_SIZE = 20;

export function HistoryProvider({ 
  children,
  onCardsReload,
}: { 
  children: React.ReactNode;
  onCardsReload: () => Promise<void>;
}) {
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    future: [],
    maxHistorySize: MAX_HISTORY_SIZE,
  });

  const recordAction = useCallback(async (action: HistoryAction) => {
    setHistory(prev => {
      const newPast = [...prev.past, action];
      
      // Limit history size
      if (newPast.length > prev.maxHistorySize) {
        newPast.shift(); // Remove oldest action
      }
      
      return {
        ...prev,
        past: newPast,
        future: [], // Clear future when new action is recorded
      };
    });
  }, []);

  const undo = useCallback(async () => {
    if (history.past.length === 0) return;

    const action = history.past[history.past.length - 1];
    
    try {
      // Restore "before" state
      await restoreState(action.before);
      await onCardsReload();
      
      // Update history state
      setHistory(prev => ({
        ...prev,
        past: prev.past.slice(0, -1),
        future: [action, ...prev.future],
      }));
      
      toast.success(`Undone: ${action.description}`);
    } catch (error) {
      console.error('Failed to undo:', error);
      toast.error('Failed to undo operation');
    }
  }, [history.past, onCardsReload]);

  const redo = useCallback(async () => {
    if (history.future.length === 0) return;

    const action = history.future[0];
    
    try {
      // Restore "after" state
      await restoreState(action.after);
      await onCardsReload();
      
      // Update history state
      setHistory(prev => ({
        ...prev,
        past: [...prev.past, action],
        future: prev.future.slice(1),
      }));
      
      toast.success(`Redone: ${action.description}`);
    } catch (error) {
      console.error('Failed to redo:', error);
      toast.error('Failed to redo operation');
    }
  }, [history.future, onCardsReload]);

  const clearHistory = useCallback(() => {
    setHistory({
      past: [],
      future: [],
      maxHistorySize: MAX_HISTORY_SIZE,
    });
  }, []);

  return (
    <HistoryContext.Provider
      value={{
        canUndo: history.past.length > 0,
        canRedo: history.future.length > 0,
        undo,
        redo,
        recordAction,
        clearHistory,
      }}
    >
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory() {
  const context = useContext(HistoryContext);
  if (!context) {
    throw new Error('useHistory must be used within HistoryProvider');
  }
  return context;
}

// Helper function to restore a state (either before or after)
async function restoreState(state: HistoryAction['before'] | HistoryAction['after']) {
  // Save all cards
  await saveCards(state.cards);
  
  // Restore audio blobs for affected cards
  const audioEntries = Array.from(state.audioSnapshots.entries());
  for (const [cardId, audioBlob] of audioEntries) {
    await saveAudio(cardId, audioBlob);
  }
}

// Helper function to create a snapshot of current state for affected cards
export async function createSnapshot(cards: Card[], affectedCardIds: string[]): Promise<{
  cards: Card[];
  affectedCardIds: string[];
  audioSnapshots: Map<string, Blob>;
}> {
  const audioSnapshots = new Map<string, Blob>();
  
  // Load audio blobs for affected cards
  const { getAudio } = await import('@/services/db');
  for (const cardId of affectedCardIds) {
    const audioBlob = await getAudio(cardId);
    if (audioBlob) {
      audioSnapshots.set(cardId, audioBlob);
    }
  }
  
  return {
    cards: JSON.parse(JSON.stringify(cards)), // Deep clone
    affectedCardIds: [...affectedCardIds],
    audioSnapshots,
  };
}
