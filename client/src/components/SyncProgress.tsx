// components/SyncProgress.tsx - Shows progress bar during sync transfer
// Design: Fixed position bottom-right, auto-hides when not syncing

import { useSync } from '@/contexts/SyncContext';
import { Progress } from '@/components/ui/progress';
import { RefreshCw } from 'lucide-react';

export function SyncProgress() {
  const { syncState } = useSync();
  const { progress, isSyncing } = syncState;

  // Only show during active transfer
  if (!isSyncing && progress.phase !== 'transferring') {
    return null;
  }

  // Calculate percentage
  const percentage =
    progress.totalBytesTotal > 0
      ? Math.round(
          (progress.totalBytesTransferred / progress.totalBytesTotal) * 100
        )
      : 0;

  // Format bytes for display
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 bg-background border border-border rounded-lg shadow-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <RefreshCw className="w-4 h-4 text-primary animate-spin" />
        <span className="text-sm font-medium">
          Syncing project...
        </span>
      </div>

      <Progress value={percentage} className="mb-2" />

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          Card {progress.currentCardIndex + 1} of {progress.totalCards}
        </span>
        <span>{percentage}%</span>
      </div>

      <div className="text-xs text-muted-foreground mt-1">
        {formatBytes(progress.totalBytesTransferred)} /{' '}
        {formatBytes(progress.totalBytesTotal)}
      </div>
    </div>
  );
}
