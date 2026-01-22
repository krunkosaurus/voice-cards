# Phase 5: Connection Polish - Research

**Researched:** 2026-01-23
**Domain:** WebRTC connection resilience, ICE restart, heartbeat monitoring
**Confidence:** HIGH

## Summary

This phase focuses on making the existing WebRTC connection robust through ICE restart recovery, heartbeat monitoring, graceful disconnect, and enhanced status display. The codebase already has a solid foundation with `WebRTCConnectionService` managing dual DataChannels and `SyncContext` handling state.

The key insight is that WebRTC has built-in mechanisms for connection recovery (ICE restart via `restartIce()` method), but application-level heartbeat is still needed for reliable disconnect detection since the underlying SCTP heartbeat is not exposed to JavaScript. The existing `SyncIndicator` component will be enhanced with a popover for disconnect functionality.

**Primary recommendation:** Use native `restartIce()` API for ICE recovery, implement application-level heartbeat over the control DataChannel, and extend existing SyncIndicator with Radix Popover for disconnect controls.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native WebRTC APIs | Browser built-in | `restartIce()`, ICE state events | Standard W3C API, cross-browser since Apr 2021 |
| `@radix-ui/react-popover` | 1.1.15 | Disconnect popover UI | Already in project, accessible primitives |
| `sonner` | 2.0.7 | Toast notifications | Already in project, supports all needed toast types |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | 0.453.0 | Icons for states | Already in project, RefreshCw for reconnecting |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| App-level heartbeat | SCTP heartbeat | SCTP heartbeat not exposed to JS - can't detect stale connections |
| restartIce() | Manual createOffer with iceRestart | restartIce() is cleaner and triggers negotiationneeded automatically |

**Installation:**
No new dependencies needed - all required libraries already in project.

## Architecture Patterns

### Recommended Project Structure
```
client/src/
├── services/webrtc/
│   └── connection.ts       # Add ICE restart + heartbeat methods
├── contexts/
│   └── SyncContext.tsx     # Add reconnection state machine
├── components/
│   ├── SyncIndicator.tsx   # Enhance with popover + states
│   └── SyncPopover.tsx     # NEW: Disconnect button + info
└── types/
    └── sync.ts             # Add heartbeat message types
```

### Pattern 1: ICE Restart Flow
**What:** Use native `restartIce()` API to recover from network changes
**When to use:** When `iceConnectionState` transitions to `failed` or after timeout in `disconnected`
**Example:**
```typescript
// Source: MDN RTCPeerConnection.restartIce()
// https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/restartIce

// In connection.ts
private setupIceRestartHandler(): void {
  this.pc.addEventListener('iceconnectionstatechange', () => {
    const state = this.pc?.iceConnectionState;

    if (state === 'failed') {
      // ICE failed - initiate restart
      console.log('[WebRTC] ICE failed, restarting...');
      this.pc.restartIce();
      // negotiationneeded event fires automatically
    } else if (state === 'disconnected') {
      // May recover - wait before restart
      this.scheduleIceRestartCheck();
    }
  });

  // Handle renegotiation after restartIce()
  this.pc.addEventListener('negotiationneeded', async () => {
    if (this.isRestartingIce) {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      // Send new offer to peer via existing signaling
    }
  });
}
```

### Pattern 2: Application-Level Heartbeat
**What:** Ping/pong over control DataChannel to detect stale connections
**When to use:** Always when connected - runs invisibly in background
**Example:**
```typescript
// Source: WebRTC best practices
// Control message format matches existing protocol

interface HeartbeatPing extends ControlMessage {
  type: 'heartbeat_ping';
  sentAt: number;
}

interface HeartbeatPong extends ControlMessage {
  type: 'heartbeat_pong';
  pingId: string;
  sentAt: number;  // Echo back for RTT calculation
}

// Heartbeat service
class HeartbeatService {
  private interval = 5000;  // 5s between pings
  private timeout = 15000;  // 15s = 3 missed pings
  private pingTimer: NodeJS.Timeout | null = null;
  private lastPongTime = Date.now();

  start(sendPing: () => void, onTimeout: () => void): void {
    this.lastPongTime = Date.now();
    this.pingTimer = setInterval(() => {
      sendPing();
      if (Date.now() - this.lastPongTime > this.timeout) {
        onTimeout();
      }
    }, this.interval);
  }

  receivePong(): void {
    this.lastPongTime = Date.now();
  }

  stop(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
  }
}
```

