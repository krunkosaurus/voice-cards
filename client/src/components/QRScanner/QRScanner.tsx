// QRScanner/QRScanner.tsx - Main scanner component
import { useEffect, useId } from 'react';
import { useQRScanner } from './useQRScanner';

interface QRScannerProps {
  onScan: (code: string) => void;
  onError?: (error: string) => void;
  active: boolean;
}

export function QRScanner({ onScan, onError, active }: QRScannerProps) {
  const containerId = useId().replace(/:/g, ''); // Remove colons for valid HTML id
  const { start, stop, isScanning, error } = useQRScanner(containerId, {
    onSuccess: onScan,
    onError,
  });

  // Start/stop based on active prop
  useEffect(() => {
    if (active) {
      start();
    } else {
      stop();
    }
  }, [active, start, stop]);

  return (
    <div className="relative w-full h-full bg-black">
      {/* Camera feed container - html5-qrcode renders here with its own UI */}
      <div
        id={containerId}
        className="w-full h-full"
        style={{ minHeight: '300px' }}
      />

      {/* Camera permission denied / not available */}
      {!isScanning && error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <p className="text-white text-center px-4">{error}</p>
        </div>
      )}

      {/* Hint text */}
      {isScanning && (
        <div className="absolute bottom-4 left-0 right-0 text-center">
          <p className="text-white text-sm bg-black/50 inline-block px-3 py-1 rounded">
            Point camera at QR code
          </p>
        </div>
      )}
    </div>
  );
}
