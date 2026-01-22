// components/SyncIndicator.tsx - Connection status badge with popover
// Design: Visual indicator for P2P connection state in header

import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Wifi, WifiOff, Loader2, AlertCircle, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ConnectionState } from '@/types/sync';
import { useSync } from '@/contexts/SyncContext';

interface SyncIndicatorProps {
  state: ConnectionState;
  onOfflineClick?: () => void;  // Called when clicking badge while disconnected (no prior connection)
}

function getStateConfig(state: ConnectionState) {
  switch (state) {
    case 'connected':
      return {
        variant: 'default' as const,
        className: 'bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/30',
        icon: <Wifi className="w-3.5 h-3.5" />,
        label: 'Connected',
      };
    case 'reconnecting':
      return {
        variant: 'secondary' as const,
        className: 'bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 border-orange-500/30',
        icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />,
        label: 'Reconnecting...',
      };
    case 'connecting':
    case 'creating_offer':
    case 'awaiting_answer':
    case 'creating_answer':
      return {
        variant: 'secondary' as const,
        className: 'bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20 border-yellow-500/30',
        icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
        label: 'Connecting',
      };
    case 'error':
      return {
        variant: 'destructive' as const,
        className: 'bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-500/30',
        icon: <AlertCircle className="w-3.5 h-3.5" />,
        label: 'Error',
      };
    case 'disconnected':
    default:
      return {
        variant: 'outline' as const,
        className: 'text-muted-foreground hover:bg-muted',
        icon: <WifiOff className="w-3.5 h-3.5" />,
        label: 'Offline',
      };
  }
}

export function SyncIndicator({ state, onOfflineClick }: SyncIndicatorProps) {
  const {
    reconnectionState,
    connectedAt,
    syncState,
    resetReconnectionState,
    gracefulDisconnect,
  } = useSync();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const prevStateRef = useRef<ConnectionState>(state);

  // Format connection duration
  const formatDuration = (startTime: number | null): string => {
    if (!startTime) return '--';
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  // Toast notifications for connection state changes (PRES-02)
  useEffect(() => {
    const prevState = prevStateRef.current;
    prevStateRef.current = state;

    // Don't toast on initial render or same state
    if (prevState === state) return;

    // Connection lost (PRES-02)
    if (prevState === 'connected' && (state === 'disconnected' || state === 'reconnecting')) {
      if (reconnectionState.status === 'peer_disconnected') {
        toast.info('Peer disconnected');
      } else {
        toast.error('Connection lost');
      }
    }

    // Connection established (PRES-01)
    if (state === 'connected' && prevState !== 'connected') {
      toast.success('Connected to peer');
    }
  }, [state, reconnectionState.status]);

  // Additional toast when reconnection fails
  useEffect(() => {
    if (reconnectionState.status === 'failed') {
      toast.error('Connection lost', {
        description: 'Please start a new session to reconnect.',
      });
    }
  }, [reconnectionState.status]);

  const config = getStateConfig(state);

  // Handle disconnect click - use gracefulDisconnect from context
  const handleDisconnect = async () => {
    setPopoverOpen(false);
    await gracefulDisconnect();
  };

  // Handle try again click
  const handleTryAgain = () => {
    setPopoverOpen(false);
    resetReconnectionState();
    // User will need to start new connection via ConnectionDialog
  };

  // Only show popover when connected or had a connection
  const showPopover = state === 'connected' ||
    reconnectionState.status === 'failed' ||
    reconnectionState.status === 'peer_disconnected';

  if (!showPopover) {
    // Simple badge without popover - clicking opens ConnectionDialog when offline
    return (
      <Badge
        variant={config.variant}
        className={`cursor-pointer gap-1.5 ${config.className}`}
        onClick={onOfflineClick}
      >
        {config.icon}
        <span className="hidden sm:inline">{config.label}</span>
      </Badge>
    );
  }

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Badge
          variant={config.variant}
          className={`cursor-pointer gap-1.5 ${config.className}`}
        >
          {config.icon}
          <span className="hidden sm:inline">{config.label}</span>
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="space-y-3">
          {/* Connection info when connected */}
          {state === 'connected' && (
            <>
              <div className="text-sm space-y-1">
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Duration:</span>
                  <span className="font-medium">{formatDuration(connectedAt)}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Role:</span>
                  <span className="font-medium capitalize">{syncState.role || 'Unknown'}</span>
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={handleDisconnect}
              >
                <X className="w-4 h-4 mr-2" />
                Disconnect
              </Button>
            </>
          )}

          {/* Failed reconnection state */}
          {reconnectionState.status === 'failed' && (
            <>
              <div className="text-sm text-center text-muted-foreground">
                Connection lost. Start a new session to reconnect.
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleTryAgain}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Start New Session
              </Button>
            </>
          )}

          {/* Peer disconnected state */}
          {reconnectionState.status === 'peer_disconnected' && (
            <>
              <div className="text-sm text-center text-muted-foreground">
                Peer has disconnected from the session.
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleTryAgain}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Start New Session
              </Button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
