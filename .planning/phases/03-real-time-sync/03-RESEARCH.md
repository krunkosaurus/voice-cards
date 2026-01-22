# Phase 3: Real-Time Sync - Research

**Researched:** 2026-01-22
**Domain:** Operation-based sync protocol, deduplication, real-time state broadcast
**Confidence:** HIGH

## Summary

Phase 3 implements real-time synchronization where editor actions propagate to the viewer within 1 second. Building on Phase 1's WebRTC dual-channel infrastructure and Phase 2's initial sync protocol, this phase adds operation-based broadcasting for incremental changes.

The research confirms:
1. **Operation-based messaging** is the correct pattern - send discrete operations (create, update, delete, reorder) rather than full state
2. **Origin-based deduplication** prevents infinite loops - track whether operations are local or remote
3. **Audio changes require binary transfer** - reuse AudioTransferService from Phase 2 for re-record/trim operations
4. **Wrapper pattern for ProjectContext** - intercept context actions to broadcast and apply remote operations

**Primary recommendation:** Implement a sync operation layer that wraps ProjectContext actions. Local actions broadcast operations to the peer; incoming operations apply to state with a "remote" flag to prevent re-broadcast. Audio changes trigger chunked binary transfer using existing infrastructure.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native WebRTC APIs | Browser built-in | RTCDataChannel for P2P messaging | Already established in Phase 1 |
| React Context | React built-in | State management and action dispatch | Already established in ProjectContext |
| idb | Already installed | IndexedDB for persistence | Already established |

### Supporting (No New Dependencies)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| AudioTransferService | Phase 2 | Chunked audio transfer | Re-record/trim operations |
| syncProtocol.ts | Phase 2 | Message encoding/decoding | Operation messages |
| WebRTCConnectionService | Phase 1 | sendControl(), sendBinary() | All sync operations |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Operation-based sync | Full-state sync on each change | Operation-based is more efficient; full-state wastes bandwidth |
| Origin flag | CRDT library (Yjs) | Yjs is overkill for single-editor model; origin flag is simpler |
| Context wrapper | Redux middleware | Context wrapper is simpler for this use case |

**Installation:**
```bash
# No new dependencies needed - using existing infrastructure
```

## Architecture Patterns

### Recommended Project Structure
```
client/src/
├── services/
│   ├── webrtc/
│   │   ├── connection.ts           # [Phase 1] WebRTCConnectionService
│   │   ├── sdpCodec.ts             # [Phase 1] SDP encoding
│   │   └── syncProtocol.ts         # [Phase 2+3] EXTEND: Add operation message types
│   └── sync/
│       ├── AudioTransferService.ts  # [Phase 2] Reuse for audio changes
│       ├── projectSync.ts           # [Phase 2] Initial sync helpers
│       └── operationSync.ts         # [Phase 3] NEW: Operation broadcast/apply logic
├── contexts/
│   └── SyncContext.tsx              # [Phase 2+3] EXTEND: Add operation handlers
└── types/
    └── sync.ts                      # [Phase 2+3] EXTEND: Add operation types
```

### Pattern 1: Operation-Based Sync Messages

**What:** Send discrete operations rather than full state snapshots for incremental changes.

**When to use:** Any real-time collaborative application with incremental updates.

**Message Types:**
```typescript
// New message types for Phase 3
interface CardCreateOperation extends ControlMessage {
  type: 'op_card_create';
  card: Card;
  audioSize: number;  // 0 if no audio yet, triggers binary transfer if > 0
}

interface CardUpdateOperation extends ControlMessage {
  type: 'op_card_update';
  cardId: string;
  changes: Partial<Pick<Card, 'label' | 'notes' | 'tags' | 'color'>>;
}

interface CardDeleteOperation extends ControlMessage {
  type: 'op_card_delete';
  cardId: string;
}

interface CardReorderOperation extends ControlMessage {
  type: 'op_card_reorder';
  cardOrder: Array<{ id: string; order: number }>;  // Just IDs and new order values
}

interface CardAudioChangeOperation extends ControlMessage {
  type: 'op_card_audio_change';
  cardId: string;
  duration: number;
  waveformData?: number[];
  transcript?: TranscriptSegment[];
  audioSize: number;  // Triggers binary transfer
}

type SyncOperation =
  | CardCreateOperation
  | CardUpdateOperation
  | CardDeleteOperation
  | CardReorderOperation
  | CardAudioChangeOperation;
```

