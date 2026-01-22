// components/RoleBadge.tsx - Role indicator badge
// Design: Visual indicator for user's editing role in header

import { Badge } from '@/components/ui/badge';
import { Pencil, Eye, Loader2 } from 'lucide-react';
import type { ConnectionState } from '@/types/sync';
import type { UserRole } from '@/contexts/SyncContext';

interface RoleTransferState {
  status: 'idle' | 'pending_request' | 'pending_approval' | 'transferring' | 'denied';
  reason?: string;
}

interface RoleBadgeProps {
  role: UserRole | null;
  connectionState: ConnectionState;
  roleTransferState: RoleTransferState;
  onRequestRole?: () => void;
}

export function RoleBadge({
  role,
  connectionState,
  roleTransferState,
  onRequestRole,
}: RoleBadgeProps) {
  // Don't show badge when not connected
  if (connectionState !== 'connected') {
    return null;
  }

  // Show loading state during role request
  if (roleTransferState.status === 'pending_request') {
    return (
      <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30 gap-1.5">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="hidden sm:inline">Requesting...</span>
      </Badge>
    );
  }

  // Show transferring state
  if (roleTransferState.status === 'transferring') {
    return (
      <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30 gap-1.5">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="hidden sm:inline">Transferring...</span>
      </Badge>
    );
  }

  // Show denied state briefly
  if (roleTransferState.status === 'denied') {
    return (
      <Badge className="bg-red-500/10 text-red-600 border-red-500/30 gap-1.5">
        <Eye className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Denied</span>
      </Badge>
    );
  }

  // Editor badge
  if (role === 'editor') {
    return (
      <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30 gap-1.5">
        <Pencil className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Editing</span>
      </Badge>
    );
  }

  // Viewer badge - clickable to request role
  return (
    <Badge
      className="bg-gray-500/10 text-gray-600 border-gray-500/30 gap-1.5 cursor-pointer hover:bg-gray-500/20 transition-colors"
      onClick={onRequestRole}
      title="Click to request editor role"
    >
      <Eye className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Viewing</span>
    </Badge>
  );
}
