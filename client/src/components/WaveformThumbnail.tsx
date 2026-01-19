// components/WaveformThumbnail.tsx - Waveform thumbnail for cards
/* Design: Warm Analog Tape Aesthetic - Mini waveform visualization */

import { useEffect, useRef, useState } from 'react';
import { getAudio } from '@/services/db';
import { generateWaveformData, renderWaveformToCanvas } from '@/services/waveformGenerator';

interface WaveformThumbnailProps {
  cardId: string;
  waveformData?: number[]; // Optional pre-computed waveform data
  color?: string;
  className?: string;
  playbackProgress?: number; // 0 to 1, representing playback position
  onSeek?: (progress: number) => void; // Callback when user clicks to seek
}

export function WaveformThumbnail({ cardId, waveformData: propWaveformData, color = '#D97642', className = '', playbackProgress = 0, onSeek }: WaveformThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Larger height on mobile (96px) vs desktop (80px)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const baseHeight = isMobile ? 96 : 80;
  const [canvasSize, setCanvasSize] = useState({ width: 400, height: baseHeight });

  const [waveformData, setWaveformData] = useState<number[]>([]);

  // Dynamically resize canvas based on container width and viewport
  useEffect(() => {
    if (!containerRef.current) return;

    const updateSize = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.offsetWidth;
      const dpr = window.devicePixelRatio || 1;
      // Larger height on mobile (96px) vs desktop (80px)
      const height = window.innerWidth < 640 ? 96 : 80;
      setCanvasSize({
        width: Math.floor(width * dpr),
        height: Math.floor(height * dpr)
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });

    // Also listen for window resize to catch viewport changes
    window.addEventListener('resize', updateSize);
    resizeObserver.observe(containerRef.current);
    updateSize(); // Initial size calculation

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // Load waveform data
  useEffect(() => {
    // If waveformData is provided as prop, use it directly
    if (propWaveformData && propWaveformData.length > 0) {
      setWaveformData(propWaveformData);
      setIsLoading(false);
      return;
    }

    // Otherwise, generate from audio blob
    let mounted = true;

    async function loadWaveform() {
      try {
        const audioBlob = await getAudio(cardId);
        if (!audioBlob || !mounted) return;

        const data = await generateWaveformData(audioBlob, 50);
        
        if (mounted) {
          setWaveformData(data);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to generate waveform:', error);
        setIsLoading(false);
      }
    }

    loadWaveform();

    return () => {
      mounted = false;
    };
  }, [cardId, propWaveformData]);

  // Render waveform with playback indicator
  useEffect(() => {
    if (!canvasRef.current || waveformData.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Render base waveform
    renderWaveformToCanvas(canvas, waveformData, color);

    // Dim played portion if there's progress
    if (playbackProgress > 0 && playbackProgress <= 1) {
      const x = canvas.width * playbackProgress;
      
      // Draw semi-transparent overlay on played portion
      ctx.fillStyle = 'rgba(250, 248, 243, 0.6)'; // 60% opacity cream overlay (makes waveform 40% visible)
      ctx.fillRect(0, 0, x, canvas.height);
      
      // Draw playback indicator line (sharp, no blur)
      const dpr = window.devicePixelRatio || 1;
      ctx.strokeStyle = '#1F2937'; // Dark gray
      ctx.lineWidth = 2 * dpr;
      
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
  }, [waveformData, color, playbackProgress, canvasSize]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const progress = x / rect.width;
    
    // Clamp between 0 and 1
    const clampedProgress = Math.max(0, Math.min(1, progress));
    onSeek(clampedProgress);
  };

  return (
    <div ref={containerRef} className="w-full">
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        onClick={handleClick}
        className={`w-full h-24 sm:h-20 rounded ${className} ${onSeek ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
        style={{ 
          backgroundColor: 'transparent',
          opacity: isLoading ? 0.3 : 1,
          transition: 'opacity 0.3s',
          display: 'block'
        }}
      />
    </div>
  );
}
