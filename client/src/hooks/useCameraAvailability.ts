// hooks/useCameraAvailability.ts - Check camera exists before showing scan option
import { useState, useEffect } from 'react';

/**
 * Check if a camera device exists without triggering permission prompt.
 * Uses enumerateDevices() which doesn't require permission.
 */
export async function hasCameraAvailable(): Promise<boolean> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return false;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((device) => device.kind === 'videoinput');
  } catch {
    return false;
  }
}

/**
 * React hook for camera availability.
 * Returns null while checking, boolean once known.
 */
export function useCameraAvailability() {
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);

  useEffect(() => {
    hasCameraAvailable().then(setHasCamera);
  }, []);

  return hasCamera;
}