### Pattern 3: Exponential Backoff Reconnection
**What:** Gradually increase delay between reconnection attempts
**When to use:** After ICE restart fails, before giving up
**Example:**
```typescript
// Source: Industry best practice
// Matches user decision: 3 attempts, then manual retry

class ReconnectionService {
  private baseDelay = 2000;  // 2s initial
  private maxDelay = 8000;   // 8s cap (2s -> 4s -> 8s)
  private maxAttempts = 3;
  private currentAttempt = 0;

  async attemptReconnect(
    reconnectFn: () => Promise<boolean>,
    onAttempt: (attempt: number, maxAttempts: number) => void,
    onExhausted: () => void
  ): Promise<boolean> {
    while (this.currentAttempt < this.maxAttempts) {
      this.currentAttempt++;
      onAttempt(this.currentAttempt, this.maxAttempts);

      const delay = Math.min(
        this.baseDelay * Math.pow(2, this.currentAttempt - 1),
        this.maxDelay
      );
      // Add jitter: +/- 10%
      const jitter = delay * 0.1 * (Math.random() * 2 - 1);
      await this.sleep(delay + jitter);

      const success = await reconnectFn();
      if (success) {
        this.reset();
        return true;
      }
    }
    onExhausted();
    return false;
  }

  reset(): void {
    this.currentAttempt = 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Pattern 4: Graceful Disconnect Protocol
**What:** Send explicit disconnect message before closing connection
**When to use:** User clicks disconnect button
**Example:**
```typescript
// Source: WebRTC best practices - notify peer before close

interface DisconnectMessage extends ControlMessage {
  type: 'disconnect';
  reason: 'user_initiated' | 'error';
}

// Graceful disconnect flow
async function gracefulDisconnect(connection: WebRTCConnectionService): Promise<void> {
  // 1. Send disconnect message to peer
  connection.sendControl({
    type: 'disconnect',
    reason: 'user_initiated',
  });

  // 2. Small delay to ensure message is sent
  await new Promise(resolve => setTimeout(resolve, 100));

  // 3. Close connection
  connection.disconnect();
}

// Receiver handles disconnect message
function handleDisconnectMessage(msg: DisconnectMessage): void {
  if (msg.reason === 'user_initiated') {
    // Show toast: "Peer disconnected"
    toast.info('Peer disconnected');
  }
  // Clean up local connection state
}
```

### Anti-Patterns to Avoid
- **Immediately restarting ICE on 'disconnected':** This state often self-recovers. Wait 2-3 seconds or use getStats() to confirm no data flowing.
- **Recreating RTCPeerConnection instead of ICE restart:** ICE restart preserves the connection and is much faster than full reconnection.
- **Relying on SCTP heartbeat for disconnect detection:** Not exposed to JavaScript - always implement application-level heartbeat.
- **Closing PeerConnection before DataChannels:** Prevents proper close notification to peer. Close DataChannels first.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ICE restart | Manual candidate gathering | `restartIce()` API | Browser handles complexity, triggers negotiationneeded |
| Backoff timing | Simple doubling | Add jitter (+/- 10%) | Prevents thundering herd on server |
| Toast notifications | Custom notification system | Sonner (already in project) | Handles duration, dismissal, stacking |
| Popover UI | Custom dropdown | Radix Popover (already in project) | Handles positioning, accessibility, animation |

**Key insight:** The WebRTC spec and browser implementations have matured significantly. Use native APIs (`restartIce()`, state events) rather than building custom state machines for connection recovery.

## Common Pitfalls

### Pitfall 1: Confusing disconnected vs failed ICE states
**What goes wrong:** Treating `disconnected` as permanent failure and immediately restarting
**Why it happens:** Names suggest finality, but `disconnected` is temporary
**How to avoid:**
- `disconnected` = temporary, may self-recover in seconds
- `failed` = permanent, requires ICE restart
- Wait 2-3s on `disconnected` before taking action
**Warning signs:** Connection recovers then immediately restarts again

### Pitfall 2: Not handling renegotiation after restartIce()
**What goes wrong:** Calling `restartIce()` but forgetting the SDP exchange
**Why it happens:** `restartIce()` just sets a flag - still need to create and exchange new offer/answer
**How to avoid:** Listen for `negotiationneeded` event after `restartIce()` call
**Warning signs:** ICE restart never completes, connection stays in checking state

### Pitfall 3: ICE restart with manual SDP exchange
**What goes wrong:** ICE restart requires new SDP exchange but app uses manual copy/paste
**Why it happens:** This project uses clipboard-based SDP sharing, not real-time signaling
**How to avoid:** For manual exchange, ICE restart isn't practical - instead:
  - Detect network-level failures (ICE failed)
  - Show "Connection lost" state
  - Offer manual reconnect: "Copy new code to reconnect"
**Warning signs:** Expecting automatic recovery but user has no way to share new SDP

### Pitfall 4: Heartbeat blocking data transfer
**What goes wrong:** Heartbeat messages delayed when large audio chunks being sent
**Why it happens:** Single DataChannel processes messages in order
**How to avoid:** This project already uses dual DataChannels - send heartbeat on control channel, not binary
**Warning signs:** False timeouts during audio sync

### Pitfall 5: Not distinguishing disconnect reasons
**What goes wrong:** Auto-reconnecting when peer explicitly disconnected
**Why it happens:** All disconnects look the same without explicit messaging
**How to avoid:** Send `disconnect` message with reason before closing, only auto-reconnect on network issues
**Warning signs:** User disconnects, other peer immediately tries to reconnect

## Code Examples

Verified patterns from official sources:

### ICE State Monitoring
```typescript
// Source: MDN iceConnectionState
// https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceConnectionState

