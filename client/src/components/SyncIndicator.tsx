// components/SyncIndicator.tsx - Connection status badge
// Design: Visual indicator for P2P connection state in header

import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, Loader2, AlertCircle } from 'lucide-react';
import type { ConnectionState } from '@/types/sync';

interface SyncIndicatorProps {
  state: ConnectionState;
  onClick?: () => void;
}

export function SyncIndicator({ state, onClick }: SyncIndicatorProps) {
  const config = getStateConfig(state);

  return (
    <Badge
      variant={config.variant}
      className={`cursor-pointer gap-1.5 ${config.className}`}
      onClick={onClick}
    >
      {config.icon}
      <span className="hidden sm:inline">{config.label}</span>
    </Badge>
  );
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
