// components/CardList.tsx - Draggable card list with insertion buttons
/* Design: Warm Analog Tape Aesthetic - Vertical timeline with insertion points */

import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Card as CardType, TranscriptSegment } from '@/types';
import { Card } from './Card';
import { Button } from './ui/button';
import { Plus, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CardListProps {
  cards: CardType[];
  currentCardId: string | null;
  playingCardId: string | null;
  isIndividualPlaying?: boolean;
  individualPlaybackProgress: number;
  masterPlaybackProgress: number;
  transcriptsEnabled?: boolean;
  onReorder: (cards: CardType[]) => void;
  onCardPlay: (cardId: string) => void;
  onCardPause: () => void;
  onCardSeek?: (cardId: string, progress: number) => void;
  onCardEdit: (card: CardType) => void;
  onCardReRecord: (card: CardType) => void;
  onCardAppend: (card: CardType) => void;
  onCardDuplicate: (card: CardType) => void;
  onCardDelete: (card: CardType) => void;
  onCardTrimSplit: (card: CardType) => void;
  onCardAddSilenceStart?: (card: CardType) => void;
  onCardAddSilenceEnd?: (card: CardType) => void;
  onCardRemoveSilenceStart?: (card: CardType) => void;
  onCardRemoveSilenceEnd?: (card: CardType) => void;
  onCardTitleUpdate: (card: CardType) => void;
  onCardTranscriptGenerated?: (cardId: string, transcript: TranscriptSegment[]) => void;
  onInsertAt: (position: number) => void;
  isSelectionMode?: boolean;
  selectedCardIds?: Set<string>;
  onToggleCardSelection?: (cardId: string) => void;
}

function SortableCard({
  card,
  cardNumber,
  isPlaying,
  isPlayingIndividually,
  playbackProgress,
  currentPlaybackTime,
  transcriptsEnabled,
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
  onTranscriptGenerated,
  isSelectionMode,
  isSelected,
  onToggleSelection,
}: {
  card: CardType;
  cardNumber: number;
  isPlaying: boolean;
  isPlayingIndividually: boolean;
  playbackProgress: number;
  currentPlaybackTime: number;
  transcriptsEnabled?: boolean;
  onPlay: () => void;
  onPause: () => void;
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
  onTitleUpdate: (card: CardType) => void;
  onTranscriptGenerated?: (cardId: string, transcript: TranscriptSegment[]) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card
        card={card}
        cardNumber={cardNumber}
        isPlaying={isPlaying}
        isPlayingIndividually={isPlayingIndividually}
        playbackProgress={playbackProgress}
        currentPlaybackTime={currentPlaybackTime}
        transcriptsEnabled={transcriptsEnabled}
        onPlay={onPlay}
        onPause={onPause}
        onSeek={onSeek}
        onEdit={onEdit}
        onReRecord={onReRecord}
        onAppend={onAppend}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onTrimSplit={onTrimSplit}
        onAddSilenceStart={onAddSilenceStart}
        onAddSilenceEnd={onAddSilenceEnd}
        onRemoveSilenceStart={onRemoveSilenceStart}
        onRemoveSilenceEnd={onRemoveSilenceEnd}
        isSelectionMode={isSelectionMode}
        isSelected={isSelected}
        onToggleSelection={onToggleSelection}
        onTitleUpdate={onTitleUpdate}
        onTranscriptGenerated={onTranscriptGenerated}
        dragListeners={listeners}
      />
    </div>
  );
}

function InsertionButton({ onClick, className, forceExpanded = false }: { onClick: () => void; className?: string; forceExpanded?: boolean }) {
  const [isHovered, setIsHovered] = useState(false);
  const isExpanded = forceExpanded || isHovered;
  
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'w-full transition-all duration-200 flex items-center justify-center gap-2 rounded-lg group',
        isExpanded ? 'py-3 border-2 border-dashed border-primary bg-primary/5' : 'py-1 border-t border-muted-foreground/20',
        className
      )}
    >
      {isExpanded && (
        <>
          <Plus className="w-4 h-4 text-primary" />
          <span className="text-sm text-primary font-medium">Add Recording</span>
        </>
      )}
    </button>
  );
}

