# Phase 2: Initial Sync - Research

**Researched:** 2026-01-22
**Domain:** WebRTC DataChannel binary transfer, sync protocol design
**Confidence:** HIGH

## Summary

Phase 2 implements initial project synchronization from editor to viewer when a P2P connection is established. The phase builds on Phase 1's WebRTCConnectionService with its dual DataChannel architecture (control for JSON messages, binary for ArrayBuffer data).

The research confirms:
1. **16KB chunk size** is the correct cross-browser baseline for binary transfer
2. **Backpressure via bufferedAmountLowThreshold** is essential to prevent memory exhaustion
3. **Metadata-first protocol** (send card manifest, then audio blobs) is the established pattern
4. **Blob.arrayBuffer()** is the modern, well-supported method for Blob-to-ArrayBuffer conversion

**Primary recommendation:** Implement a two-phase sync protocol: (1) control message with project metadata and card manifest, (2) sequential chunked audio transfer with backpressure control and progress tracking.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native WebRTC APIs | Browser built-in | RTCDataChannel for P2P transfer | Decision from Phase 1 - manual SDP needs direct control |
| idb | Already installed | IndexedDB wrapper for reading project/audio data | Project already uses for storage |

### Supporting (No New Dependencies)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Blob.arrayBuffer() | Browser API | Convert Blob to ArrayBuffer for chunking | Modern browsers (supported since ~2020) |
| ArrayBuffer.slice() | Browser API | Chunk ArrayBuffer into 16KB pieces | Standard chunking approach |
| Uint8Array | Browser API | View over ArrayBuffer for efficient manipulation | Chunk headers, reassembly |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Blob.arrayBuffer() | FileReader.readAsArrayBuffer() | FileReader is callback-based, arrayBuffer() is Promise-based (prefer arrayBuffer) |
| Manual chunking | Streams API | Streams has broader support issues on some browsers; manual chunking is simpler |

**Installation:**
```bash
# No new dependencies needed - using browser APIs and existing infrastructure
```

## Architecture Patterns

### Recommended Project Structure
```
client/src/
├── services/
│   ├── webrtc/
│   │   ├── connection.ts          # [Phase 1] WebRTCConnectionService
│   │   ├── sdpCodec.ts            # [Phase 1] SDP encoding
│   │   └── syncProtocol.ts        # [Phase 2] NEW: Sync message types/handlers
│   └── sync/
│       ├── AudioTransferService.ts # [Phase 2] NEW: Chunked audio transfer
│       └── projectSync.ts          # [Phase 2] NEW: Project serialization for sync
├── contexts/
│   ├── ProjectContext.tsx          # [Existing] Project state
│   └── SyncContext.tsx             # [Phase 2] NEW: Sync-aware state wrapper
├── components/
│   ├── SyncProgress.tsx            # [Phase 2] NEW: Transfer progress UI
│   └── OverwriteConfirmDialog.tsx  # [Phase 2] NEW: Receiver overwrite warning
└── types/
    └── sync.ts                     # [Phase 1+2] Sync types (extend with transfer types)
```

### Pattern 1: Metadata-First Sync Protocol

**What:** Send project metadata and card manifest first via control channel, then audio blobs via binary channel.

**When to use:** Any initial state synchronization where you need to transfer both structured data and binary blobs.

**Protocol Flow:**
```
Editor (Sender)                          Viewer (Receiver)
────────────────                         ────────────────
connection.state === 'connected'          connection.state === 'connected'
       │                                         │
       ├─────[CONTROL] sync_request ────────────►│
       │     { cards: [...metadata], totalSize } │
       │                                         │
       │◄────[CONTROL] sync_accept ─────────────┤
       │     { accepted: true }                  │ (or sync_reject)
       │                                         │
       │ For each card with audio:               │
       │     │                                   │
       │     ├─[CONTROL] chunk_start ───────────►│
       │     │  { cardId, totalChunks, size }    │
       │     │                                   │
       │     │ For each 16KB chunk:              │
       │     │     │                             │
       │     │     ├─[BINARY] chunk data ───────►│
       │     │     │  [4-byte cardIndex][4-byte  │
       │     │     │   chunkIndex][chunk data]   │
       │     │                                   │
       │     ├─[CONTROL] chunk_complete ────────►│
       │     │  { cardId }                       │
       │                                         │
       ├─────[CONTROL] sync_complete ───────────►│
       │     { totalCards, totalBytes }          │
```

