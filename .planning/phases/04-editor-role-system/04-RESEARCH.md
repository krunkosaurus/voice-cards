# Phase 4: Editor Role System - Research

**Researched:** 2026-01-22
**Domain:** P2P role-based access control, React UI permissions, WebRTC message protocol
**Confidence:** HIGH

## Summary

Phase 4 implements a single-editor role system where only one user can edit at a time, with the ability to transfer editing rights between peers. This builds on the existing `UserRole` type and `isEditor` determination already implemented in SyncContext.

The codebase already has:
- `UserRole = 'editor' | 'viewer'` type defined in SyncContext
- Initial role assignment based on offer/answer creation (offer creator = editor)
- `syncState.role` tracked and used by `useSyncedActions` to determine broadcast behavior
- Header already receives `isEditor` prop but doesn't display role to user

What's needed:
- Role protocol messages for request/grant/deny/transfer
- Role indicator UI showing current role
- Request editor role button for viewers
- Approval dialog for editors
- UI enforcement: disable/prevent editing when viewer
- Editing pause during role transfer window

**Primary recommendation:** Extend the existing sync protocol with 4 new message types (role_request, role_grant, role_deny, role_transfer_complete). Use a simple disabled prop pattern on editing components controlled by a new `canEdit` computed value from SyncContext.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.x | Component framework | Already in use |
| TypeScript | 5.x | Type safety | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sonner | latest | Toast notifications | Already in use - for role request/grant notifications |
| lucide-react | latest | Icons | Already in use - for role indicator icons |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom disabled logic | react-role HOC library | Overkill - we have single role check, not complex RBAC |
| Simple boolean flags | Zustand/Redux for role state | Already using React Context, adding state library is unnecessary |

**Installation:**
```bash
# No new dependencies required
```

## Architecture Patterns

### Recommended Project Structure
```
client/src/
├── types/
│   └── sync.ts              # Add role message types (RoleRequestMessage, etc.)
├── contexts/
│   └── SyncContext.tsx      # Add role transfer state, handlers, canEdit computed
├── services/
│   └── webrtc/
│       └── syncProtocol.ts  # Add role message creators
├── components/
│   ├── RoleBadge.tsx        # NEW: Role indicator component
│   ├── RoleRequestDialog.tsx # NEW: Editor's approval dialog
│   ├── Header.tsx           # Integrate RoleBadge
│   ├── Card.tsx             # Add disabled prop based on canEdit
│   ├── CardList.tsx         # Disable drag when viewer
│   └── RecordingPanel.tsx   # Disable recording when viewer
└── hooks/
    └── useSyncedActions.ts  # Already checks role - no changes needed
```

### Pattern 1: Protocol Message Extension
**What:** Add new message types to existing sync protocol for role negotiation
**When to use:** Any time application-level state needs to be coordinated between peers
**Example:**
```typescript
// types/sync.ts - Add to existing message types
export interface RoleRequestMessage extends ControlMessage {
  type: 'role_request';
  reason?: string; // Optional: "I need to make edits"
}

export interface RoleGrantMessage extends ControlMessage {
  type: 'role_grant';
}

export interface RoleDenyMessage extends ControlMessage {
  type: 'role_deny';
  reason?: string; // Optional: "Still editing"
}

// Sent by old editor after granting, confirms transfer complete
export interface RoleTransferCompleteMessage extends ControlMessage {
  type: 'role_transfer_complete';
}
```

### Pattern 2: Computed `canEdit` Value
**What:** Derive editing permission from role and transfer state
**When to use:** Any UI that needs to know if editing is allowed
**Example:**
```typescript
// In SyncContext - computed value
const canEdit = useMemo(() => {
  // Not connected = can edit (local only mode)
  if (connectionState !== 'connected') return true;
  // During role transfer = nobody edits
  if (roleTransferInProgress) return false;
  // Only editor can edit
  return syncState.role === 'editor';
}, [connectionState, roleTransferInProgress, syncState.role]);
```

### Pattern 3: Disabled Prop Pattern for UI Enforcement
**What:** Pass `canEdit` down to components, use to disable controls
**When to use:** Any editing control that should be blocked for viewers
**Example:**
```typescript
// In component - disable pattern (keep UI, disable interaction)
<Button
  onClick={onRecord}
  disabled={!canEdit}
  title={canEdit ? "Record" : "Request editor role to record"}
>
  <Mic className="w-5 h-5" />
</Button>

// For drag handles - hide entirely
{canEdit && (
  <div {...dragListeners} className="cursor-grab">
    <GripVertical />
  </div>
)}
```

