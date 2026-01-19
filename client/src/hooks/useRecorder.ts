// hooks/useRecorder.ts - Audio recording hook
import { useState, useRef, useCallback } from 'react';
import { getAudioDuration, appendAudioBlobs } from '@/services/audioUtils';

export interface RecorderState {
  isRecording: boolean;
  isPaused: boolean;
  elapsedTime: number;
  audioBlob: Blob | null;
  error: string | null;
}

export function useRecorder() {
  const [state, setState] = useState<RecorderState>({
    isRecording: false,
    isPaused: false,
    elapsedTime: 0,
    audioBlob: null,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Prepare recording (request mic access and initialize recorder)
  const prepareRecording = useCallback(async () => {
    try {
      // Get selected device from localStorage
      const savedDeviceId = localStorage.getItem('voiceCards_selectedMicrophone');
      const audioConstraints = savedDeviceId 
        ? { deviceId: { exact: savedDeviceId } }
        : true;
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      streamRef.current = stream;

      // Create audio context and analyser for waveform
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 2048;

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Create media recorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setState(prev => ({ ...prev, audioBlob: blob, isRecording: false }));

        // Clean up
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      return true;
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to prepare recording',
      }));
      return false;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      // If recorder not prepared, prepare it first
      if (!mediaRecorderRef.current) {
        const prepared = await prepareRecording();
        if (!prepared) return;
      }

      // Start the already-prepared recorder
      mediaRecorderRef.current!.start();

      startTimeRef.current = Date.now();
      pausedTimeRef.current = 0;
      timerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000;
        setState(prev => ({ ...prev, elapsedTime: elapsed }));
      }, 100);

      setState(prev => ({
        ...prev,
        isRecording: true,
        isPaused: false,
        elapsedTime: 0,
        error: null,
      }));
    } catch (error) {
      console.error('Failed to start recording:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to access microphone. Please grant permission.',
      }));
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop();
    }
  }, [state.isRecording]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording && !state.isPaused) {
      mediaRecorderRef.current.pause();
      const pauseStartTime = Date.now();
      
      // Stop the timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      setState(prev => ({ ...prev, isPaused: true }));
      
      // Store when pause started
      pausedTimeRef.current = pauseStartTime - startTimeRef.current - pausedTimeRef.current;
    }
  }, [state.isRecording, state.isPaused]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording && state.isPaused) {
      mediaRecorderRef.current.resume();
      
      // Restart the timer, accounting for paused time
      const resumeTime = Date.now();
      startTimeRef.current = resumeTime - pausedTimeRef.current;
      
      timerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        setState(prev => ({ ...prev, elapsedTime: elapsed }));
      }, 100);
      
      setState(prev => ({ ...prev, isPaused: false }));
    }
  }, [state.isRecording, state.isPaused]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    setState({
      isRecording: false,
      isPaused: false,
      elapsedTime: 0,
      audioBlob: null,
      error: null,
    });
  }, []);

  const getAnalyser = useCallback(() => {
    return analyserRef.current;
  }, []);

  return {
    ...state,
    prepareRecording,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    getAnalyser,
  };
}