**Example:**
```typescript
// Source: Based on webrtc.link best practices
// Control message types for sync protocol
interface SyncRequestMessage extends ControlMessage {
  type: 'sync_request';
  project: { createdAt: string; updatedAt: string };
  cards: Array<{
    id: string;
    label: string;
    notes: string;
    tags: string[];
    color: CardColor;
    duration: number;
    waveformData?: number[];
    transcript?: TranscriptSegment[];
    createdAt: string;
    updatedAt: string;
    order: number;
    audioSize: number; // Size in bytes for progress tracking
  }>;
  totalAudioBytes: number;
}

interface ChunkStartMessage extends ControlMessage {
  type: 'chunk_start';
  cardId: string;
  cardIndex: number;
  totalChunks: number;
  audioSize: number;
}
```

### Pattern 2: Backpressure-Controlled Chunked Transfer

**What:** Send binary chunks with buffer monitoring to prevent memory exhaustion.

**When to use:** Any large binary transfer over DataChannel.

**Example:**
```typescript
// Source: MDN bufferedAmountLowThreshold + webrtc.link patterns
const CHUNK_SIZE = 16 * 1024; // 16KB - cross-browser baseline
const BUFFER_THRESHOLD = 64 * 1024; // 64KB - pause when buffer exceeds this

async function sendAudioChunked(
  connection: WebRTCConnectionService,
  cardIndex: number,
  audioBlob: Blob,
  onProgress: (sent: number, total: number) => void
): Promise<void> {
  const arrayBuffer = await audioBlob.arrayBuffer();
  const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength);
    const chunkData = arrayBuffer.slice(start, end);

    // Create chunk with header: [cardIndex:4][chunkIndex:4][data]
    const header = new ArrayBuffer(8);
    const headerView = new DataView(header);
    headerView.setUint32(0, cardIndex, true); // little-endian
    headerView.setUint32(4, chunkIndex, true);

    const chunk = new Uint8Array(8 + chunkData.byteLength);
    chunk.set(new Uint8Array(header), 0);
    chunk.set(new Uint8Array(chunkData), 8);

    // Backpressure: wait if buffer is full
    await waitForBufferDrain(connection);

    connection.sendBinary(chunk.buffer);
    onProgress(end, arrayBuffer.byteLength);
  }
}

async function waitForBufferDrain(connection: WebRTCConnectionService): Promise<void> {
  // This requires exposing bufferedAmount from connection service
  // Implementation will need to add getter/event to WebRTCConnectionService
  while (connection.getBinaryBufferedAmount() > BUFFER_THRESHOLD) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
```

### Pattern 3: Chunk Reassembly at Receiver

**What:** Collect incoming chunks and reassemble into complete Blob.

**When to use:** Receiving chunked binary data.

