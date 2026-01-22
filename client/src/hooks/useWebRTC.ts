// hooks/useWebRTC.ts - React hook wrapping WebRTCConnectionService
// Design: Manages WebRTC connection state with React-friendly interface

import { useState, useCallback, useRef, useEffect } from 'react';
import { WebRTCConnectionService } from '@/services/webrtc/connection';
import type { ConnectionState, ControlMessage } from '@/types/sync';

interface UseWebRTCReturn {
  state: ConnectionState;
  offerCode: string | null;
  answerCode: string | null;
  error: string | null;

  createOffer: () => Promise<void>;
  acceptOffer: (code: string) => Promise<void>;
  acceptAnswer: (code: string) => Promise<void>;
  disconnect: () => void;

  sendControl: (msg: Omit<ControlMessage, 'timestamp' | 'id'>) => boolean;
  sendBinary: (data: ArrayBuffer) => boolean;

  // Callbacks for message handling (set by consumer)
  setOnControlMessage: (handler: (msg: ControlMessage) => void) => void;
  setOnBinaryMessage: (handler: (data: ArrayBuffer) => void) => void;

  // Expose service for SyncContext integration
  getConnectionService: () => WebRTCConnectionService | null;
}

export function useWebRTC(): UseWebRTCReturn {
  const serviceRef = useRef<WebRTCConnectionService | null>(null);
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [offerCode, setOfferCode] = useState<string | null>(null);
  const [answerCode, setAnswerCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lazily initialize service
  const getService = useCallback(() => {
    if (!serviceRef.current) {
      serviceRef.current = new WebRTCConnectionService();
      serviceRef.current.setCallbacks({
        onStateChange: (newState) => {
          setState(newState);
          if (newState === 'error') {
            setError('Connection failed');
          }
        },
      });
    }
    return serviceRef.current;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      serviceRef.current?.disconnect();
    };
  }, []);

  const createOffer = useCallback(async () => {
    setError(null);
    setOfferCode(null);
    const service = getService();
    const result = await service.createOffer();
    if (result.success) {
      setOfferCode(result.data);
    } else {
      setError(result.error);
    }
  }, [getService]);

  const acceptOffer = useCallback(async (code: string) => {
    setError(null);
    setAnswerCode(null);
    const service = getService();
    const result = await service.acceptOffer(code);
    if (result.success) {
      setAnswerCode(result.data);
    } else {
      setError(result.error);
    }
  }, [getService]);

  const acceptAnswer = useCallback(async (code: string) => {
    setError(null);
    const service = getService();
    const result = await service.acceptAnswer(code);
    if (!result.success) {
      setError(result.error);
    }
  }, [getService]);

  const disconnect = useCallback(() => {
    serviceRef.current?.disconnect();
    setOfferCode(null);
    setAnswerCode(null);
    setError(null);
  }, []);

  const sendControl = useCallback((msg: Omit<ControlMessage, 'timestamp' | 'id'>) => {
    return serviceRef.current?.sendControl(msg) ?? false;
  }, []);

  const sendBinary = useCallback((data: ArrayBuffer) => {
    return serviceRef.current?.sendBinary(data) ?? false;
  }, []);

  const setOnControlMessage = useCallback((handler: (msg: ControlMessage) => void) => {
    getService().setCallbacks({ onControlMessage: handler });
  }, [getService]);

  const setOnBinaryMessage = useCallback((handler: (data: ArrayBuffer) => void) => {
    getService().setCallbacks({ onBinaryMessage: handler });
  }, [getService]);

  // Expose service instance for SyncContext integration
  const getConnectionService = useCallback(() => {
    return serviceRef.current;
  }, []);

  return {
    state,
    offerCode,
    answerCode,
    error,
    createOffer,
    acceptOffer,
    acceptAnswer,
    disconnect,
    sendControl,
    sendBinary,
    setOnControlMessage,
    setOnBinaryMessage,
    getConnectionService,
  };
}
