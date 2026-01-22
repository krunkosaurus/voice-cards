// components/RoleRequestDialog.tsx - Role request approval dialog
// Design: Editor sees this when viewer requests editor role

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';

interface RoleRequestDialogProps {
  isOpen: boolean;
  onGrant: () => void;
  onDeny: () => void;
}

export function RoleRequestDialog({
  isOpen,
  onGrant,
  onDeny,
}: RoleRequestDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onDeny()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/20 mb-4">
            <UserPlus className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <DialogTitle className="text-center">
            Editor Role Requested
          </DialogTitle>
          <DialogDescription className="text-center">
            Your peer wants to take over editing. If you grant the request,
            you will become a viewer and they will become the editor.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="sm:justify-center gap-2 mt-4">
          <Button
            variant="outline"
            onClick={onDeny}
          >
            Deny
          </Button>
          <Button
            onClick={onGrant}
          >
            Grant Editor Role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
