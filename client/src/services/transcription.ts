// services/transcription.ts - Transcription API service
import type { TranscriptSegment } from '@/types';

const API_BASE = 'https://voice.sogni.ai';

// Optional API key authentication - only used if VITE_VOICE_AUTH_ENABLED=true
const AUTH_ENABLED = import.meta.env.VITE_VOICE_AUTH_ENABLED === 'true';
const AUTH_API_KEY = import.meta.env.VITE_VOICE_AUTH_API_KEY || '';

// Debug: check if env vars are loaded
console.log('[Transcription] Auth enabled:', AUTH_ENABLED, 'API key present:', !!AUTH_API_KEY);

function getAuthHeaders(): HeadersInit {
  if (AUTH_ENABLED && AUTH_API_KEY) {
    return { 'X-API-Key': AUTH_API_KEY };
  }
  return {};
}

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
    headers: getAuthHeaders(),
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
