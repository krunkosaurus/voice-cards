# Architecture Patterns: WebRTC P2P Sync

**Domain:** Real-time P2P synchronization for React applications
**Researched:** 2026-01-22
**Confidence:** HIGH (patterns verified via MDN, WebRTC samples, official documentation)

## Executive Summary

WebRTC P2P sync integrates with existing React state management through a **layered architecture** that separates connection concerns from sync logic from UI state. The key insight: WebRTC handles transport, but the application must handle message semantics, chunking for large data, and state reconciliation.

For Voice Cards specifically, the existing Context/useReducer pattern works well — the sync layer intercepts reducer actions and broadcasts them, while also applying incoming remote actions to local state.

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI Components                            │
│   (Card, CardList, Header, ConnectionDialog, SyncIndicator)     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ProjectContext                              │
│          (existing useReducer + sync-aware dispatch)            │
│                                                                  │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│   │ Local State  │◄───│  Reducer     │◄───│ Action       │     │
│   │ (cards, etc) │    │  (existing)  │    │ Dispatch     │     │
│   └──────────────┘    └──────────────┘    └──────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
┌───────────────────────┐   ┌───────────────────────────────────┐
│     Sync Layer        │   │       Audio Transfer Layer        │
│  (SyncContext.tsx)    │   │    (AudioTransferService.ts)      │
│                       │   │                                   │
│  - Action broadcast   │   │  - Blob chunking (16KB)          │
│  - Remote action      │   │  - Progress tracking             │
│  - Editor role mgmt   │   │  - Reassembly                    │
│  - Initial sync       │   │  - Buffer management             │
└───────────────────────┘   └───────────────────────────────────┘
                    │                   │
                    └─────────┬─────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Connection Layer                               │
│              (WebRTCConnectionService.ts)                       │
│                                                                  │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│   │ Peer         │    │ Data         │    │ ICE          │     │
│   │ Connection   │    │ Channels     │    │ Management   │     │
│   └──────────────┘    └──────────────┘    └──────────────┘     │
│                                                                  │
│   - RTCPeerConnection lifecycle                                  │
│   - SDP offer/answer generation                                  │
│   - Connection state events                                      │
│   - Reconnection logic                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SDP Encoding Layer                           │
│                  (sdpCodec.ts)                                  │
│                                                                  │
│   - SDP to shareable code (base64 + compression)               │
│   - Code to SDP parsing                                         │
│   - Validation                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Component Boundaries

| Component | Responsibility | Dependencies | Communicates With |
|-----------|---------------|--------------|-------------------|
| **WebRTCConnectionService** | RTCPeerConnection lifecycle, DataChannel creation, ICE handling | Browser WebRTC API | SyncContext, AudioTransferService |
| **SDP Codec** | Encode/decode SDP for manual exchange | pako (compression) | WebRTCConnectionService, UI |
| **SyncContext** | Action broadcast, remote action application, editor role | ProjectContext, WebRTCConnectionService | ProjectContext, UI |
| **AudioTransferService** | Chunk blobs, track progress, reassemble | WebRTCConnectionService | SyncContext, IndexedDB |
| **ProjectContext** | App state, reducer, persistence | IndexedDB | All UI components, SyncContext |

### Boundary Rules

1. **Connection layer knows nothing about app state** — it just sends/receives bytes
2. **Sync layer knows about actions, not about WebRTC internals** — uses connection service as transport
3. **UI components only interact with contexts** — never directly with services
4. **Audio transfer is separate from metadata sync** — different chunking, different channels

## Data Flow

### Operation Sync Flow (Creates, Deletes, Edits, Reorders)

```
Local User Action
       │
       ▼
┌──────────────────┐
│  UI Component    │  e.g., deleteCard(id)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  ProjectContext  │  addCard/updateCard/deleteCard/reorderCards
│  (action method) │
└────────┬─────────┘
         │
         ├────────────────────────────┐
         ▼                            ▼
┌──────────────────┐        ┌──────────────────┐
│  Local Reducer   │        │   SyncContext    │
│  (state update)  │        │ (if connected &  │
└──────────────────┘        │  isEditor)       │
                            └────────┬─────────┘
                                     │
                                     ▼
                            ┌──────────────────┐
                            │  DataChannel     │
                            │  send(message)   │
                            └────────┬─────────┘
                                     │
                                     ▼
                            ┌──────────────────┐
                            │  Remote Peer     │
                            │  SyncContext     │
                            │  (receives msg)  │
                            └────────┬─────────┘
                                     │
                                     ▼
                            ┌──────────────────┐
                            │  Remote Reducer  │
                            │  (applies action)│
                            └──────────────────┘
```

