// contexts/ProjectContext.tsx - Global state management for Voice Cards
/* Design: Warm Analog Tape Aesthetic - State management layer */

import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import type { Card, AppState, ConfirmDialogState } from '@/types';
import { getAllCards, getProject, saveProject, getSettings, saveSettings, clearAllData, saveCards } from '@/services/db';
import { uuid } from '@/lib/utils';

type Action =
  | { type: 'SET_CARDS'; payload: Card[] }
  | { type: 'ADD_CARD'; payload: Card }
  | { type: 'UPDATE_CARD'; payload: Card }
  | { type: 'DELETE_CARD'; payload: string }
  | { type: 'REORDER_CARDS'; payload: Card[] }
  | { type: 'SET_PLAYBACK'; payload: Partial<AppState['playback']> }
  | { type: 'SET_RECORDING'; payload: Partial<AppState['recording']> }
  | { type: 'SET_UI'; payload: Partial<AppState['ui']> }
  | { type: 'SET_THEME'; payload: 'light' | 'dark' }
  | { type: 'SET_TRANSCRIPTS_ENABLED'; payload: boolean }
  | { type: 'INIT_STATE'; payload: Partial<AppState> };

const initialState: AppState = {
  project: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  cards: [],
  playback: {
    isPlaying: false,
    currentCardId: null,
    currentTime: 0,
    globalTime: 0,
    totalDuration: 0,
  },
  recording: {
    isRecording: false,
    targetPosition: null,
    mode: 'new',
    targetCardId: null,
  },
  ui: {
    editingCardId: null,
    confirmDialog: null,
    isExporting: false,
    isImporting: false,
    searchQuery: '',
  },
  settings: {
    theme: 'light',
    transcriptsEnabled: false,
  },
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_CARDS': {
      // Ensure all cards have order values based on their position
      const cardsWithOrder = action.payload.map((card, index) => ({
        ...card,
        order: index,
      }));
      return {
        ...state,
        cards: cardsWithOrder,
        playback: {
          ...state.playback,
          totalDuration: cardsWithOrder.reduce((sum, card) => sum + card.duration, 0),
        },
      };
    }

    case 'ADD_CARD': {
      // Assign order value to the new card (append at end)
      const newCard = { ...action.payload, order: state.cards.length };
      const newCards = [...state.cards, newCard];
      return {
        ...state,
        cards: newCards,
        playback: {
          ...state.playback,
          totalDuration: newCards.reduce((sum, card) => sum + card.duration, 0),
        },
      };
    }

    case 'UPDATE_CARD': {
      const updatedCards = state.cards.map(card =>
        card.id === action.payload.id ? action.payload : card
      );
      return {
        ...state,
        cards: updatedCards,
        playback: {
          ...state.playback,
          totalDuration: updatedCards.reduce((sum, card) => sum + card.duration, 0),
        },
      };
    }

    case 'DELETE_CARD': {
      const filteredCards = state.cards.filter(card => card.id !== action.payload);
      return {
        ...state,
        cards: filteredCards,
        playback: {
          ...state.playback,
          totalDuration: filteredCards.reduce((sum, card) => sum + card.duration, 0),
          currentCardId: state.playback.currentCardId === action.payload ? null : state.playback.currentCardId,
        },
      };
    }

    case 'REORDER_CARDS':
      return {
        ...state,
        cards: action.payload,
      };

    case 'SET_PLAYBACK':
      return {
        ...state,
        playback: { ...state.playback, ...action.payload },
      };

    case 'SET_RECORDING':
      return {
        ...state,
        recording: { ...state.recording, ...action.payload },
      };

    case 'SET_UI':
      return {
        ...state,
        ui: { ...state.ui, ...action.payload },
      };

    case 'SET_THEME':
      return {
        ...state,
        settings: { ...state.settings, theme: action.payload },
      };

    case 'SET_TRANSCRIPTS_ENABLED':
      return {
        ...state,
        settings: { ...state.settings, transcriptsEnabled: action.payload },
      };

    case 'INIT_STATE': {
      // Ensure all cards have order values (for legacy cards without order)
      const initializedCards = action.payload.cards?.map((card: Card, index: number) => ({
        ...card,
        order: card.order ?? index,
      })) || state.cards;
      return {
        ...state,
        ...action.payload,
        cards: initializedCards,
      };
    }

    default:
      return state;
  }
}

interface ProjectContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  addCard: (card: Card) => void;
  updateCard: (card: Card) => void;
  deleteCard: (id: string) => void;
  reorderCards: (cards: Card[]) => void;
  showConfirmDialog: (dialog: ConfirmDialogState) => void;
  hideConfirmDialog: () => void;
  toggleTheme: () => void;
  toggleTranscripts: () => void;
  clearProject: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Initialize from IndexedDB
  useEffect(() => {
    async function init() {
      const [cards, project, settings] = await Promise.all([
        getAllCards(),
        getProject(),
        getSettings(),
      ]);

      dispatch({
        type: 'INIT_STATE',
        payload: {
          cards: cards || [],
          project: project || initialState.project,
          settings: settings || initialState.settings,
        },
      });
    }

    init();
  }, []);

  // Persist project updates
  useEffect(() => {
    if (state.project.createdAt) {
      const updatedProject = {
        ...state.project,
        updatedAt: new Date().toISOString(),
      };
      saveProject(updatedProject);
    }
  }, [state.cards]);

  // Persist cards with order values whenever cards change
  useEffect(() => {
    if (state.cards.length > 0) {
      saveCards(state.cards);
    }
  }, [state.cards]);

  // Persist settings
  useEffect(() => {
    saveSettings(state.settings);
  }, [state.settings]);

  const addCard = useCallback((card: Card) => {
    dispatch({ type: 'ADD_CARD', payload: card });
  }, []);

  const updateCard = useCallback((card: Card) => {
    dispatch({ type: 'UPDATE_CARD', payload: card });
  }, []);

  const deleteCard = useCallback((id: string) => {
    dispatch({ type: 'DELETE_CARD', payload: id });
  }, []);

  const reorderCards = useCallback((cards: Card[]) => {
    // Assign order values based on position and persist to IndexedDB
    const orderedCards = cards.map((card, index) => ({
      ...card,
      order: index,
    }));
    dispatch({ type: 'REORDER_CARDS', payload: orderedCards });
    saveCards(orderedCards);
  }, []);

  const showConfirmDialog = useCallback((dialog: ConfirmDialogState) => {
    dispatch({ type: 'SET_UI', payload: { confirmDialog: dialog } });
  }, []);

  const hideConfirmDialog = useCallback(() => {
    dispatch({ type: 'SET_UI', payload: { confirmDialog: null } });
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = state.settings.theme === 'light' ? 'dark' : 'light';
    dispatch({ type: 'SET_THEME', payload: newTheme });
  }, [state.settings.theme]);

  const toggleTranscripts = useCallback(() => {
    dispatch({ type: 'SET_TRANSCRIPTS_ENABLED', payload: !state.settings.transcriptsEnabled });
  }, [state.settings.transcriptsEnabled]);

  const clearProject = useCallback(async () => {
    await clearAllData();
    dispatch({
      type: 'INIT_STATE',
      payload: {
        cards: [],
        project: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }, []);

  const value: ProjectContextValue = {
    state,
    dispatch,
    addCard,
    updateCard,
    deleteCard,
    reorderCards,
    showConfirmDialog,
    hideConfirmDialog,
    toggleTheme,
    toggleTranscripts,
    clearProject,
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within ProjectProvider');
  }
  return context;
}
