// types/history.ts - Undo/redo history types
/* Design: Warm Analog Tape Aesthetic - History management types */

import type { Card } from './index';

export type HistoryActionType = 
  | 'TRIM'
  | 'SPLIT'
  | 'DELETE'
  | 'EDIT'
  | 'REORDER'
  | 'RE_RECORD'
  | 'APPEND';

export interface CardSnapshot {
  card: Card;
  audio: Blob;
}

export interface HistoryAction {
  type: HistoryActionType;
  timestamp: number;
  description: string;
  
  // Store both before and after states for easy undo/redo
  before: {
    cards: Card[]; // Full cards array before the operation
    affectedCardIds: string[]; // IDs of cards that were modified/deleted
    audioSnapshots: Map<string, Blob>; // Audio blobs for affected cards
  };
  
  after: {
    cards: Card[]; // Full cards array after the operation
    affectedCardIds: string[]; // IDs of cards that were created/modified
    audioSnapshots: Map<string, Blob>; // Audio blobs for affected cards
  };
}

export interface HistoryState {
  past: HistoryAction[];
  future: HistoryAction[];
  maxHistorySize: number;
}