### Initial Project Sync Flow

```
Editor initiates sync
       │
       ▼
┌──────────────────┐
│  SyncContext     │  Serialize project state
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Control Channel │  Send metadata (cards without audio)
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│  For each card with audio:                           │
│                                                      │
│  ┌──────────────────┐                               │
│  │ AudioTransfer    │  Fetch blob from IndexedDB    │
│  │ Service          │                               │
│  └────────┬─────────┘                               │
│           │                                          │
│           ▼                                          │
│  ┌──────────────────┐                               │
│  │ Chunking         │  Split into 16KB chunks       │
│  │ (arraybuffer)    │                               │
│  └────────┬─────────┘                               │
│           │                                          │
│           ▼                                          │
│  ┌──────────────────┐                               │
│  │ Binary Channel   │  Send with backpressure       │
│  │ (buffered)       │  (monitor bufferedAmount)     │
│  └────────┬─────────┘                               │
│           │                                          │
│           ▼                                          │
│  ┌──────────────────┐                               │
│  │ Remote           │  Reassemble chunks            │
│  │ AudioTransfer    │  Save to IndexedDB            │
│  └──────────────────┘                               │
└──────────────────────────────────────────────────────┘
```

### Connection Establishment Flow (Manual SDP Exchange)

```
┌─────────────────┐                    ┌─────────────────┐
│   Peer A        │                    │   Peer B        │
│   (Initiator)   │                    │   (Responder)   │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         │  1. Create RTCPeerConnection         │
         │  2. Create DataChannel               │
         │  3. createOffer()                    │
         │  4. setLocalDescription(offer)       │
         │  5. Wait for ICE gathering           │
         │                                      │
         │  6. Encode SDP as shareable code     │
         │  ─────────────────────────────────►  │
         │     (manual: copy/paste/QR)          │
         │                                      │
         │                                      │  7. Decode SDP
         │                                      │  8. setRemoteDescription(offer)
         │                                      │  9. createAnswer()
         │                                      │  10. setLocalDescription(answer)
         │                                      │  11. Wait for ICE gathering
         │                                      │
         │  ◄─────────────────────────────────  │  12. Encode answer as code
         │     (manual: copy/paste/QR)          │
         │                                      │
         │  13. Decode answer                   │
         │  14. setRemoteDescription(answer)    │
         │                                      │
         │  ◄═════════════════════════════════► │  15. ICE connectivity check
         │           P2P Connected              │
         │                                      │
         │  16. DataChannel 'open' event        │  16. 'datachannel' event
         │                                      │
         └──────────────────────────────────────┘
```

## Integration with Existing React Patterns

### Option A: Sync-Aware Context (Recommended)

Wrap existing ProjectContext actions to broadcast when connected:

```typescript
// Existing ProjectContext stays mostly unchanged
// New SyncContext wraps and intercepts

function SyncProvider({ children }: { children: React.ReactNode }) {
  const { dispatch, addCard, updateCard, deleteCard, reorderCards } = useProject();
  const connection = useWebRTCConnection();
  const [isEditor, setIsEditor] = useState(true);

  // Wrap actions to broadcast
  const syncAddCard = useCallback((card: Card) => {
    addCard(card);
    if (connection.isOpen && isEditor) {
      connection.send({ type: 'ADD_CARD', payload: card });
    }
  }, [addCard, connection, isEditor]);

  // Handle incoming remote actions
  useEffect(() => {
    if (!connection.isOpen) return;

    const handleMessage = (message: SyncMessage) => {
      if (message.type === 'ADD_CARD') {
        // Apply remotely without re-broadcasting
        dispatch({ type: 'ADD_CARD', payload: message.payload });
      }
      // ... handle other action types
    };

    connection.onMessage(handleMessage);
    return () => connection.offMessage(handleMessage);
  }, [connection, dispatch]);

  return (
    <SyncContext.Provider value={{ syncAddCard, /* ... */ isEditor, setIsEditor }}>
      {children}
    </SyncContext.Provider>
  );
}
```

