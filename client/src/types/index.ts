// types/index.ts - Voice Cards type definitions

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
  waveformData?: number[];
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

export interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  isDestructive?: boolean;
}

export interface AppState {
  project: Project;
  cards: Card[];
  playback: {
    isPlaying: boolean;
    currentCardId: string | null;
    currentTime: number;
    globalTime: number;
    totalDuration: number;
  };
  recording: {
    isRecording: boolean;
    targetPosition: number | null;
    mode: 'new' | 're-record' | 'append';
    targetCardId: string | null;
  };
  ui: {
    editingCardId: string | null;
    confirmDialog: ConfirmDialogState | null;
    isExporting: boolean;
    isImporting: boolean;
    searchQuery: string;
  };
  settings: Settings;
}
