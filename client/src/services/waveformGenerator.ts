// services/waveformGenerator.ts - Generate waveform thumbnail from audio blob

export async function generateWaveformData(
  audioBlob: Blob,
  samples: number = 100
): Promise<number[]> {
  const audioContext = new AudioContext();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const rawData = audioBuffer.getChannelData(0); // Use first channel
  const blockSize = Math.floor(rawData.length / samples);
  const waveformData: number[] = [];

  for (let i = 0; i < samples; i++) {
    const start = blockSize * i;
    let sum = 0;
    
    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(rawData[start + j]);
    }
    
    waveformData.push(sum / blockSize);
  }

  // Normalize to 0-1 range
  const max = Math.max(...waveformData);
  return waveformData.map(v => v / max);
}

export function renderWaveformToCanvas(
  canvas: HTMLCanvasElement,
  waveformData: number[],
  color: string = '#D97642'
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const barWidth = width / waveformData.length;
  const centerY = height / 2;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color;

  waveformData.forEach((value, i) => {
    const barHeight = value * centerY * 0.9; // 90% of half height
    const x = i * barWidth;
    const y = centerY - barHeight / 2;

    ctx.fillRect(x, y, Math.max(barWidth - 1, 1), barHeight);
  });
}
