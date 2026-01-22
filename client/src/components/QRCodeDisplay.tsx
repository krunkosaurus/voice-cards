// components/QRCodeDisplay.tsx - QR code generation from encoded SDP
import { QRCodeSVG } from 'qrcode.react';

interface QRCodeDisplayProps {
  code: string;
  size?: number;
}

export function QRCodeDisplay({ code, size = 192 }: QRCodeDisplayProps) {
  return (
    <QRCodeSVG
      value={code}
      size={size}
      level="M" // Medium error correction - good balance for ~1000 char codes
      bgColor="#FFFFFF"
      fgColor="#000000"
      marginSize={2} // Small quiet zone
    />
  );
}
