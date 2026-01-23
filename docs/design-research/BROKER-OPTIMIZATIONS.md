# Broker Performance Optimizations (January 2025)

*Real-time capture of critical broker latency fixes and async messaging improvements*

## The Timeout Crisis

### Problem Discovery
Jerry (Claude) reported timeouts when sending messages through the agent-bridge, but the issue wasn't actual delivery time—it was **event-loop latency** in the broker.

### Root Causes Identified

#### 1. Synchronous tmux Checks
```javascript
// PROBLEMATIC: Synchronous process spawning
function checkAgentStatus(agentId) {
  const tmux = spawnSync('tmux', ['list-sessions']);  // 50-100ms blocking!
  // ... parse output
}
```
Each tmux check takes 50-100ms. With multiple agents hitting the broker simultaneously, these "mini-waits" stack up.

#### 2. Long-Poll Contention
- Previous 55-second long-polls were holding connections open
- While Node.js is async, many pending requests lead to:
  - Socket exhaustion
  - Subtle delays in processing "instant" /send requests
  - Event loop congestion

#### 3. Claude's Sensitivity
Claude Code is extremely sensitive to tool-call latency:
- Expects response within ~3 seconds
- Interprets delays as failures
- May hit internal timeout barriers

## The "Store and Forward" Solution

### Core Principle: Pure Message Queue
Treat the broker as a high-speed, zero-logic message queue:

```javascript
// BEFORE: Complex synchronous logic
async function sendMessage(agentId, payload) {
  const isRegistered = await checkAgentRegistered(agentId);  // tmux check
  if (!isRegistered) throw new Error('Agent not found');
  const status = await getAgentStatus(agentId);              // another tmux check
  if (status !== 'online') throw new Error('Agent offline');
  // ... finally store message
}

// AFTER: Instant acknowledgment
async function sendMessage(agentId, payload) {
  const ticketId = generateUUID();
  messageQueue.push({ ticketId, agentId, payload, timestamp: Date.now() });
  return { ticketId };  // Return immediately!
}
```

### The "Mailbox Model" Architecture

#### Phase 1: Receive (< 5ms)
```javascript
POST /agents/{id}/send
{
  payload: "message content"
}

// Broker does ONLY:
1. Generate UUID
2. Push to in-memory array
3. Return 201 Created with ticketId

Response time: ~10-20ms total
```

#### Phase 2: Log (Background)
```javascript
// Async background process
setImmediate(() => {
  logMessage(ticket);     // Non-blocking
  updateMetrics(ticket);  // Non-blocking
});
```

#### Phase 3: Acknowledge
Instant response with ticketId serves as receipt, not delivery confirmation.

#### Phase 4: Send (Background Delivery)
```javascript
// Message watchers poll independently
async function pollForMessages() {
  const pending = await broker.getPending(agentId);
  // Watchers handle actual delivery
}
```

## Implementation Changes

### 1. Remove tmux from Hot Path
```javascript
// REMOVED from /send and /receive:
- tmux list-sessions
- tmux capture-pane
- tmux has-session

// These now happen ONLY in background workers
```

### 2. Stateful Mailbox (Accept All Messages)
```javascript
// OLD: Reject if recipient not registered
if (!agents[recipientId]) {
  return res.status(404).json({ error: 'Agent not found' });
}

// NEW: Queue for future delivery
tickets[ticketId] = {
  recipient: recipientId,
  payload: payload,
  status: 'pending',
  attempts: 0
};
// Accept even if agent doesn't exist yet!
```

### 3. Message Watcher Enhancements

#### Concurrency Protection
```javascript
async function isTerminalReady(session, pane) {
  // Check if terminal is at a prompt before injection
  const output = await capturePane(session, pane);
  const promptRegex = /^>\s*|[$%#>]\s*$/;
  return lines.some(line => promptRegex.test(line));
}

// Wait for terminal to be ready
let ready = false;
let attempts = 0;
while (!ready && attempts < 12) {
  ready = await isTerminalReady(config.session, config.pane);
  if (!ready) {
    await new Promise(r => setTimeout(r, 5000));
  }
}
```

