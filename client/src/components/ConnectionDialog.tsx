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
import { Copy, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ConnectionState } from '@/types/sync';

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

  // Reset state when dialog opens (not on every state change)
  useEffect(() => {
    if (open && state === 'disconnected') {
      setStep('choose');
      setInputCode('');
      setCopied(false);
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
    toast.success('Code copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
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

  const handleSubmitOffer = async () => {
    if (!inputCode.trim()) return;
    setIsLoading(true);
    await onAcceptOffer(inputCode.trim());
    setIsLoading(false);
    if (!error) {
      setStep('show-answer');
      setInputCode('');
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
                Send this code to your peer. They will send back their code.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <Textarea
                value={offerCode || ''}
                readOnly
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                className="font-mono text-xs h-24 resize-none break-all overflow-hidden"
              />
              <Button
                className="w-full"
                onClick={() => offerCode && copyToClipboard(offerCode)}
              >
                {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? 'Copied!' : 'Copy Code'}
              </Button>
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
              <DialogTitle>Enter Connection Code</DialogTitle>
              <DialogDescription>
                Paste the code you received from your peer.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <Textarea
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="Paste connection code here..."
                className="font-mono text-xs h-24 resize-none break-all overflow-hidden"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                className="w-full"
                onClick={handleSubmitOffer}
                disabled={!inputCode.trim() || isLoading}
              >
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Submit Code
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('choose')}>
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
                Send this code back to complete the connection.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <Textarea
                value={answerCode || ''}
                readOnly
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                className="font-mono text-xs h-24 resize-none break-all overflow-hidden"
              />
              <Button
                className="w-full"
                onClick={() => answerCode && copyToClipboard(answerCode)}
              >
                {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? 'Copied!' : 'Copy Code'}
              </Button>
            </div>
            <DialogDescription className="text-xs">
              Connection will establish automatically once your peer enters this code.
            </DialogDescription>
          </>
        )}

        {/* Step: Enter answer code (initiator) */}
        {step === 'enter-answer' && (
          <>
            <DialogHeader>
              <DialogTitle>Enter Response Code</DialogTitle>
              <DialogDescription>
                Paste the code your peer sent back.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3">
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('create-offer')}>
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