### Option B: Middleware Pattern (Alternative)

Create a sync middleware that intercepts dispatch:

```typescript
function createSyncMiddleware(connection: WebRTCConnection) {
  return (dispatch: Dispatch<Action>) => (action: Action) => {
    // Apply locally first
    dispatch(action);

    // Broadcast if connected and syncable action
    if (connection.isOpen && isSyncableAction(action)) {
      connection.send(action);
    }
  };
}
```

### Recommendation

**Use Option A (Sync-Aware Context)** because:
- Cleaner separation — sync logic lives in SyncContext, not mixed into ProjectContext
- Easier to disable sync — components can conditionally use sync versions of actions
- Editor role naturally fits — SyncContext owns the "who can edit" state
- Existing code unchanged — ProjectContext reducer stays the same

## DataChannel Design

### Dual Channel Architecture

Use two DataChannels for separation of concerns:

| Channel | Purpose | Configuration |
|---------|---------|---------------|
| `control` | Metadata, operations, role changes | `{ ordered: true, maxRetransmits: 5 }` |
| `binary` | Audio blob chunks | `{ ordered: true }` |

**Why two channels?**
- Prevents large audio transfers from blocking operation sync
- Different reliability needs (operations MUST arrive, audio can retry)
- Easier to monitor and debug

### Message Protocol

```typescript
// Control channel messages
type ControlMessage =
  | { type: 'SYNC_INIT'; payload: { cards: CardMetadata[]; project: Project } }
  | { type: 'SYNC_COMPLETE' }
  | { type: 'ADD_CARD'; payload: Card }
  | { type: 'UPDATE_CARD'; payload: Card }
  | { type: 'DELETE_CARD'; payload: string }
  | { type: 'REORDER_CARDS'; payload: Card[] }
  | { type: 'EDITOR_REQUEST' }
  | { type: 'EDITOR_GRANT' }
  | { type: 'EDITOR_RELEASE' }
  | { type: 'PING' }
  | { type: 'PONG' };

// Binary channel messages (header + data)
type BinaryMessageHeader = {
  type: 'AUDIO_CHUNK';
  cardId: string;
  chunkIndex: number;
  totalChunks: number;
  totalSize: number;
};
```

### Chunking Strategy

Based on WebRTC cross-browser compatibility research:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Chunk size | 16 KB | Cross-browser stable (Chrome, Firefox, Safari) |
| Buffer threshold | 32 KB | Pause sending when bufferedAmount exceeds |
| Binary type | `arraybuffer` | Easier handling than blobs |

```typescript
const CHUNK_SIZE = 16 * 1024; // 16 KB
const BUFFER_THRESHOLD = 32 * 1024; // 32 KB

async function sendAudioBlob(channel: RTCDataChannel, cardId: string, blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    // Wait if buffer is full
    while (channel.bufferedAmount > BUFFER_THRESHOLD) {
      await new Promise(resolve => {
        channel.onbufferedamountlow = resolve;
      });
    }

    const start = i * CHUNK_SIZE;
    const chunk = buffer.slice(start, start + CHUNK_SIZE);

    // Send header (JSON) then chunk (binary)
    channel.send(JSON.stringify({
      type: 'AUDIO_CHUNK',
      cardId,
      chunkIndex: i,
      totalChunks,
      totalSize: buffer.byteLength
    }));
    channel.send(chunk);
  }
}
```

## Patterns to Follow

### Pattern 1: Connection State Machine

Use explicit states for connection lifecycle:

```typescript
type ConnectionState =
  | 'disconnected'      // No connection
  | 'creating_offer'    // Generating SDP offer
  | 'awaiting_answer'   // Offer sent, waiting for answer
  | 'creating_answer'   // Received offer, generating answer
  | 'connecting'        // ICE negotiation in progress
  | 'connected'         // DataChannel open
  | 'reconnecting'      // Connection dropped, attempting recovery
  | 'failed';           // Unrecoverable error
```

