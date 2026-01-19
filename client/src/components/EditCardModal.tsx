// components/EditCardModal.tsx - Edit card details modal
/* Design: Warm Analog Tape Aesthetic - Modal with color picker and form fields */

import { useState, useEffect } from 'react';
import type { Card, CardColor } from '@/types';
import { CARD_COLORS } from '@/lib/constants';
import { formatTime } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Play, Mic, PlusCircle } from 'lucide-react';
import { getAudio } from '@/services/db';

interface EditCardModalProps {
  card: Card | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedCard: Card) => void;
  onReRecord: () => void;
  onAppend: () => void;
}

export function EditCardModal({
  card,
  isOpen,
  onClose,
  onSave,
  onReRecord,
  onAppend,
}: EditCardModalProps) {
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [color, setColor] = useState<CardColor>('neutral');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  useEffect(() => {
    if (card) {
      setLabel(card.label);
      setNotes(card.notes);
      setTagsInput(card.tags.join(', '));
      setColor(card.color);
    }
  }, [card]);

  if (!card) return null;

  const handleSave = () => {
    const tags = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0)
      .slice(0, 10);

    const updatedCard: Card = {
      ...card,
      label: label.slice(0, 100),
      notes: notes.slice(0, 500),
      tags,
      color,
      updatedAt: new Date().toISOString(),
    };

    onSave(updatedCard);
    onClose();
  };

  const handlePlayAudio = async () => {
    const audioBlob = await getAudio(card.id);
    if (audioBlob) {
      const audio = new Audio(URL.createObjectURL(audioBlob));
      setIsPlayingAudio(true);
      audio.onended = () => setIsPlayingAudio(false);
      audio.play();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg paper-texture">
        <DialogHeader>
          <DialogTitle>Edit Card</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Label */}
          <div className="space-y-2">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={100}
              placeholder="Untitled"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Add notes..."
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="intro, v2, needs-review"
            />
          </div>

          {/* Color picker */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(CARD_COLORS) as CardColor[]).map((colorKey) => {
                const colorData = CARD_COLORS[colorKey];
                const isSelected = color === colorKey;
                return (
                  <button
                    key={colorKey}
                    type="button"
                    onClick={() => setColor(colorKey)}
                    className={`w-10 h-10 rounded-full transition-all ${
                      isSelected ? 'ring-2 ring-offset-2 ring-primary scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: colorData.hex }}
                    title={colorData.name}
                  />
                );
              })}
            </div>
          </div>

          {/* Audio controls */}
          <div className="space-y-2">
            <Label>Audio</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground font-mono">
                Duration: {formatTime(card.duration)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePlayAudio}
                disabled={isPlayingAudio}
                className="gap-2"
              >
                <Play className="w-4 h-4" />
                Play
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onReRecord();
                  onClose();
                }}
                className="gap-2"
              >
                <Mic className="w-4 h-4" />
                Re-record
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onAppend();
                  onClose();
                }}
                className="gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                Append
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-primary hover:bg-primary/90">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
