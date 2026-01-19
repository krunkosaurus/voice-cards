// components/AudioTrimmer.tsx - Audio trimming and splitting interface
/* Design: Warm Analog Tape Aesthetic - Visual audio editor */

import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { formatTime } from '@/lib/utils';
import { Play, Scissors, Trash2 } from 'lucide-react';
import { getAudio } from '@/services/db';
import { generateWaveformData, renderWaveformToCanvas } from '@/services/waveformGenerator';

interface AudioTrimmerProps {
  isOpen: boolean;
  cardId: string | null;
  duration: number;
  onClose: () => void;
  onTrim: (startTime: number, endTime: number) => void;
  onSplit: (splitTime: number) => void;
}

export function AudioTrimmer({
  isOpen,
  cardId,
  duration,
  onClose,
  onTrim,
  onSplit,
}: AudioTrimmerProps) {
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(duration);
  const [splitTime, setSplitTime] = useState(duration / 2);
  const [mode, setMode] = useState<'trim' | 'split'>('trim');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 120 });

  // Dynamically resize canvas based on container width
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        // Use device pixel ratio for sharp rendering
        const dpr = window.devicePixelRatio || 1;
        setCanvasSize({
          width: Math.floor(width * dpr),
          height: Math.floor(120 * dpr)
        });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isOpen]);

  // Reset trim state when card changes
  useEffect(() => {
    if (isOpen && cardId) {
      setStartTime(0);
      setEndTime(duration);
      setSplitTime(duration / 2);
      setMode('trim');
      setIsPlaying(false);
      setPlaybackPosition(0);
    }
  }, [cardId, duration, isOpen]);

  useEffect(() => {
    if (!cardId || !isOpen) return;

    async function loadWaveform() {
      const audioBlob = await getAudio(cardId!);
      if (!audioBlob) return;

      const waveformData = await generateWaveformData(audioBlob, 100);
      if (canvasRef.current) {
        renderWaveformToCanvas(canvasRef.current, waveformData, '#D97642');
      }

      // Create audio element for preview
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      audioRef.current.src = URL.createObjectURL(audioBlob);
    }

    loadWaveform();

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, [cardId, isOpen]);

  // Update playback position during preview
  useEffect(() => {
    if (!isPlaying || !audioRef.current) return;

    const updatePosition = () => {
      if (audioRef.current) {
        setPlaybackPosition(audioRef.current.currentTime);
      }
    };

    const interval = setInterval(updatePosition, 50);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handlePlayPreview = async () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.currentTime = mode === 'trim' ? startTime : 0;
      setPlaybackPosition(mode === 'trim' ? startTime : 0);
      audioRef.current.play();
      setIsPlaying(true);

      audioRef.current.onended = () => {
        setIsPlaying(false);
        setPlaybackPosition(0);
      };
      
      if (mode === 'trim') {
        // Stop at end time for trim preview
        const checkTime = setInterval(() => {
          if (audioRef.current && audioRef.current.currentTime >= endTime) {
            audioRef.current.pause();
            setIsPlaying(false);
            setPlaybackPosition(0);
            clearInterval(checkTime);
          }
        }, 100);
      }
    }
  };

  // Spacebar to play/pause preview
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle spacebar, and only when not in an input field
      if (
        e.code === 'Space' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        handlePlayPreview();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPlaying, startTime, endTime, mode]);

  const handleTrim = () => {
    // Stop playback if playing
    if (audioRef.current && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    onTrim(startTime, endTime);
    onClose();
  };

  const handleSplit = () => {
    onSplit(splitTime);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl paper-texture">
        <DialogHeader>
          <DialogTitle>Edit Audio</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Mode selector */}
          <div className="flex gap-2">
            <Button
              variant={mode === 'trim' ? 'default' : 'outline'}
              onClick={() => setMode('trim')}
              className="flex-1"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Trim
            </Button>
            <Button
              variant={mode === 'split' ? 'default' : 'outline'}
              onClick={() => setMode('split')}
              className="flex-1"
            >
              <Scissors className="w-4 h-4 mr-2" />
              Split
            </Button>
          </div>

          {/* Waveform */}
          <div ref={containerRef} className="relative bg-muted rounded-lg p-4">
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              className="w-full"
              style={{ display: 'block', height: '120px' }}
            />
            
            {/* Trim markers */}
            {mode === 'trim' && (
              <>
                <div
                  className="absolute top-0 bottom-0 bg-destructive/20"
                  style={{
                    left: '1rem',
                    width: `calc(${(startTime / duration) * 100}% - 1rem)`,
                  }}
                />
                <div
                  className="absolute top-0 bottom-0 bg-destructive/20"
                  style={{
                    right: '1rem',
                    width: `calc(${((duration - endTime) / duration) * 100}% - 1rem)`,
                  }}
                />
              </>
            )}

            {/* Split marker */}
            {mode === 'split' && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-primary"
                style={{
                  left: `calc(1rem + (100% - 2rem) * ${splitTime / duration})`,
                }}
              />
            )}

            {/* Playback position indicator */}
            {isPlaying && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-primary z-10"
                style={{
                  left: `calc(1rem + (100% - 2rem) * ${playbackPosition / duration})`,
                  transition: 'left 0.05s linear',
                }}
              />
            )}
          </div>

          {/* Controls */}
          {mode === 'trim' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Start: {formatTime(startTime)}</span>
                  <span>End: {formatTime(endTime)}</span>
                </div>
                {/* Single range slider with two handles */}
                <Slider
                  value={[startTime, endTime]}
                  max={duration}
                  step={0.1}
                  minStepsBetweenThumbs={1}
                  onValueChange={(v) => {
                    setStartTime(v[0]);
                    setEndTime(v[1]);
                  }}
                />
              </div>
              <div className="text-sm text-muted-foreground text-center">
                New duration: {formatTime(endTime - startTime)}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Split at: {formatTime(splitTime)}</span>
                </div>
                <Slider
                  value={[splitTime]}
                  max={duration}
                  step={0.1}
                  onValueChange={(v) => setSplitTime(v[0])}
                />
              </div>
              <div className="text-sm text-muted-foreground text-center">
                Part 1: {formatTime(splitTime)} | Part 2: {formatTime(duration - splitTime)}
              </div>
            </div>
          )}

          {/* Preview button */}
          <Button
            variant="outline"
            onClick={handlePlayPreview}
            className="w-full"
          >
            <Play className="w-4 h-4 mr-2" />
            {isPlaying ? 'Stop Preview' : 'Preview'}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={mode === 'trim' ? handleTrim : handleSplit}
            className="bg-primary hover:bg-primary/90"
          >
            {mode === 'trim' ? 'Apply Trim' : 'Split Card'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
