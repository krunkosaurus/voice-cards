// services/audioTrimmer.ts - Audio trimming and splitting utilities

export async function trimAudio(
  audioBlob: Blob,
  startTime: number,
  endTime: number
): Promise<Blob> {
  const audioContext = new AudioContext();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const sampleRate = audioBuffer.sampleRate;
  const numberOfChannels = audioBuffer.numberOfChannels;
  
  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.floor(endTime * sampleRate);
  const trimmedLength = endSample - startSample;

  // Create new buffer with trimmed length
  const trimmedBuffer = audioContext.createBuffer(
    numberOfChannels,
    trimmedLength,
    sampleRate
  );

  // Copy trimmed data
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const originalData = audioBuffer.getChannelData(channel);
    const trimmedData = trimmedBuffer.getChannelData(channel);
    
    for (let i = 0; i < trimmedLength; i++) {
      trimmedData[i] = originalData[startSample + i];
    }
  }

  // Convert to blob
  return audioBufferToBlob(trimmedBuffer);
}

export async function splitAudio(
  audioBlob: Blob,
  splitTime: number
): Promise<[Blob, Blob]> {
  const audioContext = new AudioContext();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const duration = audioBuffer.duration;
  
  const firstPart = await trimAudio(audioBlob, 0, splitTime);
  const secondPart = await trimAudio(audioBlob, splitTime, duration);

  return [firstPart, secondPart];
}

export async function addSilenceToStart(audioBlob: Blob, silenceDuration: number = 1.0): Promise<Blob> {
  const audioContext = new AudioContext();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const sampleRate = audioBuffer.sampleRate;
  const numberOfChannels = audioBuffer.numberOfChannels;
  const silenceSamples = Math.floor(silenceDuration * sampleRate);
  const totalLength = silenceSamples + audioBuffer.length;

  // Create new buffer with silence + original audio
  const newBuffer = audioContext.createBuffer(
    numberOfChannels,
    totalLength,
    sampleRate
  );

  // Copy original audio data after silence
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const originalData = audioBuffer.getChannelData(channel);
    const newData = newBuffer.getChannelData(channel);
    
    // First silenceSamples are already 0 (default)
    // Copy original audio after silence
    for (let i = 0; i < audioBuffer.length; i++) {
      newData[silenceSamples + i] = originalData[i];
    }
  }

  return audioBufferToBlob(newBuffer);
}

export async function removeSilenceFromStart(audioBlob: Blob, removeSeconds: number = 1.0): Promise<Blob> {
  const audioContext = new AudioContext();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const sampleRate = audioBuffer.sampleRate;
  const numberOfChannels = audioBuffer.numberOfChannels;
  const removeSamples = Math.floor(removeSeconds * sampleRate);
  
  // Ensure we don't remove more than the audio duration
  if (removeSamples >= audioBuffer.length) {
    throw new Error('Cannot remove more audio than exists in the clip');
  }

  const newLength = audioBuffer.length - removeSamples;

  // Create new buffer without the first removeSeconds
  const newBuffer = audioContext.createBuffer(
    numberOfChannels,
    newLength,
    sampleRate
  );

  // Copy audio data starting after removeSamples
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const originalData = audioBuffer.getChannelData(channel);
    const newData = newBuffer.getChannelData(channel);
    
    for (let i = 0; i < newLength; i++) {
      newData[i] = originalData[removeSamples + i];
    }
  }

  return audioBufferToBlob(newBuffer);
}

export async function removeSilenceFromEnd(audioBlob: Blob, removeSeconds: number = 1.0): Promise<Blob> {
  const audioContext = new AudioContext();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const sampleRate = audioBuffer.sampleRate;
  const numberOfChannels = audioBuffer.numberOfChannels;
  const removeSamples = Math.floor(removeSeconds * sampleRate);
  
  // Ensure we don't remove more than the audio duration
  if (removeSamples >= audioBuffer.length) {
    throw new Error('Cannot remove more audio than exists in the clip');
  }

  const newLength = audioBuffer.length - removeSamples;

  // Create new buffer without the last removeSeconds
  const newBuffer = audioContext.createBuffer(
    numberOfChannels,
    newLength,
    sampleRate
  );

  // Copy audio data up to newLength
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const originalData = audioBuffer.getChannelData(channel);
    const newData = newBuffer.getChannelData(channel);
    
    for (let i = 0; i < newLength; i++) {
      newData[i] = originalData[i];
    }
  }

  return audioBufferToBlob(newBuffer);
}

export async function addSilenceToEnd(audioBlob: Blob, silenceDuration: number = 1.0): Promise<Blob> {
  const audioContext = new AudioContext();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const sampleRate = audioBuffer.sampleRate;
  const numberOfChannels = audioBuffer.numberOfChannels;
  const silenceSamples = Math.floor(silenceDuration * sampleRate);
  const totalLength = audioBuffer.length + silenceSamples;

  // Create new buffer with original audio + silence
  const newBuffer = audioContext.createBuffer(
    numberOfChannels,
    totalLength,
    sampleRate
  );

  // Copy original audio data, silence at end is already 0
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const originalData = audioBuffer.getChannelData(channel);
    const newData = newBuffer.getChannelData(channel);
    
    // Copy original audio
    for (let i = 0; i < audioBuffer.length; i++) {
      newData[i] = originalData[i];
    }
    // Remaining samples are already 0 (silence)
  }

  return audioBufferToBlob(newBuffer);
}

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
