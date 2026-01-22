# Phase 6: QR Code Support - Research

**Researched:** 2026-01-23
**Domain:** QR code generation and scanning for WebRTC SDP exchange
**Confidence:** HIGH

## Summary

This phase adds QR code support as an alternative to manual text copy-paste for WebRTC SDP exchange on mobile devices. The research identified two distinct problems: (1) generating QR codes from encoded SDP strings, and (2) scanning QR codes using device cameras.

For QR generation, **qrcode.react** (v4.2.0) is the standard choice - actively maintained, React 19 compatible, and provides both SVG and Canvas rendering. For scanning, **html5-qrcode** (v2.3.8) is the best option despite being in maintenance mode - it provides a low-level API (`Html5Qrcode` class) that enables custom UI implementation matching the decision for cutout overlay style.

The encoded SDP size (~800-1500 characters from lz-string compression) fits comfortably within QR code capacity limits (up to 4,296 alphanumeric characters). The codebase already has key infrastructure: `useIsMobile` hook for responsive design, `Drawer` component (vaul) for mobile modals, and `Dialog` for desktop.

**Primary recommendation:** Use qrcode.react for generation with black/white SVG output at 180-200px, and html5-qrcode's Html5Qrcode class for scanning with custom overlay UI.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| qrcode.react | ^4.2.0 | QR code generation | Most popular React QR library; React 19 compatible; SVG + Canvas options; TypeScript built-in |
| html5-qrcode | ^2.3.8 | QR code scanning | Cross-platform; low-level API for custom UI; works on mobile Safari/Chrome; TypeScript built-in |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vaul | ^1.1.2 (installed) | Mobile drawer | Bottom sheet for mobile scanner UI |
| @radix-ui/react-dialog | (installed) | Desktop modal | Scanner dialog on desktop |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| qrcode.react | react-qr-code | Higher downloads but less features; react-qr-code is simpler but qrcode.react has better image embedding if needed later |
| html5-qrcode | @zxing/browser + react-zxing | ZXing is in limited maintenance; html5-qrcode has better docs and React examples |
| html5-qrcode | react-qr-scanner | Last updated 3+ years ago; html5-qrcode is more feature-complete |

**Installation:**
```bash
pnpm add qrcode.react html5-qrcode
```

## Architecture Patterns

### Recommended Project Structure
```
client/src/
├── components/
│   ├── ConnectionDialog.tsx       # Existing - will be enhanced
│   ├── QRCodeDisplay.tsx          # New - QR generation component
│   └── QRScanner/
│       ├── QRScanner.tsx          # Main scanner with custom overlay
│       ├── ScannerOverlay.tsx     # Cutout overlay UI
│       └── useCameraAvailability.ts # Camera detection hook
├── hooks/
│   └── useMobile.tsx              # Existing - for responsive switching
```

### Pattern 1: QR Code Generation Component
**What:** Stateless component rendering QR from encoded SDP
**When to use:** Displaying connection codes
**Example:**
```typescript
// Source: qrcode.react documentation
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
      level="M"        // Medium error correction - good balance
      bgColor="#FFFFFF"
      fgColor="#000000"
      marginSize={2}   // Small quiet zone
    />
  );
}
```

### Pattern 2: Custom Scanner with Html5Qrcode (Low-Level API)
**What:** Camera scanner with custom overlay, not default UI
**When to use:** Need cutout overlay style per CONTEXT.md decisions
**Example:**
```typescript
// Source: html5-qrcode docs - Html5Qrcode class API
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { useEffect, useRef, useCallback } from 'react';

interface UseScannerOptions {
  onScan: (decodedText: string) => void;
  onError?: (error: string) => void;
}

export function useQRScanner(containerId: string, { onScan, onError }: UseScannerOptions) {
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const start = useCallback(async () => {
    if (scannerRef.current) return;

    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: 'environment' }, // Back camera
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          onScan(decodedText);
        },
        () => {} // Ignore continuous errors during scanning
      );
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Camera error');
    }
  }, [containerId, onScan, onError]);

  const stop = useCallback(async () => {
    if (scannerRef.current?.getState() === Html5QrcodeScannerState.SCANNING) {
      await scannerRef.current.stop();
    }
    scannerRef.current = null;
  }, []);

  useEffect(() => {
    return () => { stop(); };
  }, [stop]);

  return { start, stop };
}
```

### Pattern 3: Camera Availability Detection
**What:** Check camera exists before showing scan option
**When to use:** Hide scan button when no camera available
**Example:**
```typescript
// Source: MDN MediaDevices.enumerateDevices()
export async function hasCameraAvailable(): Promise<boolean> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return false;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(device => device.kind === 'videoinput');
  } catch {
    return false;
  }
}

// React hook version
export function useCameraAvailability() {
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);

  useEffect(() => {
    hasCameraAvailable().then(setHasCamera);
  }, []);

  return hasCamera;
}
```