**Example:**
```typescript
// Source: webrtc.link file transfer pattern
interface ChunkBuffer {
  cardId: string;
  totalChunks: number;
  receivedChunks: Map<number, ArrayBuffer>;
  totalSize: number;
}

class ChunkReassembler {
  private buffers: Map<number, ChunkBuffer> = new Map();

  startCard(cardIndex: number, cardId: string, totalChunks: number, totalSize: number): void {
    this.buffers.set(cardIndex, {
      cardId,
      totalChunks,
      receivedChunks: new Map(),
      totalSize,
    });
  }

  addChunk(data: ArrayBuffer): { cardId: string; complete: boolean; blob?: Blob } | null {
    const view = new DataView(data);
    const cardIndex = view.getUint32(0, true);
    const chunkIndex = view.getUint32(4, true);
    const chunkData = data.slice(8);

    const buffer = this.buffers.get(cardIndex);
    if (!buffer) return null;

    buffer.receivedChunks.set(chunkIndex, chunkData);

    if (buffer.receivedChunks.size === buffer.totalChunks) {
      // All chunks received - reassemble
      const chunks: ArrayBuffer[] = [];
      for (let i = 0; i < buffer.totalChunks; i++) {
        chunks.push(buffer.receivedChunks.get(i)!);
      }
      const blob = new Blob(chunks, { type: 'audio/webm' });
      this.buffers.delete(cardIndex);
      return { cardId: buffer.cardId, complete: true, blob };
    }

    return { cardId: buffer.cardId, complete: false };
  }
}
```

### Pattern 4: SyncContext Wrapping ProjectContext

**What:** Create a sync-aware context that intercepts ProjectContext operations during sync.

**When to use:** When receiver needs to temporarily hold incoming state before committing.

**Example:**
```typescript
// Source: React context patterns
interface SyncState {
  isSyncing: boolean;
  syncRole: 'sender' | 'receiver' | null;
  progress: {
    phase: 'idle' | 'metadata' | 'transferring' | 'complete' | 'error';
    cardsTotal: number;
    cardsTransferred: number;
    bytesTotal: number;
    bytesTransferred: number;
  };
  pendingProject: {
    cards: Card[];
    audio: Map<string, Blob>;
  } | null;
}

// SyncContext wraps ProjectContext and provides sync-aware operations
const SyncContext = createContext<{
  syncState: SyncState;
  startSync: (connection: WebRTCConnectionService) => Promise<void>;
  acceptSync: (request: SyncRequestMessage) => Promise<void>;
  rejectSync: (reason: string) => void;
  commitSync: () => Promise<void>; // Applies pending changes to ProjectContext
  cancelSync: () => void;
} | null>(null);
```

### Anti-Patterns to Avoid

- **Sending entire Blob without chunking:** Will fail on large files; DataChannel has message size limits.
- **Ignoring bufferedAmount:** Will cause memory exhaustion and connection failures on large transfers.
- **Using unreliable DataChannel for file transfer:** Chunks can arrive out of order or be lost.
- **Polling bufferedAmount in tight loop:** Use bufferedAmountLowThreshold event instead.
- **Mixing control and binary on same channel:** Can block control messages during large transfers.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Blob to ArrayBuffer | FileReader callbacks | `blob.arrayBuffer()` | Modern, Promise-based, cleaner |
| ArrayBuffer viewing | Manual byte manipulation | `DataView`, `Uint8Array` | Type-safe, endian-aware |
| Progress percentage | Manual calculation | `(transferred / total) * 100` | Simple math, no lib needed |
| Chunk header encoding | String concatenation | `DataView.setUint32()` | Binary-safe, correct encoding |

**Key insight:** The browser APIs for binary data manipulation (ArrayBuffer, DataView, Uint8Array, Blob) are mature and well-designed. Use them directly rather than wrapping in abstractions.

## Common Pitfalls

### Pitfall 1: Buffer Overflow on Large Transfers
**What goes wrong:** Sending chunks faster than network can transmit fills DataChannel buffer until it overflows, closing the channel.
**Why it happens:** DataChannel has finite buffer (~16MB on Chrome). Without backpressure, sender queues faster than drain.
**How to avoid:**
- Set `bufferedAmountLowThreshold` to 64KB
- Check `bufferedAmount` before each send
- Wait for `bufferedamountlow` event when threshold exceeded
**Warning signs:** DataChannel closes unexpectedly mid-transfer; `bufferedAmount` grows unbounded.

### Pitfall 2: Chunk Size Incompatibility
**What goes wrong:** Using chunk sizes > 16KB causes issues on Firefox-to-Chrome connections.
**Why it happens:** Different browsers implement SCTP fragmentation differently; 16KB is the safe baseline.
**How to avoid:** Always use 16KB chunks for cross-browser compatibility.
**Warning signs:** Transfers work same-browser but fail cross-browser.