### Pattern 4: Role Transfer State Machine
**What:** Track role transfer request lifecycle
**When to use:** Coordinating the async role request/grant/deny flow
**Example:**
```typescript
type RoleTransferState =
  | { status: 'idle' }
  | { status: 'pending_request' }      // Viewer: waiting for editor response
  | { status: 'pending_approval', requesterId: string }  // Editor: has pending request
  | { status: 'transferring' }          // Brief pause during handoff
  | { status: 'denied', reason?: string };

// State transitions:
// idle -> pending_request (viewer sends request)
// idle -> pending_approval (editor receives request)
// pending_approval -> transferring (editor grants)
// pending_approval -> idle (editor denies)
// pending_request -> transferring (viewer receives grant)
// pending_request -> denied (viewer receives deny)
// transferring -> idle (transfer complete, roles swapped)
```

### Anti-Patterns to Avoid
- **Checking role in every component individually:** Use centralized `canEdit` from context
- **Using only visual cues (hiding) without actual disabling:** Users can still trigger actions via keyboard
- **Not pausing edits during transfer:** Can cause race conditions where old editor's last edit conflicts with new editor
- **Trusting frontend-only enforcement:** While acceptable for this P2P app, the pattern should prevent actions, not just hide UI

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Role permission checks | Multiple inline checks | Single `canEdit` computed value | Consistent behavior, single source of truth |
| Disabled button styling | Custom disabled styles | Existing Button disabled prop | shadcn/ui handles opacity, cursor, focus |
| Toast notifications | Custom notification system | sonner (already in use) | Consistent UX, already integrated |
| Message ID generation | Custom UUID | nanoid (already in connection.ts) | Already used in sendControl |

**Key insight:** The codebase already has all the infrastructure (message protocol, state management, UI components). This phase is about extending existing patterns, not building new systems.

## Common Pitfalls

### Pitfall 1: Race Condition During Role Transfer
**What goes wrong:** Old editor sends an edit while new editor starts editing
**Why it happens:** Brief window between grant and transfer_complete where both might think they can edit
**How to avoid:**
- Set `roleTransferInProgress = true` immediately when grant/request is received
- Both parties wait until transfer_complete message before resuming
- Only the NEW editor sends transfer_complete after confirming role swap
**Warning signs:** Edits appearing twice, edits being lost, conflict logs

### Pitfall 2: Viewer Can Still Trigger Actions Via Keyboard
**What goes wrong:** Viewer uses keyboard shortcuts to edit (Ctrl+Z, Enter on title, etc.)
**Why it happens:** Only visual elements disabled, not keyboard handlers
**How to avoid:**
- Check `canEdit` in keyboard shortcut handlers (useKeyboardShortcuts)
- Check `canEdit` in any onKeyDown handlers
- Prevent default in handlers when `!canEdit`
**Warning signs:** Viewer can undo/redo, viewer can save title edits

### Pitfall 3: Pending Request Lost on Disconnect
**What goes wrong:** Viewer requests role, connection drops, request state stuck
**Why it happens:** Role transfer state not cleaned up on disconnect
**How to avoid:**
- Reset roleTransferState to 'idle' when connectionState changes to 'disconnected'
- Add useEffect cleanup in SyncContext
**Warning signs:** UI shows "Requesting..." after reconnect, buttons stuck disabled

### Pitfall 4: Drag-Drop Still Works for Viewer
**What goes wrong:** Viewer can still drag cards to reorder
**Why it happens:** dnd-kit drag listeners not disabled based on canEdit
**How to avoid:**
- Pass `disabled={!canEdit}` to DragOverlay
- Conditionally render drag handle: `{canEdit && <GripVertical {...dragListeners} />}`
- Or set `activationConstraint` to impossible when !canEdit
**Warning signs:** Viewer can drag cards, reorder events sent (but blocked by useSyncedActions)

### Pitfall 5: Role Indicator Not Visible When Disconnected
**What goes wrong:** User doesn't know they're in local-only mode
**Why it happens:** Role badge only shows when connected
**How to avoid:**
- Show role badge in all states: "Offline", "Editor", "Viewer"
- Or combine with SyncIndicator to show "Offline (you can edit)" vs "Connected (Editor)"
**Warning signs:** User confusion about why recording works when "not connected"

## Code Examples

Verified patterns from the existing codebase:

### Existing Role Detection (from Home.tsx)
```typescript
// Current role detection - offer creator = editor
useEffect(() => {
  const service = webrtc.getConnectionService();
  if (service && webrtc.state === 'connected') {
    setConnection(service);
    // Determine role: if we created the offer, we're the editor
    const role = webrtc.offerCode ? 'editor' : 'viewer';
    setUserRole(role);
  }
}, [webrtc.state, webrtc.offerCode, webrtc.getConnectionService, setConnection, setUserRole]);
```

