// services/audioUtils.ts - Audio processing utilities

// Get duration of audio blob
// Uses Web Audio API for reliable duration on iOS Safari
export async function getAudioDuration(blob: Blob): Promise<number> {
  try {
    // Primary method: Use Web Audio API (more reliable on iOS)
    const audioContext = new AudioContext();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    await audioContext.close();
    return audioBuffer.duration;
  } catch (error) {
    console.warn('Web Audio API failed, falling back to HTMLAudioElement:', error);
    
    // Fallback: Use HTMLAudioElement with multiple event listeners
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      const blobUrl = URL.createObjectURL(blob);
      let resolved = false;
      
      const cleanup = () => {
        URL.revokeObjectURL(blobUrl);
      };
      
      const resolveDuration = () => {
        if (!resolved && audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
          resolved = true;
          cleanup();
          resolve(audio.duration);
        }
      };
      
      // Try multiple events as iOS Safari is unreliable
      audio.addEventListener('loadedmetadata', resolveDuration);
      audio.addEventListener('durationchange', resolveDuration);
      audio.addEventListener('canplay', resolveDuration);
      
      audio.addEventListener('error', (e) => {
        cleanup();
        reject(e);
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (!resolved) {
          cleanup();
          reject(new Error('Timeout getting audio duration'));
        }
      }, 5000);
      
      audio.src = blobUrl;
      audio.load();
    });
  }
}

// Decode audio blob to AudioBuffer
export async function decodeAudioBlob(
  audioContext: AudioContext,
  blob: Blob
): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  return audioContext.decodeAudioData(arrayBuffer);
}

// Merge multiple audio blobs into one
export async function mergeAudioBlobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) {
    throw new Error('No audio blobs to merge');
  }

  if (blobs.length === 1) {
    return blobs[0];
  }

  // Create audio context
  const audioContext = new AudioContext();

  // Decode all blobs
  const buffers = await Promise.all(
    blobs.map(blob => decodeAudioBlob(audioContext, blob))
  );

  // Calculate total length
  const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
  const numberOfChannels = Math.max(...buffers.map(b => b.numberOfChannels));
  const sampleRate = buffers[0].sampleRate;

  // Create offline context for rendering
  const offlineContext = new OfflineAudioContext(
    numberOfChannels,
    totalLength,
    sampleRate
  );

  // Schedule all buffers sequentially
  let offset = 0;
  buffers.forEach(buffer => {
    const source = offlineContext.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineContext.destination);
    source.start(offset / sampleRate);
    offset += buffer.length;
  });

  // Render the merged audio
  const mergedBuffer = await offlineContext.startRendering();

  // Convert to blob
  return audioBufferToBlob(mergedBuffer);
}

// Convert AudioBuffer to Blob
async function audioBufferToBlob(buffer: AudioBuffer): Promise<Blob> {
  const numberOfChannels = buffer.numberOfChannels;
  const length = buffer.length * numberOfChannels * 2;
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);

  // Write WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length, true);

  // Write audio data
  const channels = [];
  for (let i = 0; i < numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// Append audio blobs
export async function appendAudioBlobs(
  existingBlob: Blob,
  newBlob: Blob
): Promise<Blob> {
  return mergeAudioBlobs([existingBlob, newBlob]);
}
