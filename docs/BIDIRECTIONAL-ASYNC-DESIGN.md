# Bidirectional Async Reply Design - Engineering Guidance

**Issue:** The current broker only supports synchronous reply patterns (long-polling). When Bob replies to Alice's message, the reply is stored on the original ticket but **no reverse ticket is created** for async delivery back to Alice.

**Date:** 2025-01-22
**Status:** Design gap identified, needs implementation

---

## Current Flow (Broken for Async)

```
Alice sends message
  → POST /agents/Bob/send
  → Broker creates ticket T1 (targetAgent: Bob, originAgent: Alice)
  → Bob's watcher polls and receives T1
  → Bob sees message in tmux ✅

Bob replies
  → POST /replies { ticketId: T1, payload: "response" }
  → Broker stores reply on T1 ✅
  → Alice's watcher polls... nothing ❌
  → Alice must manually poll GET /replies/T1 ❌
```

**Problem:** Alice never receives Bob's reply via her message watcher because no ticket is created for her.

---

## Required Flow (True Bidirectional)

```
Alice sends message
  → POST /agents/Bob/send
  → Broker creates ticket T1 (targetAgent: Bob, originAgent: Alice)
  → Bob's watcher receives T1 ✅

Bob replies
  → POST /replies { ticketId: T1, payload: "response" }
  → Broker stores reply on T1 ✅
  → Broker creates REVERSE ticket T2 (targetAgent: Alice, originAgent: Bob) ✅
  → Alice's watcher receives T2 ✅
```

---

## Implementation Plan

### Option 1: Reverse Ticket Creation (Recommended)

**Location:** `broker/src/routes/messages.js` - `postReply()` function

**Changes:**
1. When reply is posted, fetch the original ticket to get `originAgent`
2. Create a new ticket going in reverse direction
3. Mark the reverse ticket with metadata: `{ isReply: true, replyTo: originalTicketId }`

**Code Pattern:**
```javascript
async postReply(req, res) {
  const { ticketId, payload, metadata } = body;

  // Get original ticket
  const originalTicket = ticketStore.get(ticketId);

  // Store reply on original ticket (existing behavior)
  ticketStore.respond(ticketId, payload, metadata);

  // NEW: Create reverse ticket for async delivery
  ticketStore.create({
    targetAgent: originalTicket.originAgent,  // Reply goes back to sender
    originAgent: originalTicket.targetAgent,  // From the responder
    payload: payload,
    metadata: {
      ...metadata,
      isReply: true,
      replyTo: ticketId
    },
    expectReply: false
  });

  return jsonResponse(res, 204);
}
```

**Pros:**
- Minimal changes
- Works with existing watcher infrastructure
- Maintains Store & Forward pattern
- No polling needed

**Cons:**
- Creates extra tickets (but that's the point of Store & Forward)

---

### Option 2: Hybrid Approach

Keep long-polling for `awaitResponse: true` cases, but also create reverse tickets for full async support.

**Logic:**
```javascript
if (originalTicket.expectReply) {
  // Create reverse ticket for async delivery
  ticketStore.create({ ... });

  // Also notify long-poll waiters (existing behavior)
  ticketStore.notifyWaiters(ticketId, payload);
}
```

This supports both patterns:
- Agents using `send_message(awaitResponse: true)` get immediate response via long-poll
- Agents using `send_message(awaitResponse: false)` get reply via watcher

---

### Option 3: WebSocket Push (Future)

For real-time push, but requires more infrastructure:
- WebSocket connections per agent
- Connection management
- Reconnection logic
- Not needed for MVP - reverse tickets are simpler

---

## Database Considerations

**Current Schema:** `tickets` table has `originAgent` field ✅

This already exists! The schema supports this pattern:

```sql
CREATE TABLE tickets (
  ticket_id TEXT PRIMARY KEY,
  target_agent TEXT NOT NULL,
  origin_agent TEXT,  -- ← Already tracked!
  payload TEXT NOT NULL,
  metadata TEXT,
  status TEXT,
  response TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

No schema changes needed.

---

## MCP Tool Impact

**`send_message` tool needs update:**

Current behavior:
```javascript
// awaitResponse: true → uses long-polling
// awaitResponse: false → fire-and-forget (no way to get reply!)
```

New behavior with reverse tickets:
```javascript
// awaitResponse: true → uses long-polling (unchanged)
// awaitResponse: false → reply comes via watcher as new ticket
```

**Agent code doesn't need to change** - replies just appear as regular messages in their pending tickets queue.

---

## Testing Plan

### Test 1: Basic Bidirectional
```bash
# Spawn Alice and Bob
./bin/spawn-agent.sh --name Alice
./bin/spawn-agent.sh --name Bob

# Alice sends message (awaitResponse: false)
# Verify Bob receives ticket T1

# Bob replies to T1
# Verify Alice receives reverse ticket T2
# Verify T2 has metadata: { isReply: true, replyTo: T1 }
```

### Test 2: Conversation Thread
```bash
# Alice → Bob (T1)
# Bob → Alice (T2, reply to T1)
# Alice → Bob (T3, reply to T2)
# Bob → Alice (T4, reply to T3)

# Verify all messages delivered
# Verify reply chain is trackable via metadata
```

### Test 3: Performance
```bash
# 10 agents sending messages back and forth
# Verify no ticket leaks
# Verify cleanup works
# Verify latency remains < 10s
```

---

## Breaking Changes

**None.** This is additive:
- Existing long-polling still works
- Adds new async delivery path
- Agents using `awaitResponse: false` finally get replies

---

## Rollout Plan

1. **Implement reverse ticket creation** in `postReply()`
2. **Add metadata** (`isReply`, `replyTo`) to link conversations
3. **Test with 2-agent scenario** (#18 in issues)
4. **Update MCP tool docs** to explain both patterns
5. **Optional:** Add `GET /threads/:threadId` to reconstruct conversation from reply links

---

## Code Locations

**Files to modify:**
- `broker/src/routes/messages.js` - Add reverse ticket creation in `postReply()`

**Files to test:**
- `tests/integration/two-agent-conversation.test.js` - Verify bidirectional flow

**No changes needed:**
- `broker/src/models/TicketStore.js` - Already has everything needed
- `broker/src/db/TicketRepository.js` - Schema supports it
- `mcp/` - Message watcher will automatically deliver reverse tickets

---

## Decision Needed

**Recommendation:** Implement Option 1 (Reverse Ticket Creation)

**Why:**
- Simplest implementation (~10 lines of code)
- No schema changes
- Works with existing infrastructure
- True Store & Forward pattern
- Aligns with original POC intent

**Alternative:** Do nothing, document that replies require manual polling
- Not recommended - breaks async workflow patterns

---

## Implementation Estimate

**Effort:** 2-3 hours
- 30 min: Code changes
- 1 hour: Testing
- 1 hour: Integration test updates

**Assigned to:** Backend team
**Priority:** High (blocks async workflows)
**Related Issue:** #18 (Two-Agent Conversation test)

---

## Questions for Engineering Team

1. Should reverse tickets have `expectReply: false` by default, or inherit from original?
2. Should we add a cleanup rule for replied tickets (since reply is now stored in reverse ticket too)?
3. Do we want to track conversation threads explicitly, or just via metadata links?
4. Should `isReply` tickets be filtered differently in watcher delivery?

---

**Next Steps:**
1. Review this design with team
2. Get approval on Option 1
3. Create implementation branch
4. Write test first (TDD)
5. Implement reverse ticket creation
6. Validate with integration tests
7. Merge to main

---

*This design gap has existed since the POC. Now is the time to fix it properly.*