### Pattern 2: Origin-Based Deduplication

**What:** Track whether operations are local or remote to prevent infinite broadcast loops.

**When to use:** Any bidirectional sync where both peers can modify state.

**Why needed:** Without origin tracking:
1. User A makes change
2. User A broadcasts to User B
3. User B applies change
4. User B's apply triggers broadcast back to User A
5. User A applies again (duplicate!)
6. Infinite loop...

**Implementation:**
```typescript
// Source: Yjs transaction.origin pattern adapted for simpler use case

// Flag to track if we're applying a remote operation
let isApplyingRemoteOperation = false;

// Wrap ProjectContext actions to add broadcast
function useSyncedProject() {
  const { addCard, updateCard, deleteCard, reorderCards } = useProject();
  const { connectionState } = useSync();
  const connectionRef = useSyncConnection();

  // Wrapped addCard that broadcasts
  const syncedAddCard = useCallback((card: Card, audioBlob?: Blob) => {
    // Apply locally
    addCard(card);

    // Broadcast only if:
    // 1. Not applying a remote operation
    // 2. Connected to peer
    // 3. User is editor role
    if (!isApplyingRemoteOperation && connectionRef.current?.isReady()) {
      const operation: CardCreateOperation = {
        type: 'op_card_create',
        card,
        audioSize: audioBlob?.size ?? 0,
      };
      connectionRef.current.sendControl(operation);

      // If audio exists, send it
      if (audioBlob && audioBlob.size > 0) {
        sendAudioForCard(card.id, audioBlob);
      }
    }
  }, [addCard, connectionRef]);

  // Handle incoming operations
  const applyRemoteOperation = useCallback((op: SyncOperation) => {
    isApplyingRemoteOperation = true;
    try {
      switch (op.type) {
        case 'op_card_create':
          addCard(op.card);  // Won't re-broadcast due to flag
          break;
        case 'op_card_update':
          // ... apply update
          break;
        // ... other cases
      }
    } finally {
      isApplyingRemoteOperation = false;
    }
  }, [addCard, updateCard, deleteCard, reorderCards]);

  return {
    addCard: syncedAddCard,
    // ... other wrapped methods
    applyRemoteOperation,
  };
}
```

### Pattern 3: Audio Change Handling

**What:** Reuse AudioTransferService for re-record, trim, and append operations.

**When to use:** Any operation that modifies a card's audio blob.

**Flow:**
```
Editor                                  Viewer
──────                                  ──────
Re-record or trim audio
       │
       ├─[CONTROL] op_card_audio_change ────────►
       │  { cardId, duration, waveformData,
       │    transcript, audioSize }
       │
       ├─[CONTROL] chunk_start ─────────────────►
       │  { cardId, totalChunks, audioSize }
       │
       │ For each 16KB chunk:
       │     ├─[BINARY] chunk data ─────────────►
       │
       ├─[CONTROL] chunk_complete ──────────────►
```

**Implementation:**
```typescript
// Source: Phase 2 AudioTransferService, extended for single-card updates

async function broadcastAudioChange(
  cardId: string,
  card: Card,
  audioBlob: Blob,
  connection: WebRTCConnectionService,
  audioTransfer: AudioTransferService
): Promise<void> {
  // 1. Send metadata operation
  const operation: CardAudioChangeOperation = {
    type: 'op_card_audio_change',
    cardId,
    duration: card.duration,
    waveformData: card.waveformData,
    transcript: card.transcript,
    audioSize: audioBlob.size,
  };
  connection.sendControl(operation);

  // 2. Send chunk_start
  const totalChunks = calculateTotalChunks(audioBlob.size);
  connection.sendControl(createChunkStart(cardId, 0, totalChunks, audioBlob.size));

  // 3. Send audio chunks
  await audioTransfer.sendAudio(cardId, 0, audioBlob);

  // 4. Send chunk_complete
  connection.sendControl(createChunkComplete(cardId, 0));
}
```

