// components/ConnectionDialog.tsx - Multi-step SDP exchange dialog
// Design: Step-by-step UI for P2P connection code exchange

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Check, Loader2, Camera, Keyboard } from 'lucide-react';
import { toast } from 'sonner';
import type { ConnectionState } from '@/types/sync';
import { QRCodeDisplay } from '@/components/QRCodeDisplay';
import { QRScanner } from '@/components/QRScanner/QRScanner';
import { useCameraAvailability } from '@/hooks/useCameraAvailability';

type DialogStep = 'choose' | 'create-offer' | 'enter-offer' | 'show-answer' | 'enter-answer' | 'connecting' | 'connected';

interface ConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ConnectionState;
  offerCode: string | null;
  answerCode: string | null;
  error: string | null;
  onCreateOffer: () => Promise<void>;
  onAcceptOffer: (code: string) => Promise<void>;
  onAcceptAnswer: (code: string) => Promise<void>;
  onDisconnect: () => void;
}

export function ConnectionDialog({
  open,
  onOpenChange,
  state,
  offerCode,
  answerCode,
  error,
  onCreateOffer,
  onAcceptOffer,
  onAcceptAnswer,
  onDisconnect,
}: ConnectionDialogProps) {
  const [step, setStep] = useState<DialogStep>('choose');
  const [inputCode, setInputCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [scanMode, setScanMode] = useState(false);
  const hasCamera = useCameraAvailability();

  // Reset state when dialog opens (not on every state change)
  useEffect(() => {
    if (open && state === 'disconnected') {
      setStep('choose');
      setInputCode('');
      setCopied(false);
      setScanMode(false);
    } else if (open && state === 'connected') {
      setStep('connected');
    }
  }, [open]);

  // Update step based on connection state
  useEffect(() => {
    if (state === 'connected') {
      setStep('connected');
      setIsLoading(false);
    } else if (state === 'connecting') {
      // Don't transition away from 'show-answer' - responder needs to share the code
      // The connection will complete automatically once the initiator applies the answer
      if (step !== 'show-answer') {
        setStep('connecting');
      }
    }
  }, [state, step]);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Code copied to clipboard', { duration: 3000 });
    setTimeout(() => setCopied(false), 3000);
  };

  const handleStartConnection = async () => {
    setIsLoading(true);
    await onCreateOffer();
    setIsLoading(false);
    setStep('create-offer');
  };

  const handleJoinConnection = () => {
    setStep('enter-offer');
  };

  const handleSubmitOffer = async (codeOverride?: string) => {
    const code = codeOverride || inputCode.trim();
    if (!code) return;
    setIsLoading(true);
    await onAcceptOffer(code);
    setIsLoading(false);
    if (!error) {
      setStep('show-answer');
      setInputCode('');
      setScanMode(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!inputCode.trim()) return;
    setIsLoading(true);
    await onAcceptAnswer(inputCode.trim());
    setIsLoading(false);
    // Will transition to 'connecting' then 'connected' via state
  };

  const handleDisconnect = () => {
    onDisconnect();
    setStep('choose');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Step: Choose role */}
        {step === 'choose' && (
          <>
            <DialogHeader>
              <DialogTitle>Connect to Peer</DialogTitle>
              <DialogDescription>
                Connect with another device to sync your project in real-time.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-4">
              <Button onClick={handleStartConnection} disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Start Connection
              </Button>
              <Button variant="outline" onClick={handleJoinConnection}>
                Join with Code
              </Button>
            </div>
            <DialogDescription className="text-xs text-center">
              One person starts the connection, the other joins with the code.
            </DialogDescription>
          </>
        )}

        {/* Step: Show offer code */}
        {step === 'create-offer' && (
          <>
            <DialogHeader>
              <DialogTitle>Share Your Code</DialogTitle>
              <DialogDescription>
                Have your peer scan this QR code, or copy the text code below.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 flex flex-col items-center gap-4">
              {/* QR code is primary */}
              {offerCode && (
                <div className="p-4 bg-white rounded-lg">
                  <QRCodeDisplay code={offerCode} size={256} />
                </div>
              )}

              {/* Text code fallback with copy button */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => offerCode && copyToClipboard(offerCode)}
                >
                  {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                  {copied ? 'Copied!' : 'Copy text code'}
                </Button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('enter-answer')}>
                I have their code
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step: Enter offer code */}
        {step === 'enter-offer' && (
          <>
            <DialogHeader>
              <DialogTitle>
                {scanMode ? 'Scan QR Code' : 'Enter Connection Code'}
              </DialogTitle>
              <DialogDescription>
                {scanMode
                  ? 'Point your camera at the QR code'
                  : 'Scan the QR code or paste the text code'}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3">
              {scanMode ? (
                // Scanner view
                <div className="relative h-64 overflow-hidden rounded-lg">
                  <QRScanner
                    active={scanMode}
                    onScan={(code) => {
                      setScanMode(false);
                      handleSubmitOffer(code);
                    }}
                    onError={() => {
                      // Camera error - fall back to paste mode
                      setScanMode(false);
                    }}
                  />
                </div>
              ) : (
                // Text input view
                <>
                  <Textarea
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    placeholder="Paste connection code here..."
                    className="font-mono text-xs h-24 resize-none break-all overflow-hidden"
                  />
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button
                    className="w-full"
                    onClick={() => handleSubmitOffer()}
                    disabled={!inputCode.trim() || isLoading}
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Submit Code
                  </Button>
                </>
              )}

              {/* Mode toggle - only show scan option if camera available */}
              {hasCamera !== null && (
                <div className="flex justify-center pt-2">
                  {hasCamera && !scanMode && (
                    <Button variant="ghost" size="sm" onClick={() => setScanMode(true)}>
                      <Camera className="w-4 h-4 mr-2" />
                      Scan QR instead
                    </Button>
                  )}
                  {scanMode && (
                    <Button variant="ghost" size="sm" onClick={() => setScanMode(false)}>
                      <Keyboard className="w-4 h-4 mr-2" />
                      Paste text instead
                    </Button>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setScanMode(false); setStep('choose'); }}>
                Back
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step: Show answer code */}
        {step === 'show-answer' && (
          <>
            <DialogHeader>
              <DialogTitle>Send Your Code Back</DialogTitle>
              <DialogDescription>
                Have your peer scan this QR code, or copy the text code below.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 flex flex-col items-center gap-4">
              {/* QR code is primary */}
              {answerCode && (
                <div className="p-4 bg-white rounded-lg">
                  <QRCodeDisplay code={answerCode} size={256} />
                </div>
              )}

              {/* Text code fallback with copy button */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => answerCode && copyToClipboard(answerCode)}
                >
                  {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                  {copied ? 'Copied!' : 'Copy text code'}
                </Button>
              </div>
            </div>
            <DialogDescription className="text-xs text-center">
              Connection will establish automatically once your peer enters this code.
            </DialogDescription>
          </>
        )}

        {/* Step: Enter answer code (initiator) */}
        {step === 'enter-answer' && (
          <>
            <DialogHeader>
              <DialogTitle>
                {scanMode ? 'Scan Response QR' : 'Enter Response Code'}
              </DialogTitle>
              <DialogDescription>
                {scanMode
                  ? 'Point your camera at your peer\'s QR code'
                  : 'Scan their QR code or paste the text code'}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3">
              {scanMode ? (
                // Scanner view
                <div className="relative h-64 overflow-hidden rounded-lg">
                  <QRScanner
                    active={scanMode}
                    onScan={(code) => {
                      setScanMode(false);
                      setInputCode(code);
                      // Auto-submit the answer
                      setIsLoading(true);
                      onAcceptAnswer(code).finally(() => setIsLoading(false));
                    }}
                    onError={() => {
                      setScanMode(false);
                    }}
                  />
                </div>
              ) : (
                // Text input view
                <>
                  <Textarea
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    placeholder="Paste response code here..."
                    className="font-mono text-xs h-24 resize-none break-all overflow-hidden"
                  />
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button
                    className="w-full"
                    onClick={handleSubmitAnswer}
                    disabled={!inputCode.trim() || isLoading}
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Connect
                  </Button>
                </>
              )}

              {/* Mode toggle - only show scan option if camera available */}
              {hasCamera !== null && (
                <div className="flex justify-center pt-2">
                  {hasCamera && !scanMode && (
                    <Button variant="ghost" size="sm" onClick={() => setScanMode(true)}>
                      <Camera className="w-4 h-4 mr-2" />
                      Scan QR instead
                    </Button>
                  )}
                  {scanMode && (
                    <Button variant="ghost" size="sm" onClick={() => setScanMode(false)}>
                      <Keyboard className="w-4 h-4 mr-2" />
                      Paste text instead
                    </Button>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setScanMode(false); setStep('create-offer'); }}>
                Back
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step: Connecting */}
        {step === 'connecting' && (
          <>
            <DialogHeader>
              <DialogTitle>Connecting...</DialogTitle>
            </DialogHeader>
            <div className="py-8 flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Establishing peer connection...
              </p>
            </div>
          </>
        )}

        {/* Step: Connected */}
        {step === 'connected' && (
          <>
            <DialogHeader>
              <DialogTitle>Connected!</DialogTitle>
              <DialogDescription>
                You are now connected to your peer.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 flex justify-center">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <Check className="w-8 h-8 text-green-500" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button variant="destructive" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
