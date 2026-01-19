// components/PlaybackBar.tsx - Master playback controls at bottom
/* Design: Warm Analog Tape Aesthetic - Fixed bottom bar with warm tones */

import { Play, Pause, Gauge, Repeat } from 'lucide-react';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { formatTime } from '@/lib/utils';
import { CARD_COLORS } from '@/lib/constants';
import type { Card } from '@/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface PlaybackBarProps {
  isPlaying: boolean;
  currentTime: number;
  totalDuration: number;
  playbackSpeed: number;
  cards: Card[];
  isLooping: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onLoopToggle: () => void;
}

const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2];

export function PlaybackBar({
  isPlaying,
  currentTime,
  totalDuration,
  playbackSpeed,
  cards,
  isLooping,
  onPlayPause,
  onSeek,
  onSpeedChange,
  onLoopToggle,
}: PlaybackBarProps) {
  // Calculate cumulative start times for track indicators
  const trackStartTimes = cards.reduce((acc: number[], card: Card, index: number) => {
    const prevTime = index > 0 ? acc[index - 1] + cards[index - 1].duration : 0;
    acc.push(prevTime);
    return acc;
  }, [] as number[]);

  const handleSliderChange = (values: number[]) => {
    onSeek(values[0]);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg z-50 paper-texture">
      <div className="container max-w-3xl py-4">
        <div className="space-y-3">
          {/* Slider with track indicators */}
          <div className="relative">
            <Slider
              value={[currentTime]}
              max={totalDuration || 100}
              step={0.1}
              onValueChange={handleSliderChange}
              className="w-full"
            />
            {/* Track indicators */}
            {totalDuration > 0 && trackStartTimes.slice(1).map((startTime: number, index: number) => {
              const position = (startTime / totalDuration) * 100;
              const card = cards[index + 1];
              const cardColor = CARD_COLORS[card.color].hex;
              return (
                <button
                  key={index}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeek(startTime);
                  }}
                  className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full hover:scale-150 transition-all z-10 cursor-pointer border border-background"
                  style={{ 
                    left: `${position}%`, 
                    marginLeft: '-4px',
                    backgroundColor: cardColor,
                  }}
                  title={`Jump to: ${card.label}`}
                />
              );
            })}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                onClick={onPlayPause}
                disabled={totalDuration === 0}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
              </Button>

              <div className="text-sm font-mono text-muted-foreground">
                {formatTime(currentTime)} / {formatTime(totalDuration)}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Loop toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={onLoopToggle}
                disabled={totalDuration === 0}
                className={isLooping ? 'text-primary' : ''}
                title={isLooping ? 'Loop enabled' : 'Loop disabled'}
              >
                <Repeat className={`w-5 h-5 ${isLooping ? 'text-primary' : ''}`} />
              </Button>

              {/* Speed control */}
              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-sm font-mono"
                  disabled={totalDuration === 0}
                >
                  <Gauge className="w-4 h-4 mr-1" />
                  {playbackSpeed}x
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {PLAYBACK_SPEEDS.map((speed) => (
                  <DropdownMenuItem
                    key={speed}
                    onClick={() => onSpeedChange(speed)}
                    className={playbackSpeed === speed ? 'bg-accent' : ''}
                  >
                    {speed}x {speed === 1 && '(Normal)'}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