**Why:** WebRTC has many intermediate states. Explicit state machine prevents UI confusion and race conditions.

### Pattern 2: Heartbeat for Connection Health

P2P connections can silently fail. Use ping/pong:

```typescript
const HEARTBEAT_INTERVAL = 5000; // 5 seconds
const HEARTBEAT_TIMEOUT = 15000; // 15 seconds

function startHeartbeat(channel: RTCDataChannel) {
  let lastPong = Date.now();

  const pingInterval = setInterval(() => {
    if (Date.now() - lastPong > HEARTBEAT_TIMEOUT) {
      // Connection dead, trigger reconnect
      handleDisconnect();
      return;
    }
    channel.send(JSON.stringify({ type: 'PING' }));
  }, HEARTBEAT_INTERVAL);

  const handlePong = () => { lastPong = Date.now(); };

  return () => clearInterval(pingInterval);
}
```

### Pattern 3: Idempotent Operations

Operations should be safe to apply multiple times (network can duplicate):

```typescript
// Include unique operation ID
type SyncOperation = {
  id: string;  // UUID
  type: 'ADD_CARD' | 'UPDATE_CARD' | /* ... */;
  payload: unknown;
  timestamp: number;
};

// Track applied operations
const appliedOps = new Set<string>();

function applyRemoteOperation(op: SyncOperation) {
  if (appliedOps.has(op.id)) {
    return; // Already applied
  }
  appliedOps.add(op.id);
  dispatch(op);
}
```

### Pattern 4: Optimistic Local, Confirmed Remote

Apply local changes immediately, confirm when synced:

```typescript
// Local action with pending state
function deleteCard(id: string) {
  dispatch({ type: 'DELETE_CARD', payload: id });
  setPendingOps(prev => [...prev, { type: 'DELETE_CARD', id }]);

  if (connection.isOpen) {
    connection.send({ type: 'DELETE_CARD', payload: id })
      .then(() => {
        setPendingOps(prev => prev.filter(op => op.id !== id));
      });
  }
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Mixing Connection and Sync Logic

**What:** Putting action broadcasting inside WebRTCConnectionService

**Why bad:** Makes connection layer aware of app semantics, harder to test, harder to reuse

**Instead:** Connection layer only handles bytes. Sync layer handles message semantics.

### Anti-Pattern 2: Sending Full State on Every Change

**What:** Broadcasting entire cards array after each operation

**Why bad:** Wastes bandwidth, causes flickering, conflicts on simultaneous edits

**Instead:** Send operation deltas (ADD_CARD, DELETE_CARD, etc.)

### Anti-Pattern 3: No Operation Ordering

**What:** Applying operations in arrival order without timestamps

**Why bad:** Network delays can reorder operations, causing inconsistent state

**Instead:** Include timestamps, use causal ordering for dependent operations

### Anti-Pattern 4: Blocking UI During Sync

**What:** Showing loading spinner during initial sync

**Why bad:** App feels frozen, user can't do anything while waiting

**Instead:** Show sync progress but keep UI responsive. Apply operations as they arrive.

### Anti-Pattern 5: Trusting Remote Data Blindly

**What:** Directly applying incoming messages to state without validation

**Why bad:** Malformed messages crash app, potential injection attacks

**Instead:** Validate all incoming messages against expected schema

## File/Module Structure

```
client/src/
├── contexts/
│   ├── ProjectContext.tsx      # Existing (minimal changes)
│   └── SyncContext.tsx         # NEW: Sync state, editor role
│
├── services/
│   ├── db.ts                   # Existing IndexedDB
│   ├── webrtc/
│   │   ├── connection.ts       # NEW: RTCPeerConnection management
│   │   ├── sdpCodec.ts         # NEW: SDP encode/decode
│   │   └── audioTransfer.ts    # NEW: Blob chunking/reassembly
│   └── sync/
│       ├── operations.ts       # NEW: Operation serialization
│       └── protocol.ts         # NEW: Message types, validation
│
├── hooks/
│   ├── useWebRTC.ts            # NEW: Connection hook
│   └── useSyncState.ts         # NEW: Sync status hook
│
├── components/
│   ├── ConnectionDialog.tsx    # NEW: SDP exchange UI
│   ├── SyncIndicator.tsx       # NEW: Connection status badge
│   └── EditorBadge.tsx         # NEW: Who can edit indicator
│
└── types/
    ├── index.ts                # Existing
    └── sync.ts                 # NEW: Sync-specific types
