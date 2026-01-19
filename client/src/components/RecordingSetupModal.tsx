// components/RecordingSetupModal.tsx - Pre-recording metadata setup
/* Design: Warm Analog Tape Aesthetic - Clean form with warm accents */

import { useState, useMemo, useEffect, useRef } from 'react';
import { useProject } from '@/contexts/ProjectContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Mic, Tag, FileText, Palette } from 'lucide-react';
import { CARD_COLORS } from '@/lib/constants';
import type { CardColor } from '@/types';
import { cn } from '@/lib/utils';

interface RecordingSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartRecording: (metadata: {
    label: string;
    notes: string;
    tags: string[];
    color: CardColor;
  }) => void;
  mode: 'new' | 're-record' | 'append';
  existingLabel?: string;
  existingNotes?: string;
  existingTags?: string[];
  existingColor?: CardColor;
}

export function RecordingSetupModal({
  isOpen,
  onClose,
  onStartRecording,
  mode,
  existingLabel = '',
  existingNotes = '',
  existingTags = [],
  existingColor,
}: RecordingSetupModalProps) {
  const { state } = useProject();
  const titleInputRef = useRef<HTMLInputElement>(null);
  
  // Generate ordinal title for new recordings
  const getOrdinalTitle = (count: number): string => {
    const ordinals = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
    if (count < ordinals.length) {
      return `${ordinals[count]} clip`;
    }
    return `Clip ${count + 1}`;
  };
  
  const defaultLabel = mode === 'new' ? getOrdinalTitle(state.cards.length) : (existingLabel || 'Untitled Recording');
  const [label, setLabel] = useState(defaultLabel);
  const [notes, setNotes] = useState(existingNotes);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(existingTags);
  const [selectedColor, setSelectedColor] = useState<CardColor>(existingColor || 'neutral');

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (mode === 'new') {
        // Generate ordinal title
        setLabel(getOrdinalTitle(state.cards.length));
        setNotes('');
        setTags([]);
        
        // Randomly select a color
        const colors: CardColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        setSelectedColor(randomColor);
      } else if (mode === 're-record' || mode === 'append') {
        // Use existing metadata
        setLabel(existingLabel || 'Untitled Recording');
        setNotes(existingNotes);
        setTags(existingTags);
        setSelectedColor(existingColor || 'neutral');
      }
      
      // Select all text in title input after modal opens
      setTimeout(() => {
        if (titleInputRef.current) {
          titleInputRef.current.select();
        }
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Get all unique tags from existing cards, sorted by frequency
  const allTags = useMemo(() => {
    const tagCounts = new Map<string, number>();
    state.cards.forEach(card => {
      card.tags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });
    return Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1]) // Sort by frequency
      .map(([tag]) => tag);
  }, [state.cards]);

  // Filter suggestions based on input
  const suggestions = useMemo(() => {
    if (!tagInput.trim()) return allTags.slice(0, 8); // Show top 8 recent tags
    return allTags
      .filter(tag => 
        tag.toLowerCase().includes(tagInput.toLowerCase()) &&
        !tags.includes(tag)
      )
      .slice(0, 8);
  }, [tagInput, allTags, tags]);

  const handleAddTag = (tag?: string) => {
    const trimmedTag = (tag || tagInput).trim();
    if (trimmedTag && tags.length < 10 && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput('');
      setShowSuggestions(false);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions.length > 0 && showSuggestions) {
        handleAddTag(suggestions[0]); // Add first suggestion
      } else {
        handleAddTag();
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleStartRecording = () => {
    onStartRecording({
      label: label.trim() || 'Untitled Recording',
      notes: notes.trim(),
      tags,
      color: selectedColor,
    });
  };

  const getModeTitle = () => {
    switch (mode) {
      case 're-record':
        return 'Re-record Audio';
      case 'append':
        return 'Append Audio';
      default:
        return 'New Recording';
    }
  };

  const getModeDescription = () => {
    switch (mode) {
      case 're-record':
        return 'Set up your recording details before re-recording this card';
      case 'append':
        return 'Set up your recording details before appending to this card';
      default:
        return 'Set up your recording details before you start';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display flex items-center gap-2">
            <Mic className="w-6 h-6 text-primary" />
            {getModeTitle()}
          </DialogTitle>
          <DialogDescription>
            {getModeDescription()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="label" className="text-base font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Title
            </Label>
            <Input
              ref={titleInputRef}
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Enter recording title..."
              maxLength={100}
              className="text-lg"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {label.length}/100 characters
            </p>
          </div>

          {/* Color Selection */}
          <div className="space-y-2">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Color
            </Label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {(Object.keys(CARD_COLORS) as CardColor[]).map((colorKey) => {
                const color = CARD_COLORS[colorKey];
                return (
                  <button
                    key={colorKey}
                    onClick={() => setSelectedColor(colorKey)}
                    className={cn(
                      'h-12 rounded-lg border-2 transition-all hover:scale-105',
                      selectedColor === colorKey
                        ? 'border-foreground ring-2 ring-primary ring-offset-2 ring-offset-background'
                        : 'border-transparent hover:border-muted-foreground/30'
                    )}
                    style={{ backgroundColor: color.hex }}
                    title={color.name}
                  />
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Selected: {CARD_COLORS[selectedColor].name}
            </p>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="tags" className="text-base font-semibold flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Tags
            </Label>
            <div className="relative">
              <div className="flex gap-2">
                <Input
                  id="tags"
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Add a tag and press Enter..."
                  disabled={tags.length >= 10}
                  autoComplete="off"
                />
                <Button
                  type="button"
                  onClick={() => handleAddTag()}
                  disabled={!tagInput.trim() || tags.length >= 10}
                  variant="outline"
                >
                  Add
                </Button>
              </div>
              
              {/* Autocomplete suggestions */}
              {showSuggestions && suggestions.length > 0 && tags.length < 10 && (
                <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => handleAddTag(suggestion)}
                      className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2 text-sm"
                    >
                      <Tag className="w-3 h-3 text-muted-foreground" />
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded text-sm"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-destructive"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {tags.length}/10 tags
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-base font-semibold">
              Notes (Optional)
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes or context for this recording..."
              maxLength={500}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {notes.length}/500 characters
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleStartRecording}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Mic className="w-4 h-4 mr-2" />
            Start Recording
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