### Pattern 4: Reorder Operation with Order Values

**What:** Send only card IDs and new order values for reorder operations.

**When to use:** Drag-and-drop card reordering.

**Why efficient:** Cards already have `order` field. Only need to send the new ordering, not full card data.

**Implementation:**
```typescript
// Source: Existing ProjectContext reorderCards pattern

function handleReorder(newCardOrder: Card[]) {
  // Apply locally
  reorderCards(newCardOrder);

  // Broadcast only ID-to-order mapping
  if (!isApplyingRemoteOperation && connection?.isReady()) {
    const orderMap = newCardOrder.map((card, index) => ({
      id: card.id,
      order: index,
    }));

    const operation: CardReorderOperation = {
      type: 'op_card_reorder',
      cardOrder: orderMap,
    };
    connection.sendControl(operation);
  }
}

// Viewer applies reorder
function applyRemoteReorder(op: CardReorderOperation) {
  const { cards } = useProject().state;

  // Create lookup map
  const orderLookup = new Map(op.cardOrder.map(({ id, order }) => [id, order]));

  // Sort existing cards by new order
  const reordered = [...cards].sort((a, b) => {
    const orderA = orderLookup.get(a.id) ?? Infinity;
    const orderB = orderLookup.get(b.id) ?? Infinity;
    return orderA - orderB;
  });

  reorderCards(reordered);
}
```

### Anti-Patterns to Avoid

- **Broadcasting full state on each change:** Wastes bandwidth, causes UI flicker on viewer
- **No deduplication:** Causes infinite loops, duplicate operations
- **Synchronous audio transfer:** Blocks UI; must be async with progress
- **Ignoring order field:** Reorder operations must update order values, not just array position
- **Missing isApplyingRemote check in persistence:** IndexedDB saves could trigger re-broadcast

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio chunking | Custom chunking | AudioTransferService | Already handles backpressure, progress |
| Message encoding | Custom JSON | syncProtocol.ts | Already handles timestamps, IDs |
| Binary headers | Custom binary format | createBinaryChunk() | Already tested, little-endian |
| State persistence | Manual IndexedDB | saveCards(), saveAudio() | Already in db.ts |

**Key insight:** Phase 2 built reusable infrastructure. Phase 3 extends the protocol with new message types but reuses chunking, encoding, and transfer logic.

## Common Pitfalls

### Pitfall 1: Infinite Broadcast Loop
**What goes wrong:** Local state change triggers broadcast, remote applies it, which triggers broadcast back.
**Why it happens:** No mechanism to distinguish local vs remote operations.
**How to avoid:**
- Set `isApplyingRemoteOperation` flag before applying remote operations
- Check flag before broadcasting
- Reset flag after apply completes (in finally block)
**Warning signs:** Console shows same operation being sent repeatedly; viewer/editor enter feedback loop.

### Pitfall 2: Audio Sync Without Metadata
**What goes wrong:** Audio arrives but viewer doesn't know which card or duration.
**Why it happens:** Sending audio before/without the op_card_audio_change message.
**How to avoid:**
- Always send op_card_audio_change FIRST (with duration, waveform, etc.)
- THEN send chunk_start
- THEN send binary chunks
**Warning signs:** Audio arrives but card UI doesn't update; duration shows wrong.

### Pitfall 3: Race Condition on Card Create
**What goes wrong:** Editor creates card with audio, viewer receives audio chunks before card exists.
**Why it happens:** Control messages and binary can arrive in different order.
**How to avoid:**
- op_card_create includes the card data
- Viewer creates card from op_card_create before receiving audio
- Audio chunks reference cardId that already exists
**Warning signs:** "Unknown cardId" warnings in console; orphaned audio data.