### Pattern 4: Responsive Modal (Dialog on Desktop, Drawer on Mobile)
**What:** Use existing useIsMobile hook for adaptive UI
**When to use:** Scanner modal that works well on both platforms
**Example:**
```typescript
// Source: shadcn/ui documentation pattern
import { useIsMobile } from '@/hooks/useMobile';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Drawer, DrawerContent } from '@/components/ui/drawer';

interface ResponsiveScannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function ResponsiveScannerModal({ open, onOpenChange, children }: ResponsiveScannerModalProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[85vh]">
          {children}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {children}
      </DialogContent>
    </Dialog>
  );
}
```

### Anti-Patterns to Avoid
- **Using Html5QrcodeScanner for custom UI:** The Scanner class has built-in UI that cannot be styled to match cutout overlay design. Use Html5Qrcode class instead.
- **Storing Html5Qrcode in useState:** Causes re-renders and double initialization. Use useRef.
- **Calling stop() during camera initialization:** Scanner may not be in SCANNING state yet. Check state before stopping.
- **Creating config objects inline in components:** Causes re-initialization on every render. Define as constants or useMemo.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| QR generation | Canvas drawing with QR algorithm | qrcode.react | QR encoding is complex; error correction levels, version selection, module sizing all handled |
| QR scanning | MediaStream + manual pattern detection | html5-qrcode | Barcode detection via ZXing is battle-tested; handles camera quirks, permissions, mobile Safari |
| Camera permission check | Direct getUserMedia call | enumerateDevices first | Avoids permission prompt just to check if camera exists |
| Responsive modal | Custom breakpoint detection | useIsMobile hook (exists) | Already in codebase at `client/src/hooks/useMobile.tsx` |

**Key insight:** QR code encoding/decoding involves Reed-Solomon error correction and complex bitstream manipulation. Browser camera APIs have numerous cross-platform quirks (iOS Safari, Android Chrome facingMode differences). Both are solved problems - custom solutions would have inferior reliability.

## Common Pitfalls

### Pitfall 1: React StrictMode Double Initialization
**What goes wrong:** Html5Qrcode gets created twice, causing camera conflicts
**Why it happens:** React 18+ StrictMode calls useEffect twice in development
**How to avoid:** Check scanner state before initialization; store in useRef not useState
**Warning signs:** "Cannot access camera" or black screen after mounting

### Pitfall 2: Scanner Not Stopping Properly
**What goes wrong:** Camera stays active after closing modal, drains battery, blocks other apps
**Why it happens:** stop() not called, or called while scanner still initializing
**How to avoid:** Always call stop() in useEffect cleanup; check Html5QrcodeScannerState before stopping
**Warning signs:** Camera light stays on after closing scanner

### Pitfall 3: iOS Safari Camera Permission
**What goes wrong:** Camera doesn't work on iOS Safari
**Why it happens:** Requires HTTPS; older iOS versions had bugs; facingMode constraints differ
**How to avoid:** Always use HTTPS in production; use facingMode without "exact" constraint for broader compatibility
**Warning signs:** "NotAllowedError" or "NotFoundError" on iOS

### Pitfall 4: QR Code Too Dense for Fast Scanning
**What goes wrong:** QR code takes multiple seconds to scan or fails
**Why it happens:** Too much data + high error correction = dense QR requiring steady camera
**How to avoid:** Use level "M" (medium) not "H" (high); encoded SDP at ~1000 chars should work fine
**Warning signs:** Users report difficulty scanning; works on desktop but fails on phone cameras

### Pitfall 5: Camera Permission Prompt Before Action
**What goes wrong:** User gets permission prompt immediately on page load
**Why it happens:** Calling getCameras() or getUserMedia() triggers permission
**How to avoid:** Use enumerateDevices() which doesn't require permission; only request camera when user clicks scan
**Warning signs:** Permission popup before user takes any action

## Code Examples

Verified patterns from official sources:

### QR Code Generation (Display Offer/Answer)
```typescript
// Source: qrcode.react GitHub README
import { QRCodeSVG } from 'qrcode.react';

// In ConnectionDialog, where offerCode is from encodeSDP()
<div className="flex flex-col items-center gap-4">
  <QRCodeSVG
    value={offerCode}
    size={192}
    level="M"
    bgColor="#FFFFFF"
    fgColor="#000000"
  />
  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(offerCode)}>
    <Copy className="w-4 h-4 mr-2" />
    Copy code
  </Button>
</div>
```

