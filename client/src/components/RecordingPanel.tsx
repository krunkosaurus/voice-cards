// components/RecordingPanel.tsx - Recording interface with waveform
/* Design: Warm Analog Tape Aesthetic - Modal with soft shadows and warm tones */

import { useEffect, useState, useRef } from 'react';
import { useRecorder } from '@/hooks/useRecorder';
import { Waveform } from './Waveform';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { formatTime } from '@/lib/utils';
import { Mic, Square, X, Pause, Play, Scissors } from 'lucide-react';
import { generateWaveformData, renderWaveformToCanvas } from '@/services/waveformGenerator';
import { trimAudio } from '@/services/audioTrimmer';

interface RecordingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (blob: Blob, duration: number) => void;
  title?: string;
}

export function RecordingPanel({ isOpen, onClose, onSave, title = 'New Recording' }: RecordingPanelProps) {
  const { isRecording, isPaused, elapsedTime, audioBlob, error, prepareRecording, startRecording, stopRecording, pauseRecording, resumeRecording, cancelRecording, getAnalyser } = useRecorder();
  const [hasStarted, setHasStarted] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showTrimMode, setShowTrimMode] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const trimCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackAnimationRef = useRef<number | null>(null);

  // Spacebar handler for trim mode preview
  useEffect(() => {
    if (!showTrimMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handlePreview();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showTrimMode, isPreviewPlaying, trimStart, trimEnd]);

  // Play beep sound using Web Audio API
  const playBeep = (frequency: number, duration: number) => {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';

    // Envelope for smooth sound
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  };

  // Start countdown and prepare recording when panel opens
  useEffect(() => {
    if (isOpen && !hasStarted) {
      setCountdown(3);
      setHasStarted(true);
      // Preload recorder during countdown to eliminate delay
      prepareRecording();
    }
  }, [isOpen, hasStarted, prepareRecording]);

  // Countdown timer with beeps
  useEffect(() => {
    if (countdown === null || countdown === 0) return;

    // Play beep sound - higher pitch for 3 & 2, lower for 1
    const frequency = countdown === 1 ? 800 : 1000;
    playBeep(frequency, 0.1);

    const timer = setTimeout(() => {
      if (countdown > 1) {
        setCountdown(countdown - 1);
      } else {
        setCountdown(0);
        startRecording();
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, startRecording]);

  useEffect(() => {
    if (!isOpen) {
      setHasStarted(false);
      setCountdown(null);
      cancelRecording();
    }
  }, [isOpen, cancelRecording]);

  // Spacebar hold-to-pause functionality
  useEffect(() => {
    if (!isOpen || !isRecording || countdown !== null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if spacebar and not already paused and not in an input field
      if (e.code === 'Space' && !isPaused && !e.repeat) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          pauseRecording();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Resume when spacebar is released
      if (e.code === 'Space' && isPaused) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          resumeRecording();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isOpen, isRecording, isPaused, countdown, pauseRecording, resumeRecording]);

  const handleStop = async () => {
    stopRecording();
    // Transition to trim mode after recording stops
    setShowTrimMode(true);
  };

  // Load waveform and setup trim when entering trim mode
  useEffect(() => {
    if (showTrimMode && audioBlob) {
      const loadTrimData = async () => {
        // Get audio duration
        const audio = new Audio();
        audio.src = URL.createObjectURL(audioBlob);
        await new Promise((resolve) => {
          audio.addEventListener('loadedmetadata', () => {
            setTrimStart(0);
            setTrimEnd(audio.duration);
            resolve(null);
          });
        });

        // Generate and render waveform (600 samples to match canvas width)
        const waveformData = await generateWaveformData(audioBlob, 600);
        if (trimCanvasRef.current) {
          renderWaveformToCanvas(trimCanvasRef.current, waveformData, '#D97642');
        }

        // Setup preview audio
        if (!previewAudioRef.current) {
          previewAudioRef.current = new Audio();
        }
        previewAudioRef.current.src = URL.createObjectURL(audioBlob);
      };

      loadTrimData();
    }
  }, [showTrimMode, audioBlob]);

  const handleCancel = () => {
    // Show confirmation if in trim mode (recording complete)
    if (showTrimMode) {
      if (confirm('Are you sure you want to discard this recording? This action cannot be undone.')) {
        cancelRecording();
        onClose();
      }
    } else {
      // During recording, cancel immediately
      cancelRecording();
      onClose();
    }
  };

  const handleSave = async () => {
    if (audioBlob) {
      let finalBlob = audioBlob;
      let finalDuration = trimEnd - trimStart;

      // Apply trim if in trim mode and trim points have changed
      if (showTrimMode && (trimStart > 0 || trimEnd < elapsedTime)) {
        finalBlob = await trimAudio(audioBlob, trimStart, trimEnd);
      }

      // Get duration from final blob
      const audio = new Audio();
      audio.src = URL.createObjectURL(finalBlob);
      audio.addEventListener('loadedmetadata', () => {
        onSave(finalBlob, audio.duration);
        setShowTrimMode(false);
        setHasStarted(false);
        onClose();
      });
    }
  };

  const handlePreview = () => {
    if (!previewAudioRef.current) return;

    if (isPreviewPlaying) {
      previewAudioRef.current.pause();
      setIsPreviewPlaying(false);
      if (playbackAnimationRef.current) {
        cancelAnimationFrame(playbackAnimationRef.current);
        playbackAnimationRef.current = null;
      }
    } else {
      previewAudioRef.current.currentTime = trimStart;
      previewAudioRef.current.play();
      setIsPreviewPlaying(true);

      // Animate playback position
      const updatePosition = () => {
        if (previewAudioRef.current) {
          const currentTime = previewAudioRef.current.currentTime;
          setPlaybackPosition(currentTime);
          
          // Stop at trim end
          if (currentTime >= trimEnd) {
            previewAudioRef.current.pause();
            setIsPreviewPlaying(false);
            setPlaybackPosition(0);
            if (playbackAnimationRef.current) {
              cancelAnimationFrame(playbackAnimationRef.current);
              playbackAnimationRef.current = null;
            }
          } else {
            playbackAnimationRef.current = requestAnimationFrame(updatePosition);
          }
        }
      };
      
      playbackAnimationRef.current = requestAnimationFrame(updatePosition);
      previewAudioRef.current.onended = () => {
        setIsPreviewPlaying(false);
        setPlaybackPosition(0);
        if (playbackAnimationRef.current) {
          cancelAnimationFrame(playbackAnimationRef.current);
          playbackAnimationRef.current = null;
        }
      };
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-2xl paper-texture">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {error && (
            <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
              {error}
            </div>
          )}

          {/* Waveform or Trim Interface */}
          {showTrimMode ? (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold flex items-center justify-center gap-2">
                  <Scissors className="w-5 h-5" />
                  Trim Recording
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Adjust the trim points to remove unwanted parts
                </p>
              </div>
              
              <div className="relative bg-muted rounded-lg p-4">
                <canvas
                  ref={trimCanvasRef}
                  width={600}
                  height={80}
                  className="w-full"
                />
                
                {/* Trim markers */}
                <div
                  className="absolute top-0 bottom-0 bg-destructive/20"
                  style={{
                    left: '1rem',
                    width: `${(trimStart / elapsedTime) * 100}%`,
                  }}
                />
                <div
                  className="absolute top-0 bottom-0 bg-destructive/20"
                  style={{
                    right: '1rem',
                    width: `${((elapsedTime - trimEnd) / elapsedTime) * 100}%`,
                  }}
                />
                
                {/* Playback position indicator */}
                {isPreviewPlaying && playbackPosition > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-10"
                    style={{
                      left: `calc(1rem + ${(playbackPosition / elapsedTime) * (100 - 2)}%)`,
                    }}
                  />
                )}
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Start: {formatTime(trimStart)}</span>
                  <span>End: {formatTime(trimEnd)}</span>
                </div>
                <Slider
                  value={[trimStart, trimEnd]}
                  max={elapsedTime}
                  step={0.1}
                  minStepsBetweenThumbs={1}
                  onValueChange={(v) => {
                    setTrimStart(v[0]);
                    setTrimEnd(v[1]);
                  }}
                />
                <div className="text-sm text-muted-foreground text-center">
                  New duration: {formatTime(trimEnd - trimStart)}
                </div>
              </div>
              
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={handlePreview}
                  className="gap-2"
                >
                  {isPreviewPlaying ? (
                    <>
                      <Pause className="w-4 h-4" />
                      Stop Preview
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Preview
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <Waveform analyser={getAnalyser()} isRecording={isRecording} />
              
              {/* Countdown overlay */}
              {countdown !== null && countdown > 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
                  <div className="text-center">
                    <div className="text-8xl font-bold text-primary animate-pulse">
                      {countdown}
                    </div>
                    <div className="text-lg text-muted-foreground mt-4">
                      Get ready...
                    </div>
                  </div>
                </div>
              )}
              
              {/* Recording indicator */}
              {isRecording && (
                <div className="absolute top-2 right-2 flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/90 text-white text-sm font-mono">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  REC
                </div>
              )}
            </div>
          )}

          {/* Elapsed time - only show when not in trim mode */}
          {!showTrimMode && (
            <div className="text-center">
              <div className="text-4xl font-mono font-semibold text-foreground">
                {formatTime(elapsedTime)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {isRecording ? (isPaused ? 'Paused - Release SPACE to continue' : 'Recording...') : audioBlob ? 'Recording complete' : 'Ready'}
              </div>
              {isRecording && !isPaused && countdown === null && (
                <div className="text-xs text-muted-foreground/70 mt-2 flex items-center justify-center gap-1">
                  <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono">SPACE</kbd>
                  <span>Hold to pause</span>
                </div>
              )}
            </div>
          )}

          {/* Controls */}
          <div className="flex justify-center gap-3">
            {isRecording ? (
              <>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleCancel}
                  className="gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
                {isPaused ? (
                  <Button
                    size="lg"
                    onClick={resumeRecording}
                    className="gap-2 bg-green-600 hover:bg-green-700"
                  >
                    <Play className="w-4 h-4" />
                    Resume
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={pauseRecording}
                    className="gap-2"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </Button>
                )}
                <Button
                  size="lg"
                  onClick={handleStop}
                  className="gap-2 bg-primary hover:bg-primary/90"
                >
                  <Square className="w-4 h-4" />
                  Done
                </Button>
              </>
            ) : showTrimMode ? (
              <>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleCancel}
                >
                  Discard
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => {
                    // Reset to countdown and start new recording
                    setShowTrimMode(false);
                    setHasStarted(false);
                    setCountdown(3);
                    cancelRecording();
                  }}
                  className="gap-2"
                >
                  <Mic className="w-4 h-4" />
                  Re-record
                </Button>
                <Button
                  size="lg"
                  onClick={handleSave}
                  className="bg-primary hover:bg-primary/90"
                >
                  Save Recording
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