```

## Build Order (Dependencies)

Build in this order to minimize integration pain:

```
Phase 1: Foundation (no WebRTC yet)
├── types/sync.ts           # Define message types first
├── services/sync/protocol.ts   # Message validation
└── services/webrtc/sdpCodec.ts # SDP encoding (testable standalone)

Phase 2: Connection Layer
├── services/webrtc/connection.ts  # RTCPeerConnection wrapper
├── hooks/useWebRTC.ts             # React hook for connection
└── components/ConnectionDialog.tsx # Manual SDP exchange UI

Phase 3: Initial Sync
├── services/webrtc/audioTransfer.ts # Chunking/reassembly
├── contexts/SyncContext.tsx         # Initial sync orchestration
└── Integration with ProjectContext

Phase 4: Operation Sync
├── services/sync/operations.ts # Operation broadcast/receive
├── Sync-aware action wrappers
└── components/SyncIndicator.tsx

Phase 5: Editor Role
├── Editor request/grant protocol
├── components/EditorBadge.tsx
└── UI enforcement of edit permissions

Phase 6: Reconnection
├── Connection health monitoring
├── Auto-reconnect logic
└── State reconciliation after reconnect
```

**Rationale:**
- Phase 1 has no external dependencies, can be fully tested
- Phase 2 establishes connection before any sync logic
- Phase 3 (initial sync) is needed before operation sync makes sense
- Phase 4 builds on working connection + initial sync
- Phase 5 can be deferred — app works without it (single editor assumption)
- Phase 6 is polish — core functionality works without it

## Scalability Considerations

| Concern | 2 Peers | 4+ Peers | Notes |
|---------|---------|----------|-------|
| Connection topology | Point-to-point | N/A | Voice Cards is 2-peer only |
| Bandwidth | One connection | N/A | Not a mesh network concern |
| Initial sync | Full project once | N/A | Only editor-to-viewer |
| Operation latency | ~50-200ms RTT | N/A | P2P, no server hop |

**Note:** Voice Cards is explicitly 2-peer (one editor, one viewer). Multi-peer mesh is out of scope.

## Integration Points with Existing Code

| Existing Code | Integration Point | Change Required |
|---------------|-------------------|-----------------|
| `ProjectContext.tsx` | Add SyncContext as child provider | Wrap provider hierarchy |
| `useProject()` hook | Components use `useSyncProject()` for sync-aware actions | New hook, existing kept |
| `db.ts` | AudioTransferService uses `getAudio`/`saveAudio` | No changes |
| `exportProject.ts` | Initial sync reuses serialization logic | Extract shared helpers |
| `importProject.ts` | Initial sync reuses deserialization logic | Extract shared helpers |
| `Card.tsx` | Show sync indicator, disable edit if not editor | Conditional rendering |
| `Header.tsx` | Add connection button, status indicator | New UI elements |

## Sources

- [MDN: Using WebRTC Data Channels](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels) - DataChannel patterns, lifecycle events
- [WebRTC Samples: File Transfer](https://webrtc.github.io/samples/src/content/datachannel/filetransfer/) - Official file transfer example
- [RTCDataChannel Guide: Message Size Limits](https://webrtc.link/en/articles/rtcdatachannel-usage-and-message-size-limits/) - Chunk size recommendations (16KB)
- [Building WebRTC Without Signaling Server](https://dev.to/hexshift/building-a-minimal-webrtc-peer-without-a-signaling-server-using-only-manual-sdp-exchange-mck) - Manual SDP exchange pattern
- [RxDB WebRTC P2P Replication](https://rxdb.info/replication-webrtc.html) - P2P sync architecture patterns
- [React State Management 2025](https://www.developerway.com/posts/react-state-management-2025) - Context/reducer patterns

---
*Research confidence: HIGH. Core patterns verified via MDN and official WebRTC samples. Chunk sizes verified via cross-browser compatibility documentation.*