### Pitfall 4: Stale Closure in Broadcast
**What goes wrong:** Broadcast function captures old state, sends stale data.
**Why it happens:** React closure captures state at callback creation time.
**How to avoid:**
- Use refs for connection and state that needs to be current
- Or use function form of state updates
- Pass current values as parameters, not from closure
**Warning signs:** Viewer receives outdated values; operations seem delayed.

### Pitfall 5: Missing Card on Delete
**What goes wrong:** Viewer shows card that editor deleted, or vice versa.
**Why it happens:** Delete operation not broadcast, or not applied.
**How to avoid:**
- Delete operation sends only cardId (not full card)
- Viewer removes from state AND deletes from IndexedDB
- Handle case where cardId doesn't exist (already deleted)
**Warning signs:** Card counts differ between editor/viewer; "ghost" cards.

### Pitfall 6: Reorder Without Order Update
**What goes wrong:** Cards appear in wrong order after reload.
**Why it happens:** Reordering array positions but not updating `order` field, so persistence is wrong.
**How to avoid:**
- Reorder operation includes new order values
- Apply updates `order` field on each card
- saveCards() persists the order values
**Warning signs:** Order correct immediately, wrong after refresh.

## Code Examples

Verified patterns from Phase 2 infrastructure and existing codebase:

### Extending syncProtocol.ts with Operation Types
```typescript
// Source: Pattern from Phase 2 syncProtocol.ts, extended

// Add to SYNC_MESSAGE_TYPES
const OPERATION_MESSAGE_TYPES = [
  'op_card_create',
  'op_card_update',
  'op_card_delete',
  'op_card_reorder',
  'op_card_audio_change',
] as const;

// Type guard for operation messages
export function isOperationMessage(
  msg: ControlMessage
): msg is SyncOperation {
  return OPERATION_MESSAGE_TYPES.includes(
    msg.type as typeof OPERATION_MESSAGE_TYPES[number]
  );
}

// Message creators for each operation type
export function createCardCreateOp(
  card: Card,
  audioSize: number
): MessageWithoutMeta<CardCreateOperation> {
  return {
    type: 'op_card_create',
    card,
    audioSize,
  };
}

export function createCardUpdateOp(
  cardId: string,
  changes: Partial<Pick<Card, 'label' | 'notes' | 'tags' | 'color'>>
): MessageWithoutMeta<CardUpdateOperation> {
  return {
    type: 'op_card_update',
    cardId,
    changes,
  };
}

export function createCardDeleteOp(
  cardId: string
): MessageWithoutMeta<CardDeleteOperation> {
  return {
    type: 'op_card_delete',
    cardId,
  };
}

export function createCardReorderOp(
  cardOrder: Array<{ id: string; order: number }>
): MessageWithoutMeta<CardReorderOperation> {
  return {
    type: 'op_card_reorder',
    cardOrder,
  };
}

export function createCardAudioChangeOp(
  cardId: string,
  duration: number,
  audioSize: number,
  waveformData?: number[],
  transcript?: TranscriptSegment[]
): MessageWithoutMeta<CardAudioChangeOperation> {
  return {
    type: 'op_card_audio_change',
    cardId,
    duration,
    waveformData,
    transcript,
    audioSize,
  };
}
```

