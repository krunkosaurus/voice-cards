// components/OverwriteConfirmDialog.tsx - Warns before overwriting local project
// Design: Shows when pendingRequest is set, warning tone when local cards exist

import { useSync } from '@/contexts/SyncContext';
import { useProject } from '@/contexts/ProjectContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';

export function OverwriteConfirmDialog() {
  const { syncState, acceptSync, rejectSync } = useSync();
  const { state } = useProject();

  const { pendingRequest } = syncState;
  const hasLocalCards = state.cards.length > 0;

  // Only show when there's a pending sync request
  if (!pendingRequest) {
    return null;
  }

  const handleAccept = () => {
    acceptSync();
  };

  const handleDecline = () => {
    rejectSync('User declined sync');
  };

  // Format bytes for display
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <AlertDialog open={!!pendingRequest}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {hasLocalCards && (
              <AlertTriangle className="w-5 h-5 text-destructive" />
            )}
            Incoming Project Sync
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {hasLocalCards ? (
                <p className="text-destructive font-medium">
                  Warning: You have {state.cards.length} card
                  {state.cards.length !== 1 ? 's' : ''} locally. Accepting this
                  sync will replace your current project.
                </p>
              ) : (
                <p>
                  The editor wants to share their project with you.
                </p>
              )}

              <div className="bg-muted p-3 rounded-md text-sm">
                <p className="font-medium mb-1">Incoming project:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>{pendingRequest.cards.length} cards</li>
                  <li>{formatBytes(pendingRequest.totalAudioBytes)} of audio</li>
                </ul>
              </div>

              <p className="text-sm text-muted-foreground">
                You will receive a read-only copy of the editor's project.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleDecline}>Decline</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleAccept}
            className={hasLocalCards ? 'bg-destructive hover:bg-destructive/90' : ''}
          >
            {hasLocalCards ? 'Replace My Project' : 'Accept'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
