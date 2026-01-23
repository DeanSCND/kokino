# Manual MCP Integration Test

These are tests that require human intervention because they involve configuring `.claude/mcp.json` and interacting with Claude Code sessions.

## Prerequisites

✅ All automated tests passed (build, broker, registration, watcher, spawn)
✅ Broker running at `http://127.0.0.1:5050`
✅ Claude Code CLI (`cld`) installed

## Test 1: Configure MCP Server for Alice

### Create Alice's MCP Configuration

```bash
# Create .claude directory in Alice's workspace
mkdir -p ~/test-kokino-alice/.claude

# Create MCP configuration
cat > ~/test-kokino-alice/.claude/mcp.json << 'EOF'
{
  "mcpServers": {
    "agent-bridge": {
      "command": "node",
      "args": ["/Users/deanskelton/Devlopment/agent-collab/kokino/mcp/build/index.js"],
      "env": {
        "BRIDGE_BROKER_URL": "http://127.0.0.1:5050",
        "AGENT_ID": "Alice"
      }
    }
  }
}
EOF
```

**⚠️ IMPORTANT:** Update the absolute path in `args` to match your kokino location!

### Spawn Alice

```bash
cd ~/Devlopment/agent-collab/kokino
./bin/spawn-agent.sh --name Alice --type claude-code --role frontend-engineer --cwd ~/test-kokino-alice
```

### Attach and Verify MCP Tools

```bash
tmux attach -t dev-Alice
```

In Claude Code, ask:
```
Can you list all available MCP tools?
```

**Expected:** You should see 6 tools from agent-bridge:
- `send_message`
- `await_reply`
- `post_reply`
- `co_workers`
- `list_agents`
- `register_agent`

**✅ Pass if:** All 6 tools are listed
**❌ Fail if:** Tools not found or error occurs

Detach: `Ctrl+B` then `D`

---

## Test 2: Configure MCP Server for Bob

### Create Bob's MCP Configuration

```bash
mkdir -p ~/test-kokino-bob/.claude

cat > ~/test-kokino-bob/.claude/mcp.json << 'EOF'
{
  "mcpServers": {
    "agent-bridge": {
      "command": "node",
      "args": ["/Users/deanskelton/Devlopment/agent-collab/kokino/mcp/build/index.js"],
      "env": {
        "BRIDGE_BROKER_URL": "http://127.0.0.1:5050",
        "AGENT_ID": "Bob"
      }
    }
  }
}
EOF
```

### Spawn Bob

```bash
./bin/spawn-agent.sh --name Bob --type claude-code --role backend-engineer --cwd ~/test-kokino-bob
```

---

## Test 3: Alice Discovers Bob

Attach to Alice:
```bash
tmux attach -t dev-Alice
```

Ask Alice:
```
Can you use the co_workers tool to see who else is online?
```

**Expected:** Alice should see Bob in the list with his role

**✅ Pass if:** Bob appears in co_workers output
**❌ Fail if:** Bob not found or error occurs

Detach: `Ctrl+B` then `D`

---

## Test 4: Alice Sends Message to Bob

Attach to Alice:
```bash
tmux attach -t dev-Alice
```

Ask Alice:
```
Please send a message to Bob asking him to create a simple "Hello World" API endpoint.

Use the send_message tool with:
- agentId: "Bob"
- payload: "Can you create a simple GET /api/hello endpoint that returns {message: 'Hello World'}?"
```

**Expected:**
1. Alice calls `send_message` successfully
2. Returns a `ticketId`
3. No errors

**✅ Pass if:** Message sent, ticketId returned
**❌ Fail if:** Error or tool not found

Note the ticketId from the response.

Detach: `Ctrl+B` then `D`

---

## Test 5: Bob Receives Message via Watcher

Wait 5-10 seconds for the message watcher to poll, then attach to Bob:

```bash
tmux attach -t dev-Bob
```

**Expected:** You should see a message injected that looks like:

```
# =========================================
# 📬 NEW MESSAGE FROM: Alice
# =========================================
# Ticket-ID: <some-ticket-id>
#
Can you create a simple GET /api/hello endpoint that returns {message: 'Hello World'}?
#
# ---
# To reply, use the agent-bridge MCP tool:
#   post_reply(ticketId="<ticket-id>", payload="your response")
# =========================================
```

**✅ Pass if:** Message appears in Bob's terminal via tmux injection
**❌ Fail if:** No message appears after 10 seconds

