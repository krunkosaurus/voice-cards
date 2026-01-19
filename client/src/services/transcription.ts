// services/transcription.ts - Transcription API service
import type { TranscriptSegment } from '@/types';

const API_BASE = 'https://voice.sogni.ai';

export interface TranscriptionResponse {
  success: boolean;
  timestamps?: TranscriptSegment[];
  transcript?: string;
  filename?: string;
  error?: string;
}

export async function transcribeAudio(audioBlob: Blob): Promise<TranscriptSegment[]> {
  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.webm');
  formData.append('timestamps', 'true');

  const response = await fetch(`${API_BASE}/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Transcription failed: ${response.status} ${response.statusText}`);
  }

  const data: TranscriptionResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Transcription failed');
  }

  if (!data.timestamps || data.timestamps.length === 0) {
    throw new Error('No transcript segments returned');
  }

  return data.timestamps;
}