### Existing Sync Message Pattern (from syncProtocol.ts)
```typescript
// Follow same pattern for role messages
export function createRoleRequest(reason?: string): MessageWithoutMeta<RoleRequestMessage> {
  return {
    type: 'role_request',
    reason,
  };
}

export function createRoleGrant(): MessageWithoutMeta<RoleGrantMessage> {
  return {
    type: 'role_grant',
  };
}
```

### Existing Message Handler Pattern (from SyncContext.tsx)
```typescript
// In handleSyncMessage switch statement, add:
case 'role_request':
  handleRoleRequest(msg);
  break;
case 'role_grant':
  handleRoleGrant();
  break;
case 'role_deny':
  handleRoleDeny(msg.reason);
  break;
case 'role_transfer_complete':
  handleRoleTransferComplete();
  break;
```

### Disabled Button Pattern (from existing Card.tsx)
```typescript
// Current pattern for disabled buttons
<Button
  variant="ghost"
  size="icon"
  className="shrink-0 hover:bg-muted h-8 w-8"
  onClick={(e) => {
    e.stopPropagation();
    onDuplicate();
  }}
  disabled={!canEdit}  // ADD: disable when viewer
  title={canEdit ? "Duplicate" : "View only - request editor role to duplicate"}
>
  <Copy className="w-4 h-4" />
</Button>
```

### Role Badge Component Pattern
```typescript
// Follow SyncIndicator.tsx pattern
interface RoleBadgeProps {
  role: UserRole | null;
  connectionState: ConnectionState;
  onRequestRole?: () => void;
}

export function RoleBadge({ role, connectionState, onRequestRole }: RoleBadgeProps) {
  if (connectionState !== 'connected') {
    return null; // Or show "Local" badge
  }

  if (role === 'editor') {
    return (
      <Badge className="bg-blue-500/10 text-blue-600">
        <Pencil className="w-3.5 h-3.5 mr-1" />
        Editing
      </Badge>
    );
  }

  return (
    <Badge
      className="bg-gray-500/10 text-gray-600 cursor-pointer"
      onClick={onRequestRole}
    >
      <Eye className="w-3.5 h-3.5 mr-1" />
      Viewing
    </Badge>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual isEditor checks | Computed canEdit value | N/A (new) | Single source of truth |
| Hide UI for viewers | Disable UI with explanation | React best practice | Better UX, maintains layout |

**Deprecated/outdated:**
- None applicable - this is new functionality

## Open Questions

Things that couldn't be fully resolved:

1. **Should there be a timeout on role requests?**
   - What we know: Editor might not respond (AFK, tab backgrounded)
   - What's unclear: How long to wait before auto-canceling request
   - Recommendation: Add optional 30-second timeout with "Request timed out" notification

2. **What happens if editor disconnects while viewer has pending request?**
   - What we know: Connection drop resets role state
   - What's unclear: Should viewer automatically become editor on reconnect?
   - Recommendation: Follow original role detection (offer creator = editor) on reconnect

3. **Should recording be completely blocked or just warn viewers?**
   - What we know: Current pattern disables the button
   - What's unclear: Would a warning with "Record anyway (won't sync)" be better UX?
   - Recommendation: Block completely - allowing local-only edits would confuse sync state

## Sources

### Primary (HIGH confidence)
- Existing codebase files:
  - `/client/src/contexts/SyncContext.tsx` - Current role implementation
  - `/client/src/types/sync.ts` - Message type patterns
  - `/client/src/services/webrtc/syncProtocol.ts` - Message creator patterns
  - `/client/src/components/SyncIndicator.tsx` - Badge UI pattern
  - `/client/src/hooks/useSyncedActions.ts` - Role check pattern

### Secondary (MEDIUM confidence)
- [React role-based access control patterns](https://medium.com/@ignatovich.dm/implementing-role-based-access-control-rbac-in-node-js-and-react-c3d89af6f945)
- [React disabled button best practices](https://www.dhiwise.com/post/the-ultimate-guide-to-react-button-disabled-best-practices)
- [Conditional attributes in React](https://blog.bitsrc.io/4-methods-to-add-conditional-attributes-to-react-components-b1ad195f449b)

### Tertiary (LOW confidence)
- [WebRTC signaling concepts](https://www.webrtc-experiment.com/docs/WebRTC-Signaling-Concepts.html) - General background on P2P message passing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, extends existing patterns
- Architecture: HIGH - Direct extension of existing sync protocol
- Pitfalls: HIGH - Derived from understanding of existing codebase

**Research date:** 2026-01-22
**Valid until:** 2026-02-22 (30 days - patterns are stable)