### Extending SyncContext with Operation Handlers
```typescript
// Source: Pattern from Phase 2 SyncContext.tsx

// Add to SyncContext state
interface SyncState {
  // ... existing fields ...

  // Phase 3: Track pending audio transfers for individual cards
  pendingAudioTransfers: Map<string, {
    totalChunks: number;
    receivedChunks: number;
    audioSize: number;
  }>;
}

// Operation handler in SyncProvider
const handleOperationMessage = useCallback((msg: SyncOperation) => {
  console.log('[Sync] Operation received:', msg.type);

  // Set flag to prevent re-broadcast
  isApplyingRemoteRef.current = true;

  try {
    switch (msg.type) {
      case 'op_card_create': {
        // Add card to state
        dispatch({ type: 'ADD_CARD', payload: msg.card });
        // Save to IndexedDB
        saveCard(msg.card);
        // If audio exists, prepare to receive
        if (msg.audioSize > 0) {
          // Audio will arrive via chunk_start/binary/chunk_complete
        }
        break;
      }

      case 'op_card_update': {
        const card = state.cards.find(c => c.id === msg.cardId);
        if (card) {
          const updated = { ...card, ...msg.changes, updatedAt: new Date().toISOString() };
          dispatch({ type: 'UPDATE_CARD', payload: updated });
          saveCard(updated);
        }
        break;
      }

      case 'op_card_delete': {
        dispatch({ type: 'DELETE_CARD', payload: msg.cardId });
        deleteCard(msg.cardId);  // Also deletes audio
        break;
      }

      case 'op_card_reorder': {
        const orderLookup = new Map(msg.cardOrder.map(({ id, order }) => [id, order]));
        const reordered = [...state.cards]
          .map(card => ({
            ...card,
            order: orderLookup.get(card.id) ?? card.order,
          }))
          .sort((a, b) => a.order - b.order);
        dispatch({ type: 'REORDER_CARDS', payload: reordered });
        saveCards(reordered);
        break;
      }

      case 'op_card_audio_change': {
        const card = state.cards.find(c => c.id === msg.cardId);
        if (card) {
          const updated = {
            ...card,
            duration: msg.duration,
            waveformData: msg.waveformData,
            transcript: msg.transcript,
            updatedAt: new Date().toISOString(),
          };
          dispatch({ type: 'UPDATE_CARD', payload: updated });
          saveCard(updated);
          // Audio will arrive via chunk_start/binary/chunk_complete
        }
        break;
      }
    }
  } finally {
    isApplyingRemoteRef.current = false;
  }
}, [dispatch, state.cards]);
```

### Broadcast Wrapper for ProjectContext Actions
```typescript
// Source: New pattern for Phase 3

// In a component or custom hook that needs synced operations
function useSyncedCardActions() {
  const { addCard, updateCard, deleteCard, reorderCards } = useProject();
  const { connectionState, syncState } = useSync();
  const connectionRef = useSyncConnection();
  const audioTransferRef = useAudioTransfer();
  const isApplyingRemoteRef = useRef(false);

  const syncedUpdateCard = useCallback(async (card: Card) => {
    // Extract only the fields that changed (compare to existing)
    const changes: Partial<Pick<Card, 'label' | 'notes' | 'tags' | 'color'>> = {
      label: card.label,
      notes: card.notes,
      tags: card.tags,
      color: card.color,
    };

    // Apply locally
    updateCard(card);

    // Broadcast if connected and not applying remote
    if (!isApplyingRemoteRef.current &&
        connectionRef.current?.isReady() &&
        syncState.role === 'editor') {
      connectionRef.current.sendControl(
        createCardUpdateOp(card.id, changes)
      );
    }
  }, [updateCard, connectionRef, syncState.role]);

  const syncedDeleteCard = useCallback(async (cardId: string) => {
    // Apply locally
    deleteCard(cardId);

    // Broadcast if connected
    if (!isApplyingRemoteRef.current &&
        connectionRef.current?.isReady() &&
        syncState.role === 'editor') {
      connectionRef.current.sendControl(
        createCardDeleteOp(cardId)
      );
    }
  }, [deleteCard, connectionRef, syncState.role]);

  return {
    addCard: syncedAddCard,
    updateCard: syncedUpdateCard,
    deleteCard: syncedDeleteCard,
    reorderCards: syncedReorderCards,
    isApplyingRemoteRef,
  };
}
```