pc.addEventListener('iceconnectionstatechange', () => {
  switch (pc.iceConnectionState) {
    case 'connected':
    case 'completed':
      // Connection established
      break;
    case 'disconnected':
      // Temporary - may recover
      // Start timeout to detect if it becomes failed
      break;
    case 'failed':
      // Permanent - need ICE restart
      pc.restartIce();
      break;
    case 'closed':
      // Connection terminated
      break;
  }
});
```

### Toast for Connection Events
```typescript
// Source: Sonner API
// https://sonner.emilkowal.ski/toast

// Connection lost - auto-dismiss after default 4s
toast.error('Connection lost', {
  description: 'Attempting to reconnect...',
});

// Reconnection attempt
toast.info('Reconnecting (2/3)...');

// Peer disconnected - explicit notification
toast.info('Peer disconnected');

// Reconnected successfully
toast.success('Reconnected');
```

### Popover for Disconnect Button
```typescript
// Source: Radix Popover (already in project)
// client/src/components/ui/popover.tsx

import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

function SyncIndicatorWithPopover({ state, onDisconnect }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge className="cursor-pointer">
          {/* SyncIndicator badge content */}
        </Badge>
      </PopoverTrigger>
      <PopoverContent>
        <div className="space-y-3">
          <div className="text-sm">
            <p>Connected for: {formatDuration(connectedAt)}</p>
            <p>Role: {role === 'editor' ? 'Editing' : 'Viewing'}</p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDisconnect}
          >
            Disconnect
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `createOffer({iceRestart: true})` | `restartIce()` method | 2020 (Safari), 2017 (Chrome/Firefox) | Simpler API, automatic negotiationneeded |
| Custom reconnection logic | Browser-native ICE restart | Ongoing | Less code, more reliable |
| WebSocket heartbeat | DataChannel heartbeat | N/A | Same pattern, different transport |

**Deprecated/outdated:**
- `createOffer({iceRestart: true})` still works but `restartIce()` is preferred
- Older tutorials may show manual ICE candidate trickling - this project uses complete SDP exchange

## Open Questions

Things that couldn't be fully resolved:

1. **ICE restart with manual SDP exchange**
   - What we know: ICE restart requires new SDP exchange; this project uses clipboard-based sharing
   - What's unclear: Whether to attempt automatic ICE restart or just show "reconnect" UI
   - Recommendation: For network-level failures, show "Connection lost" state with "Try Again" button that generates new offer code. True automatic recovery isn't feasible without real-time signaling.

2. **Reconnection after brief disconnect**
   - What we know: User decision says "resume where left off" after brief disconnect
   - What's unclear: What counts as "brief"? How to distinguish recoverable vs permanent?
   - Recommendation: Use 15-second timeout (3 missed heartbeats). If connection recovers within that window via ICE negotiation, no re-sync needed. If timeout exceeded, trigger full re-sync.

## Sources

### Primary (HIGH confidence)
- [MDN: RTCPeerConnection.restartIce()](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/restartIce) - ICE restart API
- [MDN: iceConnectionState](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceConnectionState) - State machine reference
- [MDN: createOffer()](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createOffer) - iceRestart option docs
- [Sonner Documentation](https://sonner.emilkowal.ski/toast) - Toast API

### Secondary (MEDIUM confidence)
- [WebRTC Samples - ICE Restart](https://webrtc.github.io/samples/src/content/peerconnection/restart-ice/) - Reference implementation
- [Better Stack - Exponential Backoff](https://betterstack.com/community/guides/monitoring/exponential-backoff/) - Backoff patterns
- [Medium - ICE restarts](https://medium.com/@fippo/ice-restarts-5d759caceda6) - Real-world analysis (2/3 success rate)

### Tertiary (LOW confidence)
- Community discussions on heartbeat intervals (5s ping recommended)
- DataChannel close event ordering (close channels before peer connection)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in project, native WebRTC APIs well-documented
- Architecture: HIGH - Patterns from official MDN docs and WebRTC samples
- Pitfalls: MEDIUM - Based on best practices and known issues, but manual SDP exchange is uncommon

**Research date:** 2026-01-23
**Valid until:** 2026-02-23 (30 days - WebRTC APIs are stable)
