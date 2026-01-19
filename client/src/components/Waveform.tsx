// components/Waveform.tsx - Real-time waveform visualization
/* Design: Warm Analog Tape Aesthetic - Amber waveform with warm glow */

import { useEffect, useRef } from 'react';

interface WaveformProps {
  analyser: AnalyserNode | null;
  isRecording: boolean;
  className?: string;
}

export function Waveform({ analyser, isRecording, className = '' }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!analyser || !isRecording || !canvasRef.current) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isRecording) return;

      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteTimeDomainData(dataArray);

      // Clear canvas with warm background
      ctx.fillStyle = 'rgba(42, 37, 32, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw waveform with amber glow
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#D97642'; // Burnt orange
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#D97642';

      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, isRecording]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={100}
      className={`w-full h-24 rounded-lg ${className}`}
      style={{ backgroundColor: '#2D2520' }}
    />
  );
}