#### Atomic Buffer Injection
```javascript
// OLD: Character-by-character injection (slow, unreliable)
tmux send-keys -l "long message text"

// NEW: Atomic buffer load
const tmuxLoad = spawn('tmux', ['load-buffer', '-']);
tmuxLoad.stdin.write(text);
tmuxLoad.stdin.end();
// Then paste as single operation
spawn('tmux', ['paste-buffer', '-t', target]);
```

#### Post-Injection Cooldown
```javascript
// After successful injection
await new Promise(r => setTimeout(r, 2000));
// Ensures shell returns to prompt before next message
```

### 4. UI Observatory Auto-Resume
```javascript
// Canvas.jsx enhancement: Auto-discover running sessions
React.useEffect(() => {
  const interval = setInterval(async () => {
    const activeAgents = await fetch('http://127.0.0.1:5050/agents');

    // Add nodes for agents that are online but not on canvas
    activeAgents.forEach(agent => {
      if (agent.status === 'online' && !currentNodes.some(n => n.data.name === agent.agentId)) {
        // Auto-add to canvas with "Session resumed" status
        const newNode = {
          id: `resumed-${agent.agentId}`,
          data: {
            name: agent.agentId,
            status: 'active',
            task: 'Session resumed'
          }
        };
        newNodes.push(newNode);
      }
    });
  }, 2000);
}, []);
```

## Performance Metrics

### Before Optimizations
- **POST /send latency**: 200-500ms (with spikes to 60s+)
- **Message delivery**: 5-10 seconds
- **Timeout rate**: ~15% of messages
- **Event loop blocking**: Frequent

### After Optimizations
- **POST /send latency**: 10-20ms (consistent)
- **Message delivery**: 2-3 seconds
- **Timeout rate**: < 1%
- **Event loop blocking**: None

## Key Insights

### 1. "Fire and Forget" is Essential
Agents need immediate acknowledgment. Any synchronous work in the request path causes cascading timeouts.

### 2. Terminal State Management
Checking if terminal is "ready" before injection prevents message corruption and ensures clean delivery.

### 3. Atomic Operations Beat Streaming
Using tmux buffers for atomic paste is far more reliable than character-by-character injection.

### 4. Background Workers for Everything
Move ALL heavy operations (tmux checks, logging, status updates) to background processes.

### 5. Accept First, Validate Later
The "Stateful Mailbox" pattern—accepting messages even for offline/non-existent agents—prevents retry storms and simplifies client logic.

## The Final Architecture

```
┌──────────┐     10ms      ┌────────┐
│  Agent   │──────POST────>│ Broker │
│ (Claude) │<───ticketId───│  HOT   │
└──────────┘                └────────┘
                                │
                           (background)
                                ↓
                         ┌──────────────┐
                         │   Message    │
                         │    Queue     │
                         └──────────────┘
                                ↓
                         ┌──────────────┐
                         │   Watcher    │
                         │   (Polls)    │
                         └──────────────┘
                                ↓
                         ┌──────────────┐
                         │ tmux Session │
                         │  (Delivery)  │
                         └──────────────┘
```

## Code Evolution Timeline

### message-watcher.js Improvements
1. **Terminal Readiness Detection** (lines 136-154)
2. **Atomic Buffer Injection** (lines 44-92)
3. **Concurrency Protection** (lines 227-241)
4. **Post-Injection Cooldown** (line 205)
5. **Ticket Acknowledgment** (lines 123-134)

### Canvas.jsx Auto-Resume Feature
1. **Session Discovery** (lines 78-150)
2. **Name-to-Role Mapping** (lines 80-89)
3. **Auto-Add Online Agents** (lines 103-120)
4. **Status Synchronization** (lines 123-139)

## Lessons for Distributed Systems

1. **Synchronous I/O in request paths is death** - Even 50ms adds up
2. **Queues should be dumb** - Smart logic belongs in workers
3. **Acknowledge fast, process slow** - Clients care about acknowledgment, not completion
4. **Terminals are stateful** - Must check readiness before injection
5. **Buffers beat streams** - Atomic operations prevent corruption
6. **UI should self-heal** - Auto-discover and resume existing sessions

---

*"The fastest code is the code that doesn't run in the request path."* - Discovered during Agent-Collab optimization