Check watcher logs if message doesn't appear:
```bash
tail -20 logs/watcher-Bob.log
```

Detach: `Ctrl+B` then `D`

---

## Test 6: Bob Replies via MCP Tool

Attach to Bob:
```bash
tmux attach -t dev-Bob
```

Ask Bob:
```
I see a message from Alice asking for a hello endpoint. Can you reply to the ticket using the post_reply tool?

Use:
- ticketId: "<the-ticket-id-from-message>"
- payload: "I'll create the GET /api/hello endpoint. It will return {message: 'Hello World'} as JSON."
```

**Expected:**
1. Bob calls `post_reply` with correct ticketId
2. Tool executes successfully
3. Returns success status

**✅ Pass if:** Reply posted successfully
**❌ Fail if:** Error or tool not found

Detach: `Ctrl+B` then `D`

---

## Test 7: Alice Receives Reply via Watcher

Wait 5-10 seconds, then attach to Alice:

```bash
tmux attach -t dev-Alice
```

**Expected:** You should see a reply injected:

```
# =========================================
# ↩️ REPLY TO YOUR MESSAGE
# =========================================
# Ticket-ID: <ticket-id>
#
I'll create the GET /api/hello endpoint. It will return {message: 'Hello World'} as JSON.
# =========================================
```

**✅ Pass if:** Reply appears in Alice's terminal
**❌ Fail if:** No reply after 10 seconds

Detach: `Ctrl+B` then `D`

---

## Test 8: Verify list_agents Tool

Attach to either Alice or Bob:

Ask:
```
Can you use the list_agents tool to show all registered agents with their metadata?
```

**Expected:**
1. Tool returns JSON array of agents
2. Both Alice and Bob should be in the list
3. Metadata includes cwd, session, paneId, capabilities

**✅ Pass if:** Both agents listed with correct metadata
**❌ Fail if:** Missing agents or incomplete data

---

## Test 9: Test Session Death Auto-Exit

### Kill Bob's Session

```bash
tmux kill-session -t dev-Bob
```

### Check Bob's Watcher

Wait 5-10 seconds, then check if watcher exited:

```bash
ps aux | grep "message-watcher.*Bob" | grep -v grep
```

**Expected:** No watcher process found (it auto-exited)

Check logs:
```bash
tail logs/watcher-Bob.log
```

**Expected:** Should see message like:
```
[watcher] ❌ Tmux session 'dev-Bob' died, exiting...
```

**✅ Pass if:** Watcher auto-exited when session died
**❌ Fail if:** Watcher still running as zombie

---

## Cleanup

```bash
# Kill Alice's watcher (get PID from spawn output or ps)
ps aux | grep message-watcher
kill <ALICE_WATCHER_PID>

# Kill Alice's session
tmux kill-session -t dev-Alice

# Remove test directories
rm -rf ~/test-kokino-alice ~/test-kokino-bob

# Verify no zombie watchers
ps aux | grep message-watcher
```

---

## Success Criteria Summary

All tests should pass:

- ✅ MCP tools appear in Claude Code
- ✅ co_workers discovers other agents
- ✅ send_message works from Claude prompt
- ✅ Message watcher injects messages into tmux
- ✅ post_reply works from Claude prompt
- ✅ Reply watcher injects replies
- ✅ list_agents shows full metadata
- ✅ Watcher auto-exits on session death

---

## Troubleshooting

### MCP Tools Not Appearing

1. Check `.claude/mcp.json` has correct absolute path
2. Restart Claude Code: exit and re-run `cld`
3. Check MCP server logs: `~/.claude/logs/` (if available)
4. Verify broker running: `curl http://127.0.0.1:5050/health`

### Messages Not Appearing

1. Check watcher is running: `ps aux | grep message-watcher`
2. Check watcher logs: `tail -f logs/watcher-<name>.log`
3. Verify agent registered: `curl http://127.0.0.1:5050/agents | jq`
4. Check broker has pending tickets: `curl http://127.0.0.1:5050/agents/<name>/tickets/pending`

### Terminal Injection Issues

1. Ensure using tmux (not standard terminal)
2. Check pane ID is correct: `tmux list-panes -t dev-<name> -F "#{pane_id}"`
3. Test manual injection: `tmux send-keys -t <pane-id> "test" Enter`
4. Check terminal is at prompt (not running another command)

---

**After completing manual tests, report results back for final validation!**
