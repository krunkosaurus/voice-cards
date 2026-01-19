// services/exportAudio.ts - Export merged audio file
import type { Card } from '@/types';
import { getAudio } from './db';

/**
 * Merge all card audio files into a single audio blob
 * @param cards - Array of cards to merge
 * @param silenceGap - Gap in seconds between cards (default: 0.5)
 * @returns Merged audio blob
 */
export async function mergeCardAudio(
  cards: Card[],
  silenceGap: number = 0.5
): Promise<Blob> {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  // Load all audio buffers
  const audioBuffers: AudioBuffer[] = [];
  
  for (const card of cards) {
    const audioBlob = await getAudio(card.id);
    if (!audioBlob) continue;
    
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    audioBuffers.push(audioBuffer);
  }
  
  if (audioBuffers.length === 0) {
    throw new Error('No audio to export');
  }
  
  // Calculate total length
  const silenceSamples = Math.floor(silenceGap * audioContext.sampleRate);
  const totalSamples = audioBuffers.reduce(
    (sum, buffer) => sum + buffer.length + silenceSamples,
    -silenceSamples // Remove last silence gap
  );
  
  // Create merged buffer
  const numberOfChannels = Math.max(...audioBuffers.map(b => b.numberOfChannels));
  const mergedBuffer = audioContext.createBuffer(
    numberOfChannels,
    totalSamples,
    audioContext.sampleRate
  );
  
  // Copy audio data
  let offset = 0;
  for (const buffer of audioBuffers) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sourceData = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
      const targetData = mergedBuffer.getChannelData(channel);
      targetData.set(sourceData, offset);
    }
    offset += buffer.length + silenceSamples;
  }
  
  // Convert to WAV blob
  const wavBlob = await audioBufferToWav(mergedBuffer);
  
  // Close audio context
  await audioContext.close();
  
  return wavBlob;
}

/**
 * Convert AudioBuffer to WAV blob
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numberOfChannels * bytesPerSample;
  
  const data = interleave(buffer);
  const dataLength = data.length * bytesPerSample;
  const bufferLength = 44 + dataLength;
  
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);
  
  // Write WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  
  // Write audio data
  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Interleave multiple channels into single array
 */
function interleave(buffer: AudioBuffer): Float32Array {
  const numberOfChannels = buffer.numberOfChannels;
  const length = buffer.length * numberOfChannels;
  const result = new Float32Array(length);
  
  let offset = 0;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      result[offset++] = buffer.getChannelData(channel)[i];
    }
  }
  
  return result;
}

/**
 * Write string to DataView
 */
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Export all cards as a single audio file
 */
export async function exportAsAudio(
  cards: Card[],
  filename: string = 'voice-cards-export.wav',
  silenceGap: number = 0.5
): Promise<void> {
  const audioBlob = await mergeCardAudio(cards, silenceGap);
  
  // Create download link
  const url = URL.createObjectURL(audioBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