### Scanner Container with Cutout Overlay
```typescript
// Custom overlay - dark edges with transparent center
// Source: Custom implementation per CONTEXT.md requirements
function ScannerOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Dark overlay with center cutout */}
      <div className="absolute inset-0 bg-black/60"
           style={{
             clipPath: 'polygon(0% 0%, 0% 100%, 25% 100%, 25% 25%, 75% 25%, 75% 75%, 25% 75%, 25% 100%, 100% 100%, 100% 0%)'
           }}
      />
      {/* Corner brackets for scan area */}
      <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2 border-2 border-white rounded-lg" />
    </div>
  );
}
```

### Complete Scanner Hook with Cleanup
```typescript
// Source: html5-qrcode React example + best practices
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';

export function useQRScanner(
  containerId: string,
  onSuccess: (code: string) => void
) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const start = useCallback(async () => {
    if (scannerRef.current) {
      // Already initialized
      if (scannerRef.current.getState() === Html5QrcodeScannerState.PAUSED) {
        scannerRef.current.resume();
        setIsScanning(true);
        return;
      }
      return;
    }

    try {
      const scanner = new Html5Qrcode(containerId, { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          onSuccess(decodedText);
        },
        () => {} // Silent error callback for "no QR found" per-frame
      );

      setIsScanning(true);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Camera access failed';
      setError(message);
      setIsScanning(false);
    }
  }, [containerId, onSuccess]);

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

  useEffect(() => {
    return () => { stop(); };
  }, [stop]);

  return { start, stop, isScanning, error };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-qr-reader | html5-qrcode | 2022+ | react-qr-reader abandoned (last update 4+ years); html5-qrcode better maintained |
| QRCodeCanvas default | QRCodeSVG preferred | qrcode.react v4 | SVG more flexible, scales without pixelation |
| getUserMedia for camera check | enumerateDevices() | Always preferred | Doesn't trigger permission prompt |
| includeMargin prop | marginSize prop | qrcode.react v4 | More control over quiet zone size |

**Deprecated/outdated:**
- react-qr-reader: Last updated 4+ years ago, not maintained
- react-qr-scanner: Last updated 3+ years ago
- qrcode.react defaultProps: Removed in v4 for React 19 compatibility

## Open Questions

Things that couldn't be fully resolved:

1. **html5-qrcode maintenance status**
   - What we know: Library is in "maintenance mode" per README; last npm publish 3 years ago
   - What's unclear: Whether critical bugs will be fixed; long-term viability
   - Recommendation: Proceed with html5-qrcode - it's stable and widely used; alternatives are in worse shape. Monitor for issues.

2. **Exact QR code scan speed with ~1000 char encoded SDP**
   - What we know: QR version ~15-20 handles 1000+ chars; scanning speed depends on device camera quality
   - What's unclear: Real-world scan time on various devices
   - Recommendation: Test on real devices during implementation; error correction level M should be sufficient

3. **Scanner behavior during modal close animation**
   - What we know: Stopping scanner during initialization can fail
   - What's unclear: Best UX for rapid open/close actions
   - Recommendation: Consider disabling close button briefly during camera init; or use state machine for scanner lifecycle

## Sources

### Primary (HIGH confidence)
- [qrcode.react GitHub](https://github.com/zpao/qrcode.react) - API, props, version compatibility
- [html5-qrcode docs](https://scanapp.org/html5-qrcode-docs/docs/intro) - Html5Qrcode class API
- [MDN MediaDevices.enumerateDevices()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices) - Camera detection
- [MDN MediaDevices.getUserMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) - Permission handling

### Secondary (MEDIUM confidence)
- [shadcn/ui Drawer docs](https://ui.shadcn.com/docs/components/drawer) - Responsive dialog pattern
- [npm-compare qrcode.react vs react-qr-code](https://npm-compare.com/qr-code-styling,qr.js,qrcode.react,qrious,react-qr-code) - Library comparison
- [html5-qrcode React example](https://github.com/scanapp-org/html5-qrcode-react) - Integration patterns

### Tertiary (LOW confidence)
- WebSearch results for QR code capacity - confirmed with official QR spec reference
- WebSearch for html5-qrcode maintenance status - observed from GitHub activity

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - qrcode.react and html5-qrcode are well-documented, widely used
- Architecture: HIGH - Patterns from official examples and existing codebase patterns
- Pitfalls: MEDIUM - Based on GitHub issues and community reports; some device-specific issues may not be covered

**Research date:** 2026-01-23
**Valid until:** 90 days (libraries are stable; QR spec doesn't change)
