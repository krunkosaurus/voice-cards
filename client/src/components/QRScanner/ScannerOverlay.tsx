// QRScanner/ScannerOverlay.tsx - Dark overlay with transparent scanning area

interface ScannerOverlayProps {
  error?: string | null;
}

export function ScannerOverlay({ error }: ScannerOverlayProps) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Dark overlay with center cutout using clip-path */}
      <div
        className="absolute inset-0 bg-black/60"
        style={{
          clipPath: 'polygon(0% 0%, 0% 100%, 25% 100%, 25% 25%, 75% 25%, 75% 75%, 25% 75%, 25% 100%, 100% 100%, 100% 0%)'
        }}
      />

      {/* Corner brackets for scan area indication */}
      <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2">
        {/* Top-left corner */}
        <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl-lg" />
        {/* Top-right corner */}
        <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr-lg" />
        {/* Bottom-left corner */}
        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl-lg" />
        {/* Bottom-right corner */}
        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white rounded-br-lg" />
      </div>

      {/* Error message inside viewfinder */}
      {error && (
        <div className="absolute top-1/2 left-1/4 w-1/2 transform -translate-y-1/2 text-center">
          <p className="text-white text-sm bg-black/50 px-3 py-2 rounded">
            {error}
          </p>
        </div>
      )}
    </div>
  );
}