### Handling Audio Changes (Re-record/Trim)
```typescript
// Source: Pattern from Phase 2 AudioTransferService + new operation layer

async function handleAudioChange(
  cardId: string,
  newAudioBlob: Blob,
  newDuration: number,
  newWaveformData?: number[],
  newTranscript?: TranscriptSegment[]
): Promise<void> {
  const { updateCard } = useProject();
  const connectionRef = useSyncConnection();
  const audioTransferRef = useAudioTransfer();

  // 1. Update local state and persist
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;

  const updated = {
    ...card,
    duration: newDuration,
    waveformData: newWaveformData,
    transcript: newTranscript,
    updatedAt: new Date().toISOString(),
  };
  updateCard(updated);
  await saveCard(updated);
  await saveAudio(cardId, newAudioBlob);

  // 2. Broadcast if connected
  if (!connectionRef.current?.isReady()) return;

  // 2a. Send operation message
  connectionRef.current.sendControl(
    createCardAudioChangeOp(
      cardId,
      newDuration,
      newAudioBlob.size,
      newWaveformData,
      newTranscript
    )
  );

  // 2b. Send audio via chunk protocol
  const totalChunks = calculateTotalChunks(newAudioBlob.size);
  connectionRef.current.sendControl(
    createChunkStart(cardId, 0, totalChunks, newAudioBlob.size)
  );

  await audioTransferRef.current!.sendAudio(cardId, 0, newAudioBlob);

  connectionRef.current.sendControl(
    createChunkComplete(cardId, 0)
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Full state sync on every change | Operation-based incremental sync | Standard pattern | Much more efficient |
| No origin tracking | Origin/flag-based deduplication | Yjs established pattern | Prevents infinite loops |
| Polling for changes | Event-driven broadcast | WebRTC DataChannel | Real-time updates |

**Deprecated/outdated:**
- Sending full project state on each change: Works but wastes bandwidth
- String-based origin (like `"remote"`) instead of ref/object identity: Works but less robust

## Open Questions

Things that couldn't be fully resolved:

1. **Conflict resolution for simultaneous edits**
   - What we know: Single-editor model means only editor can modify
   - What's unclear: What if viewer somehow triggers an edit (e.g., transcript update)?
   - Recommendation: Enforce editor-only writes in Phase 3; viewer is read-only

2. **Undo/redo sync**
   - What we know: HistoryContext tracks before/after states for undo
   - What's unclear: Should undo on editor trigger undo on viewer?
   - Recommendation: Treat undo as a new set of operations (create, update, delete); viewer sees the result, not the undo action itself

3. **Latency threshold for "1 second" requirement**
   - What we know: DataChannel is low-latency; audio transfer takes longer
   - What's unclear: Does "1 second" apply to audio changes too?
   - Recommendation: 1 second for metadata changes; audio changes show progress indicator

4. **Reconnection and missed operations**
   - What we know: Phase 2 does full re-sync on connect
   - What's unclear: If connection drops briefly, should we queue operations?
   - Recommendation: Simple approach for Phase 3 - full re-sync on reconnect; operation queuing is Phase 4+

## Sources

### Primary (HIGH confidence)
- Phase 1 WebRTCConnectionService implementation - Verified sendControl(), sendBinary() APIs
- Phase 2 AudioTransferService implementation - Verified chunked transfer with backpressure
- Phase 2 syncProtocol.ts - Verified message format patterns
- [MDN RTCDataChannel](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel) - DataChannel reliable ordered delivery

### Secondary (MEDIUM confidence)
- [Yjs Origin Pattern](https://docs.yjs.dev/api/y.doc#transaction-origins) - Origin-based deduplication approach
- [Yjs Community Discussion](https://discuss.yjs.dev/t/determining-whether-a-transaction-is-local/361) - Local vs remote determination
- [webrtc.link DataChannel Guide](https://webrtc.link/en/articles/rtcdatachannel-usage-and-message-size-limits/) - Best practices for real-time sync
- [CRDT.tech](https://crdt.tech/) - Operation-based CRDT concepts

### Tertiary (LOW confidence)
- WebSearch results for React state sync patterns - General patterns, verified against codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, extending existing infrastructure
- Architecture: HIGH - Patterns directly from Phase 1/2 implementation
- Deduplication: HIGH - Yjs origin pattern is well-documented and proven
- Pitfalls: MEDIUM - Based on common issues in collaborative apps

**Research date:** 2026-01-22
**Valid until:** 2026-03-22 (60 days - patterns are stable, no external dependencies)
