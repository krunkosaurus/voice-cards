// QRScanner/useQRScanner.ts - Scanner hook with Html5Qrcode class
import { useRef, useState, useCallback, useEffect } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';

interface UseQRScannerOptions {
  onSuccess: (code: string) => void;
  onError?: (error: string) => void;
}

export function useQRScanner(containerId: string, { onSuccess, onError }: UseQRScannerOptions) {
  // Use useRef for scanner instance to avoid re-renders and StrictMode issues
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    // Already have a scanner
    if (scannerRef.current) {
      const state = scannerRef.current.getState();
      if (state === Html5QrcodeScannerState.PAUSED) {
        scannerRef.current.resume();
        setIsScanning(true);
        return;
      }
      if (state === Html5QrcodeScannerState.SCANNING) {
        return; // Already scanning
      }
    }

    try {
      const scanner = new Html5Qrcode(containerId, { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' }, // Back camera, no 'exact' for iOS compatibility
        {
          fps: 15,
          // No qrbox = scan full frame - better for dense QR codes like SDP
          aspectRatio: 1.0,
        },
        (decodedText) => {
          console.log('[QRScanner] Decoded:', decodedText.substring(0, 50) + '...');
          onSuccess(decodedText);
        },
        () => {} // Silent callback for "no QR found" per-frame errors
      );
      console.log('[QRScanner] Started successfully');

      setIsScanning(true);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Camera access failed';
      setError(message);
      setIsScanning(false);
      onError?.(message);
    }
  }, [containerId, onSuccess, onError]);

  const stop = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;

    try {
      const state = scanner.getState();
      if (state === Html5QrcodeScannerState.SCANNING ||
          state === Html5QrcodeScannerState.PAUSED) {
        await scanner.stop();
      }
      await scanner.clear();
    } catch (err) {
      console.warn('Scanner cleanup error:', err);
    } finally {
      scannerRef.current = null;
      setIsScanning(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stop(); };
  }, [stop]);

  return { start, stop, isScanning, error };
}
