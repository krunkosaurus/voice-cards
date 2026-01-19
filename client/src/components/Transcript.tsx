// components/Transcript.tsx - Animated transcript display with segment highlighting
import { useRef, useEffect } from 'react';
import type { TranscriptSegment } from '@/types';
import { cn } from '@/lib/utils';

interface TranscriptProps {
  segments: TranscriptSegment[];
  currentTime: number;
  isPlaying: boolean;
  onSegmentClick?: (time: number) => void;
}

export function Transcript({ segments, currentTime, isPlaying, onSegmentClick }: TranscriptProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeSegmentRef = useRef<HTMLSpanElement>(null);

  // Find the currently active segment based on playback time
  // Only highlight if actually playing and currentTime > 0
  const activeSegmentIndex = isPlaying && currentTime > 0
    ? segments.findIndex(
        (segment) => currentTime >= segment.start && currentTime < segment.end
      )
    : -1; // No active segment when not playing

  // Auto-scroll to keep active segment visible
  useEffect(() => {
    if (activeSegmentRef.current && containerRef.current && isPlaying) {
      const container = containerRef.current;
      const activeEl = activeSegmentRef.current;

      const containerRect = container.getBoundingClientRect();
      const activeRect = activeEl.getBoundingClientRect();

      // Check if active segment is outside visible area
      if (activeRect.top < containerRect.top || activeRect.bottom > containerRect.bottom) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeSegmentIndex, isPlaying]);

  if (segments.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic py-2">
        No transcript available
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="max-h-32 overflow-y-auto pr-2 scrollbar-thin"
    >
      <p className="text-sm leading-relaxed">
        {segments.map((segment, index) => {
          const isActive = index === activeSegmentIndex;
          // Only mark as past when playing and time has passed this segment
          const isPast = isPlaying && currentTime > 0 && currentTime >= segment.end;

          return (
            <span
              key={index}
              ref={isActive ? activeSegmentRef : null}
              onClick={() => onSegmentClick?.(segment.start)}
              className={cn(
                'transition-all duration-200 cursor-pointer rounded px-0.5 -mx-0.5',
                'hover:bg-primary/10',
                isActive && 'bg-primary/20 text-primary font-medium',
                isPast && !isActive && 'text-muted-foreground',
                !isPast && !isActive && 'text-foreground'
              )}
            >
              {segment.text}
              {index < segments.length - 1 && ' '}
            </span>
          );
        })}
      </p>
    </div>
  );
}
