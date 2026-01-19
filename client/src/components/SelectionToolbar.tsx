// components/SelectionToolbar.tsx - Toolbar for multi-select batch operations
/* Design: Warm Analog Tape Aesthetic - Selection mode controls */

import { Button } from './ui/button';
import { CheckSquare, Square, Trash2, Merge, X, FileText } from 'lucide-react';

interface SelectionToolbarProps {
  isSelectionMode: boolean;
  selectedCount: number;
  totalCount: number;
  transcriptsEnabled: boolean;
  onEnterSelectionMode: () => void;
  onExitSelectionMode: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDelete: () => void;
  onMerge: () => void;
  onToggleTranscripts: () => void;
}

export function SelectionToolbar({
  isSelectionMode,
  selectedCount,
  totalCount,
  transcriptsEnabled,
  onEnterSelectionMode,
  onExitSelectionMode,
  onSelectAll,
  onDeselectAll,
  onDelete,
  onMerge,
  onToggleTranscripts,
}: SelectionToolbarProps) {
  if (!isSelectionMode) {
    return (
      <div className="mb-4 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onEnterSelectionMode}
          className="gap-2"
        >
          <CheckSquare className="w-4 h-4" />
          Select
        </Button>
        <Button
          variant={transcriptsEnabled ? "default" : "outline"}
          size="sm"
          onClick={onToggleTranscripts}
          className="gap-2"
        >
          <FileText className="w-4 h-4" />
          Transcripts {transcriptsEnabled ? "On" : "Off"}
        </Button>
      </div>
    );
  }

  const allSelected = selectedCount === totalCount && totalCount > 0;
  const hasSelection = selectedCount > 0;

  return (
    <div className="mb-4 p-3 bg-accent/50 border border-border rounded-lg flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onExitSelectionMode}
          className="gap-2"
        >
          <X className="w-4 h-4" />
          Cancel
        </Button>
        
        <div className="h-6 w-px bg-border" />
        
        <Button
          variant="ghost"
          size="sm"
          onClick={allSelected ? onDeselectAll : onSelectAll}
          className="gap-2"
        >
          {allSelected ? (
            <>
              <Square className="w-4 h-4" />
              Deselect All
            </>
          ) : (
            <>
              <CheckSquare className="w-4 h-4" />
              Select All
            </>
          )}
        </Button>
        
        <span className="text-sm text-muted-foreground ml-2">
          {selectedCount} of {totalCount} selected
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onMerge}
          disabled={selectedCount < 2}
          className="gap-2"
        >
          <Merge className="w-4 h-4" />
          Merge ({selectedCount})
        </Button>
        
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={!hasSelection}
          className="gap-2"
        >
          <Trash2 className="w-4 h-4" />
          Delete ({selectedCount})
        </Button>
      </div>
    </div>
  );
}
