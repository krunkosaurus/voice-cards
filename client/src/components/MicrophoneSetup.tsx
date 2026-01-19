// components/MicrophoneSetup.tsx
/* Design: Warm Analog Tape Aesthetic - Microphone setup control */

import { useState, useEffect, useRef } from 'react';
import { Mic, Settings, Check } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';

const MIC_STORAGE_KEY = 'voiceCards_selectedMicrophone';

interface MicrophoneSetupProps {
  onDeviceChange?: (deviceId: string) => void;
}

export function MicrophoneSetup({ onDeviceChange }: MicrophoneSetupProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Load devices on mount (without requesting permission)
  useEffect(() => {
    loadDevicesWithoutPermission();
    
    // Listen for device changes (plug/unplug)
    navigator.mediaDevices.addEventListener('devicechange', loadDevicesWithoutPermission);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', loadDevicesWithoutPermission);
      stopTesting();
    };
  }, []);

  const loadDevicesWithoutPermission = async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices.filter(device => device.kind === 'audioinput');
      
      if (audioInputs.length > 0) {
        setDevices(audioInputs);
        
        // Load saved device or use default
        const savedDeviceId = localStorage.getItem(MIC_STORAGE_KEY);
        if (savedDeviceId && audioInputs.some(d => d.deviceId === savedDeviceId)) {
          setSelectedDeviceId(savedDeviceId);
        } else {
          const defaultDevice = audioInputs.find(d => d.deviceId === 'default') || audioInputs[0];
          setSelectedDeviceId(defaultDevice.deviceId);
        }
      }
      
      setError(null);
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
    }
  };

  const loadDevicesWithPermission = async () => {
    try {
      // Request permission to get device labels
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop()); // Stop the stream immediately
      
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices.filter(device => device.kind === 'audioinput');
      setDevices(audioInputs);

      // Load saved device or use default
      const savedDeviceId = localStorage.getItem(MIC_STORAGE_KEY);
      if (savedDeviceId && audioInputs.some(d => d.deviceId === savedDeviceId)) {
        setSelectedDeviceId(savedDeviceId);
      } else if (audioInputs.length > 0) {
        const defaultDevice = audioInputs.find(d => d.deviceId === 'default') || audioInputs[0];
        setSelectedDeviceId(defaultDevice.deviceId);
      }
      
      setError(null);
    } catch (err) {
      console.error('Failed to load audio devices:', err);
      setError('Microphone permission denied');
    }
  };

  const handleDeviceSelect = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    localStorage.setItem(MIC_STORAGE_KEY, deviceId);
    onDeviceChange?.(deviceId);
    
    // Restart test if currently testing
    if (isTestingMic) {
      stopTesting();
      setTimeout(() => startTesting(deviceId), 100);
    }
  };

  const startTesting = async (deviceId?: string) => {
    try {
      // Load devices with permission if not already loaded
      if (devices.length === 0 || !devices[0].label) {
        await loadDevicesWithPermission();
      }
      
      const targetDeviceId = deviceId || selectedDeviceId;
      
      // Get audio stream from selected device
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: targetDeviceId ? { exact: targetDeviceId } : undefined }
      });
      
      streamRef.current = stream;
      
      // Set up audio analysis
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      setIsTestingMic(true);
      setError(null);
      
      // Start monitoring audio level
      monitorAudioLevel();
    } catch (err) {
      console.error('Failed to start microphone test:', err);
      setError('Failed to access microphone');
      setIsTestingMic(false);
    }
  };

  const monitorAudioLevel = () => {
    if (!analyserRef.current) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    const timeDataArray = new Uint8Array(analyserRef.current.fftSize);
    
    const updateLevel = () => {
      if (!analyserRef.current) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      analyserRef.current.getByteTimeDomainData(timeDataArray);
      
      // Calculate RMS (Root Mean Square) level from time domain data for accurate amplitude
      let sum = 0;
      for (let i = 0; i < timeDataArray.length; i++) {
        const normalized = (timeDataArray[i] - 128) / 128; // Normalize to -1 to 1
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / timeDataArray.length);
      
      // Convert RMS to dBFS (decibels Full Scale)
      // dBFS = 20 * log10(rms), where 0 dBFS is maximum (digital clipping)
      // Add small epsilon to avoid log(0) = -Infinity
      const dbfs = rms > 0.0001 ? 20 * Math.log10(rms) : -60;
      
      // Track peak level
      setPeakLevel(prev => Math.max(prev, dbfs));

      setAudioLevel(dbfs);
      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };
    
    updateLevel();
  };

  const stopTesting = () => {
    setIsTestingMic(false);
    setAudioLevel(0);
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    analyserRef.current = null;
    setIsTestingMic(false);
    setAudioLevel(0);
    setPeakLevel(0);
  };

  const toggleTest = () => {
    if (isTestingMic) {
      stopTesting();
    } else {
      startTesting();
    }
  };

  const selectedDevice = devices.find(d => d.deviceId === selectedDeviceId);
  
  // On mobile, device labels are often empty until permission is granted
  // Show a friendly default name instead of empty string
  const getDeviceDisplayName = (device: MediaDeviceInfo | undefined) => {
    if (!device) return 'Setup mic';
    if (device.label && device.label.trim()) return device.label;
    // Fallback for unlabeled devices (common on mobile)
    return 'Default Microphone';
  };
  
  const displayName = getDeviceDisplayName(selectedDevice);

  // Detect if we're on mobile - use proper mobile detection
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const isMobileLikely = isMobile && devices.length === 1;
  const hasMultipleDevices = !isMobile && devices.length > 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {/* Show dropdown only if multiple devices or labeled devices exist */}
        {hasMultipleDevices && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Settings className="w-4 h-4" />
                <span className="max-w-[200px] truncate">{displayName}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[300px]">
              <div className="px-2 py-1.5 text-sm font-semibold">Select Microphone</div>
              <DropdownMenuSeparator />
              {devices.map((device, index) => {
                // Generate friendly label for unlabeled devices
                const label = device.label && device.label.trim() 
                  ? device.label 
                  : `Microphone ${index + 1}`;
                
                return (
                  <DropdownMenuItem
                    key={device.deviceId}
                    onClick={() => handleDeviceSelect(device.deviceId)}
                    className="flex items-center justify-between"
                  >
                    <span className="truncate">{label}</span>
                    {device.deviceId === selectedDeviceId && (
                      <Check className="w-4 h-4 ml-2 flex-shrink-0" />
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button
          variant={isTestingMic ? "default" : "outline"}
          size="sm"
          onClick={toggleTest}
          disabled={devices.length === 0}
          className="gap-2"
        >
          <Mic className="w-4 h-4" />
          {isMobileLikely ? (isTestingMic ? 'Stop Test' : 'Test Microphone') : (isTestingMic ? 'Stop Test' : 'Test')}
        </Button>

        {error && (
          <span className="text-xs text-destructive">{error}</span>
        )}
      </div>

      {isTestingMic && (
        <div className="flex flex-col gap-2 px-3 py-2 bg-muted/50 rounded-md">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden relative">
              {/* Optimal zone overlay (-18 to -6 dBFS) */}
              <div
                className="absolute top-0 bottom-0 bg-green-500/20"
                style={{
                  left: `${((18) / 60) * 100}%`,  // -18 dBFS position
                  width: `${((18 - 6) / 60) * 100}%`  // -18 to -6 dBFS range
                }}
              />
              {/* Current level bar */}
              <div
                className="h-full bg-green-500 transition-all duration-75"
                style={{ width: `${Math.max(0, (audioLevel + 60) / 60 * 100)}%` }}  // Map -60 to 0 dBFS → 0 to 100%
              />
              {/* Peak marker */}
              {peakLevel > -60 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-blue-500"
                  style={{ left: `${Math.max(0, (peakLevel + 60) / 60 * 100)}%` }}
                />
              )}
            </div>
            <div className="flex flex-col items-end min-w-[50px]">
              <span className="text-xs text-muted-foreground font-mono">{audioLevel.toFixed(1)} dB</span>
              <span className="text-[10px] text-blue-500 font-mono">↑{peakLevel.toFixed(1)} dB</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