### Pitfall 3: Lost Chunk Order Assumption
**What goes wrong:** Assuming chunks arrive in send order without verification.
**Why it happens:** While ordered:true DataChannel preserves order, implementation bugs can cause issues.
**How to avoid:** Include chunk index in header; reassemble by index, not arrival order.
**Warning signs:** Corrupted audio at receiver; files play incorrectly.

### Pitfall 4: Safari Blob Handling
**What goes wrong:** Safari returns Blob instead of ArrayBuffer from DataChannel onmessage.
**Why it happens:** Safari's WebRTC implementation differs from Chrome/Firefox.
**How to avoid:** Phase 1 connection.ts already handles this - ensure binary handler converts Blob if needed.
**Warning signs:** TypeError when accessing ArrayBuffer properties on received data.

### Pitfall 5: Overwriting Without Warning
**What goes wrong:** Receiver's existing project silently replaced by sync.
**Why it happens:** Sync applies changes directly to ProjectContext without user consent.
**How to avoid:**
- Check if receiver has existing cards
- Show confirmation dialog before applying sync
- Store incoming data in pendingProject until confirmed
**Warning signs:** User loses work after sync; no opportunity to cancel.

### Pitfall 6: Sync State Races
**What goes wrong:** Multiple sync attempts overlap; state becomes inconsistent.
**Why it happens:** User initiates sync, connection drops, reconnects, sync restarts without cleanup.
**How to avoid:**
- Maintain clear sync state machine
- Cancel pending sync on disconnect
- Require explicit sync initiation (not automatic on connect)
**Warning signs:** Duplicate cards; partial transfers stuck in progress.

## Code Examples

Verified patterns from official sources:

### Reading Audio from IndexedDB for Transfer
```typescript
// Source: Existing db.ts patterns
import { getAudio, getAllCards, getProject } from '@/services/db';

async function gatherProjectForSync(): Promise<{
  project: Project;
  cards: Card[];
  audioData: Map<string, { blob: Blob; size: number }>;
}> {
  const [project, cards] = await Promise.all([
    getProject(),
    getAllCards(),
  ]);

  const audioData = new Map<string, { blob: Blob; size: number }>();

  for (const card of cards) {
    const blob = await getAudio(card.id);
    if (blob) {
      audioData.set(card.id, { blob, size: blob.size });
    }
  }

  return {
    project: project || { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    cards,
    audioData,
  };
}
```

### Progress Calculation for UI
```typescript
// Source: Standard pattern
interface SyncProgress {
  phase: 'idle' | 'metadata' | 'transferring' | 'complete' | 'error';
  currentCardIndex: number;
  totalCards: number;
  currentCardBytesTransferred: number;
  currentCardBytesTotal: number;
  totalBytesTransferred: number;
  totalBytesTotal: number;
}

function calculateProgressPercent(progress: SyncProgress): number {
  if (progress.totalBytesTotal === 0) return 0;
  return Math.round((progress.totalBytesTransferred / progress.totalBytesTotal) * 100);
}

function formatProgressMessage(progress: SyncProgress): string {
  const percent = calculateProgressPercent(progress);
  return `Transferring card ${progress.currentCardIndex + 1} of ${progress.totalCards} (${percent}%)`;
}
```

