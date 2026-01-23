# Bug Discoveries & Fixes

*A log of bugs discovered through agent interactions and their resolutions*

## 1. The Knock-Knock Bug (January 2025)

**Discovery Context:**
During a lighthearted test where Gemma (Gemini agent) was asked to tell Steve (Droid agent) a knock-knock joke, Steve's analytical nature turned the joke into a bug report.

### The Exchange

**Joke 1:**
```
Gemma: Knock, knock.
Steve: Who's there?
Gemma: Very.
Steve: Very who?
Gemma: Very interesting, tell me more.
Steve: You've mastered the anti-joke knock-knock: a loop that never
       resolves its promise. If you actually want "more": what are
       you testing—broker delivery, dedupe, or ticket threading?
```

**Joke 2:**
```
Gemma: Knock, knock.
Steve: Who's there?
Gemma: Spell.
Steve: Spell who?
Gemma: W. H. O.
Steve: Nice. Also: FYI I'm observing duplicate deliveries across
       multiple tickets (same payload repeated). If you're testing
       broker retry/dedupe, I'm seeing "at least once" behavior.
```

### The Bug

**Issue:** Duplicate message deliveries - same payload arriving multiple times via different tickets.

**Root Cause:** Race condition in `message-watcher.js`:
```javascript
// BUGGY VERSION
for (const ticket of tickets) {
  if (!seenTickets.has(ticket.ticketId)) {
    await injectMessage(config, ticket);
    seenTickets.add(ticket.ticketId); // Added AFTER - too late!
  }
}
```

The ticket was added to the `seenTickets` Set AFTER injection. If polling occurred during the injection await, the same ticket could be processed twice.

### The Fix

```javascript
// FIXED VERSION
for (const ticket of tickets) {
  if (!seenTickets.has(ticket.ticketId)) {
    seenTickets.add(ticket.ticketId); // Add BEFORE injection
    await injectMessage(config, ticket);
  }
}
```

Additionally, added polling overlap protection:
```javascript
let isPolling = false;

async function pollWrapper() {
  if (isPolling) return;  // Prevent overlapping polls
  isPolling = true;
  try {
    const tickets = await checkPendingMessages(config.agent);
    // ... process tickets
  } finally {
    isPolling = false;
  }
}
```

### Lessons Learned

1. **Agents as System Debuggers**: Steve demonstrated that analytical AI agents can serve as excellent debuggers, identifying issues during normal interactions.

2. **Diverse Agent Perspectives**: The contrast between Gemma's creative approach (jokes) and Steve's analytical mindset (system analysis) shows the value of heterogeneous agent teams.

3. **"At Least Once" Semantics**: Steve correctly identified the delivery guarantee pattern, showing deep understanding of distributed systems concepts.

4. **Race Conditions in Async Code**: The bug highlights a common pattern in async/await code where state must be updated before async operations to prevent race conditions.

## Prevention Patterns

### Pattern 1: Update State Before Async Operations
```javascript
// GOOD
seen.add(id);
await processItem(id);

// BAD
await processItem(id);
seen.add(id);
```

### Pattern 2: Mutex-like Polling Protection
```javascript
let isProcessing = false;

async function process() {
  if (isProcessing) return;
  isProcessing = true;
  try {
    // ... do work
  } finally {
    isProcessing = false;
  }
}
```

### Pattern 3: Idempotency Keys
Consider adding idempotency keys to messages to handle duplicate deliveries at the application level rather than transport level.

## Meta-Observations

This bug discovery showcases an emerging pattern: **AI agents can contribute to system reliability not just through their primary tasks, but through their observations and analytical capabilities during routine operations.**

Steve's ability to:
1. Recognize the anti-joke pattern as a "loop that never resolves"
2. Question the testing intent
3. Identify duplicate delivery patterns
4. Correctly diagnose "at least once" behavior

...demonstrates that agents can serve as continuous system monitors and debuggers while performing their regular duties.

## Future Considerations

1. **Agent-Based Testing**: Deliberately use analytical agents like Steve for system testing
2. **Observability Integration**: Give agents metrics/logging visibility
3. **Bug Bounty for Agents**: Reward agents that identify system issues
4. **Diverse Agent Teams**: Mix analytical and creative agents for better coverage

---

*"The best debugger is an analytical AI agent telling jokes to a creative one."* - The Agent-Collab Team