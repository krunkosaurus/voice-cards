// components/Header.tsx - App header with theme toggle and menu
/* Design: Warm Analog Tape Aesthetic - Warm header with microphone icon */

import { Mic, Sun, Moon, MoreVertical, Download, Upload, Trash2, Search, X, Undo2, Redo2, RefreshCw } from 'lucide-react';
import { SyncIndicator } from './SyncIndicator';
import { RoleBadge } from './RoleBadge';
import type { ConnectionState } from '@/types/sync';
import type { UserRole } from '@/contexts/SyncContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import { useTheme } from '@/contexts/ThemeContext';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onExport: () => void;
  onImport: () => void;
  onClearProject: () => void;
  onExportAudio?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  connectionState: ConnectionState;
  onConnectClick: () => void;
  // Sync props for manual sync
  isEditor?: boolean;
  isSyncing?: boolean;
  onSyncNow?: () => void;
  // Role display props
  role?: UserRole | null;
  roleTransferState?: {
    status: 'idle' | 'pending_request' | 'pending_approval' | 'transferring' | 'denied';
    reason?: string;
  };
  onRequestRole?: () => void;
}

export function Header({ searchQuery, onSearchChange, onExport, onImport, onClearProject, onExportAudio, canUndo, canRedo, onUndo, onRedo, connectionState, onConnectClick, isEditor, isSyncing, onSyncNow, role, roleTransferState, onRequestRole }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border paper-texture">
      <div className="container max-w-3xl py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Logo/Title */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Mic className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-semibold hidden sm:block">Voice Cards</h1>
          </div>

          {/* Search bar */}
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search cards..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => onSearchChange('')}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Role indicator - only show when connected */}
            {role && roleTransferState && (
              <RoleBadge
                role={role}
                connectionState={connectionState}
                roleTransferState={roleTransferState}
                onRequestRole={onRequestRole}
              />
            )}

            {/* Sync indicator */}
            <SyncIndicator state={connectionState} onClick={onConnectClick} />

            {/* Undo/Redo buttons */}
            {onUndo && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onUndo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-5 h-5" />
              </Button>
            )}
            {onRedo && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRedo}
                disabled={!canRedo}
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 className="w-5 h-5" />
              </Button>
            )}

            {/* Theme toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title="Toggle theme"
            >
              {theme === 'light' ? (
                <Moon className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
            </Button>

            {/* Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {/* Sync Now option for editor when connected */}
                {isEditor && connectionState === 'connected' && onSyncNow && (
                  <>
                    <DropdownMenuItem onClick={onSyncNow} disabled={isSyncing}>
                      <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                      {isSyncing ? 'Syncing...' : 'Sync Now'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={onExport}>
                  <Download className="w-4 h-4 mr-2" />
                  Export Project
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onImport}>
                  <Upload className="w-4 h-4 mr-2" />
                  Import Project
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {onExportAudio && (
                  <DropdownMenuItem onClick={onExportAudio}>
                    <Download className="w-4 h-4 mr-2" />
                    Export as Audio
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onClearProject} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}