export function CardList({
  cards,
  currentCardId,
  playingCardId,
  isIndividualPlaying = false,
  individualPlaybackProgress,
  masterPlaybackProgress,
  transcriptsEnabled = false,
  onReorder,
  onCardPlay,
  onCardPause,
  onCardSeek,
  onCardEdit,
  onCardReRecord,
  onCardAppend,
  onCardDuplicate,
  onCardDelete,
  onCardTrimSplit,
  onCardAddSilenceStart,
  onCardAddSilenceEnd,
  onCardRemoveSilenceStart,
  onCardRemoveSilenceEnd,
  onCardTitleUpdate,
  onCardTranscriptGenerated,
  onInsertAt,
  isSelectionMode = false,
  selectedCardIds = new Set(),
  onToggleCardSelection,
}: CardListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = cards.findIndex((c) => c.id === active.id);
      const newIndex = cards.findIndex((c) => c.id === over.id);
      const reordered = arrayMove(cards, oldIndex, newIndex);
      onReorder(reordered);
    }
  };

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4">
        <div className="relative max-w-md w-full">
          {/* Note card styling */}
          <div className="bg-card border border-border rounded-xl shadow-lg overflow-hidden transform rotate-[-0.5deg] hover:rotate-0 transition-transform duration-300">
            {/* Color bar at top like voice cards */}
            <div className="h-2 bg-gradient-to-r from-primary via-orange-400 to-yellow-400" />

            <div className="p-6 sm:p-8">
              {/* Mic icon */}
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Mic className="w-8 h-8 text-primary" />
              </div>

              <h2 className="text-2xl font-display font-semibold text-center mb-4">
                Welcome to Voice Cards
              </h2>

              <div className="text-muted-foreground space-y-3 text-sm sm:text-base">
                <p>
                  Record, organize, and sequence audio clips with ease. Perfect for voice notes,
                  podcast segments, language practice, or audio storyboarding.
                </p>
                <p>
                  <span className="text-foreground font-medium">Trim, split, merge</span>, and{' '}
                  <span className="text-foreground font-medium">reorder</span> your recordings.
                  Add <span className="text-foreground font-medium">automatic transcripts</span> with
                  synchronized highlighting.
                </p>
              </div>

              {/* Privacy note */}
              <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border/50">
                <p className="text-sm text-center">
                  <span className="text-primary font-semibold">100% free & private</span>
                  <br />
                  <span className="text-muted-foreground">
                    Your audio and text are stored in your browser. Nothing leaves your device.
                  </span>
                </p>
              </div>

              {/* CTA Button */}
              <div className="mt-6 flex justify-center">
                <Button
                  size="lg"
                  onClick={() => onInsertAt(0)}
                  className="gap-2 bg-primary hover:bg-primary/90 shadow-md"
                >
                  <Plus className="w-5 h-5" />
                  Start Recording
                </Button>
              </div>
            </div>
          </div>

          {/* Decorative shadow/paper effect */}
          <div className="absolute inset-0 bg-card border border-border rounded-xl -z-10 transform rotate-[1deg] translate-y-1 opacity-50" />
        </div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {/* Insertion button at top */}
          <InsertionButton onClick={() => onInsertAt(0)} />

          {cards.map((card, index) => {
            // Compute current playback time in seconds for this card
            const progress = card.id === playingCardId ? individualPlaybackProgress :
                            card.id === currentCardId ? masterPlaybackProgress : 0;
            const currentPlaybackTime = progress * card.duration;

            return (
              <React.Fragment key={card.id}>
                <SortableCard
                  card={card}
                  cardNumber={index + 1}
                  isPlaying={card.id === currentCardId}
                  isPlayingIndividually={card.id === playingCardId && isIndividualPlaying}
                  playbackProgress={progress}
                  currentPlaybackTime={currentPlaybackTime}
                  transcriptsEnabled={transcriptsEnabled}
                  onPlay={() => onCardPlay(card.id)}
                  onPause={onCardPause}
                  onSeek={onCardSeek ? (p) => onCardSeek(card.id, p) : undefined}
                  onEdit={() => onCardEdit(card)}
                  onReRecord={() => onCardReRecord(card)}
                  onAppend={() => onCardAppend(card)}
                  onDuplicate={() => onCardDuplicate(card)}
                  onDelete={() => onCardDelete(card)}
                  onTrimSplit={() => onCardTrimSplit(card)}
                  onAddSilenceStart={onCardAddSilenceStart ? () => onCardAddSilenceStart(card) : undefined}
                  onAddSilenceEnd={onCardAddSilenceEnd ? () => onCardAddSilenceEnd(card) : undefined}
                  onRemoveSilenceStart={onCardRemoveSilenceStart ? () => onCardRemoveSilenceStart(card) : undefined}
                  onRemoveSilenceEnd={onCardRemoveSilenceEnd ? () => onCardRemoveSilenceEnd(card) : undefined}
                  onTitleUpdate={onCardTitleUpdate}
                  onTranscriptGenerated={onCardTranscriptGenerated}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedCardIds.has(card.id)}
                  onToggleSelection={onToggleCardSelection ? () => onToggleCardSelection(card.id) : undefined}
                />
                <InsertionButton
                  onClick={() => onInsertAt(index + 1)}
                  forceExpanded={index === cards.length - 1}
                />
              </React.Fragment>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
