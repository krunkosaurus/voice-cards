// components/Card.tsx - Individual voice card component
/* Design: Warm Analog Tape Aesthetic - Soft shadows, rounded corners, warm color bars */

import { useState, useRef, useEffect } from 'react';
import type { Card as CardType } from '@/types';
import { CARD_COLORS } from '@/lib/constants';
import { formatTime, cn } from '@/lib/utils';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Play, Pause, MoreVertical, Pencil, Mic, PlusCircle, Copy, Trash2, Scissors, GripVertical, CheckSquare, Square, Plus, Minus } from 'lucide-react';
import { getAudio } from '@/services/db';
import { WaveformThumbnail } from './WaveformThumbnail';

interface CardProps {
  card: CardType;
  cardNumber: number;
  isPlaying?: boolean;
  isPlayingIndividually?: boolean;
  playbackProgress?: number;
  onPlay: () => void;
  onPause?: () => void;
  onSeek?: (progress: number) => void;
  onEdit: () => void;
  onReRecord: () => void;
  onAppend: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onTrimSplit: () => void;
  onAddSilenceStart?: () => void;
  onAddSilenceEnd?: () => void;
  onRemoveSilenceStart?: () => void;
  onRemoveSilenceEnd?: () => void;
  onTitleUpdate?: (updatedCard: CardType) => void;
  dragListeners?: any;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: () => void;
}

export function Card({
  card,
  cardNumber,
  isPlaying = false,
  isPlayingIndividually = false,
  playbackProgress = 0,
  onPlay,
  onPause,
  onSeek,
  onEdit,
  onReRecord,
  onAppend,
  onDuplicate,
  onDelete,
  onTrimSplit,
  onAddSilenceStart,
  onAddSilenceEnd,
  onRemoveSilenceStart,
  onRemoveSilenceEnd,
  onTitleUpdate,
  dragListeners,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelection,
}: CardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(card.label);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const colorHex = CARD_COLORS[card.color].hex;

  // Select all text when entering edit mode
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleTitleDoubleClick = () => {
    setIsEditingTitle(true);
    setEditedTitle(card.label);
  };

  const handleTitleSave = async () => {
    if (editedTitle.trim() && editedTitle !== card.label) {
      const updatedCard = { ...card, label: editedTitle.trim(), updatedAt: new Date().toISOString() };
      await import('@/services/db').then(m => m.saveCard(updatedCard));
      if (onTitleUpdate) {
        onTitleUpdate(updatedCard);
      }
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
      setEditedTitle(card.label);
    }
  };

  // Play button now uses the master player via onPlay callback

  return (
    <div
      className={cn(
        'relative rounded-xl overflow-hidden transition-all duration-300 paper-texture',
        'bg-card border border-border',
        isHovered && 'shadow-lg scale-[1.01]',
        isPlaying && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Color bar */}
      <div
        className="h-1 w-full"
        style={{ backgroundColor: colorHex }}
      />

      <div className="flex">
        {/* Main content area */}
        <div className="flex-1 p-2 sm:p-4 flex items-start gap-2 sm:gap-3">
          {/* Selection checkbox or card number */}
          <div className="shrink-0 w-6 sm:w-8 h-8 flex items-center justify-center">
            {isSelectionMode ? (
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8"
                onClick={onToggleSelection}
              >
                {isSelected ? (
                  <CheckSquare className="w-5 h-5 text-primary" />
                ) : (
                  <Square className="w-5 h-5" />
                )}
              </Button>
            ) : (
              <span className="text-sm font-mono text-muted-foreground/60">
                {cardNumber}
              </span>
            )}
          </div>

          {/* Play/Pause button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              if (isPlayingIndividually && onPause) {
                onPause();
              } else {
                onPlay();
              }
            }}
            className="shrink-0 hover:bg-primary/10 hover:text-primary"
          >
            {isPlayingIndividually ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </Button>

          {/* Content */}
          <div className="flex-1 min-w-0">
          {/* Label and duration */}
          <div className="flex items-center justify-between mb-2">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                autoFocus
                maxLength={100}
                className="font-display font-semibold text-lg bg-transparent border-b-2 border-primary focus:outline-none flex-1 mr-2"
              />
            ) : (
              <h3 
                className="font-display font-semibold text-lg truncate cursor-text hover:text-primary transition-colors"
                onDoubleClick={handleTitleDoubleClick}
                title="Double-click to edit"
              >
                {card.label}
              </h3>
            )}
            <span className="text-sm font-mono text-muted-foreground shrink-0">
              {formatTime(card.duration)}
            </span>
          </div>

          {/* Waveform thumbnail */}
          <div className="my-2">
            <WaveformThumbnail
              cardId={card.id}
              waveformData={card.waveformData}
              color={colorHex}
              playbackProgress={(isPlayingIndividually || isPlaying) ? playbackProgress : 0}
              onSeek={onSeek}
            />
          </div>

          {/* Tags */}
          {card.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {card.tags.slice(0, 3).map((tag, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
              {card.tags.length > 3 && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">
                  +{card.tags.length - 3} more
                </span>
              )}
            </div>
          )}

          {/* Notes preview */}
          {card.notes && (
            <p className="text-sm text-secondary-foreground italic line-clamp-2">
              {card.notes}
            </p>
          )}
          </div>

          {/* Quick action buttons - hidden on mobile to save space */}
          <div className="hidden sm:flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 hover:bg-muted h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
              }}
              title="Duplicate"
            >
              <Copy className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 hover:bg-destructive/10 hover:text-destructive h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Menu button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 hover:bg-muted"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="w-4 h-4 mr-2" />
                Edit Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onReRecord}>
                <Mic className="w-4 h-4 mr-2" />
                Re-record
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAppend}>
                <PlusCircle className="w-4 h-4 mr-2" />
                Append Audio
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onTrimSplit}>
                <Scissors className="w-4 h-4 mr-2" />
                Trim/Split
              </DropdownMenuItem>
              {onAddSilenceStart && (
                <DropdownMenuItem onClick={onAddSilenceStart}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add 1s Silence to Start
                </DropdownMenuItem>
              )}
              {onAddSilenceEnd && (
                <DropdownMenuItem onClick={onAddSilenceEnd}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add 1s Silence to End
                </DropdownMenuItem>
              )}
              {onRemoveSilenceStart && (
                <DropdownMenuItem onClick={onRemoveSilenceStart}>
                  <Minus className="w-4 h-4 mr-2" />
                  Remove 1s from Start
                </DropdownMenuItem>
              )}
              {onRemoveSilenceEnd && (
                <DropdownMenuItem onClick={onRemoveSilenceEnd}>
                  <Minus className="w-4 h-4 mr-2" />
                  Remove 1s from End
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Drag handle - full height on right edge */}
        <div
          className="w-8 sm:w-10 flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-muted/50 transition-colors border-l border-border"
          {...dragListeners}
          title="Drag to reorder"
        >
          <GripVertical className="w-4 sm:w-5 h-4 sm:h-5 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}