### Extending WebRTCConnectionService for Backpressure
```typescript
// Source: MDN bufferedAmount docs
// Add to connection.ts class

/**
 * Get the current buffered amount for the binary channel.
 * Used for backpressure control during large transfers.
 */
getBinaryBufferedAmount(): number {
  return this.binaryChannel?.bufferedAmount ?? 0;
}

/**
 * Set the threshold for bufferedamountlow event.
 */
setBinaryBufferedAmountLowThreshold(threshold: number): void {
  if (this.binaryChannel) {
    this.binaryChannel.bufferedAmountLowThreshold = threshold;
  }
}

/**
 * Wait for binary channel buffer to drain below threshold.
 */
waitForBinaryBufferDrain(threshold: number = 64 * 1024): Promise<void> {
  return new Promise((resolve) => {
    if (!this.binaryChannel) {
      resolve();
      return;
    }

    if (this.binaryChannel.bufferedAmount <= threshold) {
      resolve();
      return;
    }

    const handler = () => {
      this.binaryChannel?.removeEventListener('bufferedamountlow', handler);
      resolve();
    };

    this.binaryChannel.bufferedAmountLowThreshold = threshold;
    this.binaryChannel.addEventListener('bufferedamountlow', handler);
  });
}
```

### Saving Received Project to IndexedDB
```typescript
// Source: Existing importProject.ts patterns
import { saveCard, saveAudio, saveProject, clearAllData } from '@/services/db';

async function commitReceivedProject(
  project: Project,
  cards: Card[],
  audioMap: Map<string, Blob>
): Promise<void> {
  // Clear existing data first
  await clearAllData();

  // Save project metadata
  await saveProject(project);

  // Save each card and its audio
  for (const card of cards) {
    await saveCard(card);
    const audio = audioMap.get(card.id);
    if (audio) {
      await saveAudio(card.id, audio);
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FileReader callbacks | blob.arrayBuffer() | ~2020 | Cleaner async code |
| Manual buffer checking | bufferedAmountLowThreshold event | Chrome 57+ | More efficient backpressure |
| Single DataChannel | Dual channels (control/binary) | Best practice | Prevents blocking |

**Deprecated/outdated:**
- `FileReader.readAsArrayBuffer()`: Still works but `blob.arrayBuffer()` is cleaner
- Large chunk sizes (>64KB): Chrome/Firefox interop issues make 16KB the safe choice

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal buffer threshold value**
   - What we know: 64KB is commonly used; too low causes excessive waiting, too high risks overflow
   - What's unclear: Optimal value may depend on network conditions
   - Recommendation: Start with 64KB, monitor performance, make configurable if needed

2. **Partial sync recovery**
   - What we know: Current design is "all or nothing" - matches existing import behavior
   - What's unclear: Whether users expect resume-on-reconnect
   - Recommendation: Defer to later phase if users request; keep Phase 2 simple

3. **Sync initiation timing**
   - What we know: Should not auto-sync on connect (could overwrite unexpectedly)
   - What's unclear: Best UX for initiating sync (button? prompt? menu?)
   - Recommendation: Explicit button/action in connection UI

## Sources

### Primary (HIGH confidence)
- [MDN: RTCDataChannel.bufferedAmount](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmount) - Buffer monitoring API
- [MDN: RTCDataChannel.bufferedAmountLowThreshold](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmountLowThreshold) - Backpressure event API
- [MDN: Blob.arrayBuffer()](https://developer.mozilla.org/en-US/docs/Web/API/Blob/arrayBuffer) - Blob conversion
- [MDN: ArrayBuffer.slice()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer/slice) - Chunking API

### Secondary (MEDIUM confidence)
- [webrtc.link: RTCDataChannel Complete Guide](https://webrtc.link/en/articles/rtcdatachannel-usage-and-message-size-limits/) - Best practices for chunk size, backpressure patterns
- [WebRTC Official Samples: File Transfer](https://webrtc.github.io/samples/src/content/datachannel/filetransfer/) - Reference implementation
- [web.dev: WebRTC DataChannels](https://web.dev/articles/webrtc-datachannels) - DataChannel fundamentals

### Tertiary (LOW confidence)
- General WebSearch results for React context patterns - verified against React docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, using established browser APIs
- Architecture: HIGH - Patterns verified against MDN and official WebRTC samples
- Pitfalls: HIGH - Buffer overflow and chunk size issues are well-documented
- Protocol design: MEDIUM - Based on best practices but specific to this application

**Research date:** 2026-01-22
**Valid until:** 2026-03-22 (60 days - WebRTC APIs are stable)
