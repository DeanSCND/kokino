# Quick Start Guide

> **Get Productive with Kokino in 30 Minutes**
>
> **Last Updated:** 2026-01-26

---

## What You'll Learn

By the end of this guide, you will:
- ✅ Have Kokino running locally (broker + UI)
- ✅ Create your first agent configuration
- ✅ Start an agent and send it a task
- ✅ View agent output in the UI
- ✅ Understand basic agent communication patterns

**Prerequisites:**
- macOS (tested), Linux (should work), Windows (not tested)
- Node.js 20+ installed
- Basic terminal/command line knowledge

---

## Step 1: Clone and Setup (5 minutes)

### Clone Repository
```bash
git clone https://github.com/yourusername/kokino.git
cd kokino
```

### Install Dependencies
```bash
# Install all workspaces (broker, ui, mcp)
npm install

# Verify installation
node --version  # Should be 20.x.x
```

**Expected output:**
```
added 234 packages in 15s
```

---

## Step 2: Start the Broker (2 minutes)

The broker is the message routing service that coordinates agents.

```bash
# Terminal 1: Start broker
cd broker
npm start
```

**Expected output:**
```
Kokino Broker starting...
✓ Database initialized (kokino.db)
✓ Migrations applied (10 files)
✓ HTTP server listening on http://127.0.0.1:5050
✓ WebSocket server ready
Broker ready!
```

**Verify broker is running:**
```bash
# In a new terminal
curl http://127.0.0.1:5050/health

# Expected response:
{"status":"healthy","timestamp":"2026-01-26T...","uptime":12,"agents":0}
```

**Troubleshooting:**
- ❌ **Port 5050 already in use**: Change `BROKER_PORT` in `.env` or kill existing process
- ❌ **Permission denied on kokino.db**: Check file permissions, delete and restart
- ❌ **Module not found**: Run `npm install` in broker directory

---

## Step 3: Start the UI (2 minutes)

The UI provides a visual canvas for orchestrating agent teams.

```bash
# Terminal 2: Start UI
cd ui
npm run dev
```

**Expected output:**
```
VITE v5.4.11  ready in 234 ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
➜  press h + enter to show help
```

**Open UI in browser:**
```
http://localhost:5173
```

**You should see:**
- Blank canvas with grid background
- Sidebar with "Create Agent" button
- No agents yet (expected)

---

## Step 4: Install Claude Code CLI (5 minutes)

**Skip this step if you already have Claude Code installed.**

### Option 1: Download from Claude.ai
1. Visit [https://claude.ai/download](https://claude.ai/download)
2. Download Claude Code for your OS
3. Follow installation instructions
4. Verify installation:
```bash
claude --version
# Should output: claude-code version X.Y.Z
```

### Option 2: macOS via Homebrew (if available)
```bash
brew install claude-code
claude --version
```

**Authentication:**
```bash
# Log in to Claude Code
claude auth login

# Follow prompts to authenticate with Anthropic
```

**Verify authentication:**
```bash
claude auth status
# Should show: Authenticated as <your-email>
```

---

## Step 5: Configure MCP Server (3 minutes)

Agents use the MCP (Model Context Protocol) server to communicate with each other.

### Build MCP Server
```bash
cd mcp
npm install
npm run build  # → Creates build/index.js
```

### Configure Claude Code
Create `.claude/mcp.json` in your home directory:

```bash
# Create directory if it doesn't exist
mkdir -p ~/.claude

# Create MCP config
cat > ~/.claude/mcp.json <<'MCPCONFIG'
{
  "mcpServers": {
    "agent-bridge": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/kokino/mcp/build/index.js"],
      "env": {
        "BRIDGE_BROKER_URL": "http://127.0.0.1:5050"
      }
    }
  }
}
MCPCONFIG
```

**IMPORTANT:** Replace `/ABSOLUTE/PATH/TO/kokino` with your actual path!

**Find your absolute path:**
```bash
cd /path/to/kokino
pwd  # Copy this output
```

**Example:**
```json
{
  "args": ["/Users/yourname/projects/kokino/mcp/build/index.js"]
}
```

---

## Step 6: Create Your First Agent (5 minutes)

### Option A: Via UI (Recommended)

1. **Open UI**: http://localhost:5173
2. **Click "Create Agent"** button
3. **Fill in form:**
   - **Name:** Alice
   - **Role:** Software Engineer
   - **Working Directory:** /path/to/your/project (or `/tmp/test-workspace`)
   - **CLI Type:** claude-code
   - **Communication Mode:** headless
   - **Bootstrap Mode:** auto
4. **Click "Create"**

**Expected result:** Agent card appears on canvas

### Option B: Via API

```bash
curl -X POST http://127.0.0.1:5050/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alice",
    "role": "Software Engineer",
    "projectId": "global",
    "cliType": "claude-code",
    "commMode": "headless",
    "bootstrapMode": "auto",
    "workingDirectory": "/tmp/test-workspace"
  }'
```

**Verify agent was created:**
```bash
curl http://127.0.0.1:5050/api/agents | jq
```

---

## Step 7: Start Your First Agent (3 minutes)

### Option A: Via UI

1. **Find agent card** on canvas (Alice)
2. **Click "Start" button**
3. **Agent status changes:** idle → starting → ready

### Option B: Via API

```bash
curl -X POST http://127.0.0.1:5050/api/agents/AGENT_ID/instantiate \
  -H "Content-Type: application/json"

# Get agent ID from previous step (e.g., "agent-abc123")
```

**Expected output:**
```json
{
  "success": true,
  "agentId": "alice-abc123",
  "pid": 12345,
  "status": "starting"
}
```

**Check agent status:**
```bash
curl http://127.0.0.1:5050/agents | jq

# Look for Alice in the agents array
# status should be "ready"
```

---

## Step 8: Send Your First Task (5 minutes)

### Execute Agent with Prompt

```bash
curl -X POST http://127.0.0.1:5050/agents/alice-abc123/execute \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "List files in the current directory and tell me what you see",
    "timeoutMs": 30000
  }'
```

**Expected response:**
```json
{
  "turnId": "turn-xyz789",
  "content": "I can see the following files in /tmp/test-workspace:\n...",
  "conversationId": "conv-def456",
  "durationMs": 3245,
  "success": true
}
```

### View Agent Output in UI

1. Open UI: http://localhost:5173
2. Click on Alice's agent card
3. View conversation history in sidebar

---

## Step 9: Agent-to-Agent Communication (Optional, 5 minutes)

### Create Second Agent

```bash
curl -X POST http://127.0.0.1:5050/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bob",
    "role": "Code Reviewer",
    "projectId": "global",
    "cliType": "claude-code",
    "commMode": "headless",
    "workingDirectory": "/tmp/test-workspace"
  }'
```

### Start Bob

```bash
curl -X POST http://127.0.0.1:5050/api/agents/BOB_AGENT_ID/instantiate
```

### Alice Sends Message to Bob

**From Alice's Claude Code session** (if you have direct access):
```
Send a message to Bob asking him to review the latest changes
```

Behind the scenes, Alice uses the `agent-bridge.send_message` MCP tool:
```typescript
await send_message({
  agentId: "Bob",
  payload: "Please review the latest changes in the codebase",
  metadata: { origin: "Alice" },
  awaitResponse: true
});
```

Bob receives the message and can respond.

---

## What You've Accomplished ✅

- ✅ Installed and configured Kokino
- ✅ Started broker and UI
- ✅ Configured Claude Code with MCP server
- ✅ Created and started your first agent
- ✅ Executed a task and viewed results
- ✅ (Optional) Set up agent-to-agent communication

---

## Next Steps

### Learn More
- **[Development Guide](DEVELOPMENT.md)** - Deep dive into local development
- **[API Reference](../reference/API.md)** - Complete API documentation
- **[Architecture](../reference/ARCHITECTURE.md)** - System design overview

### Try Advanced Features
1. **Create a Team:**
   - UI → Teams → Create Team
   - Add multiple agents
   - Start team with coordinated task

2. **Bootstrap Agents with Context:**
   - Create `CLAUDE.md` in agent's working directory
   - Set `bootstrapMode: "auto"` on agent config
   - Agent auto-loads context on startup

3. **Monitor Agent Performance:**
   - UI → Monitoring Dashboard
   - View agent execution metrics
   - Set up alerts for failures

4. **GitHub Integration:**
   - Connect GitHub account
   - Spawn teams from issues
   - Auto-create PRs from agent work

---

## Common Issues

### "Agent failed to start"

**Symptoms:** Agent status stuck in "starting" or goes to "error"

**Fixes:**
1. Check Claude Code is installed: `claude --version`
2. Check authentication: `claude auth status`
3. Check working directory exists and has write permissions
4. Check broker logs: `cd broker && tail -f broker.log`

### "Cannot connect to broker"

**Symptoms:** UI shows "Connection failed" or API calls return connection errors

**Fixes:**
1. Verify broker is running: `curl http://127.0.0.1:5050/health`
2. Check broker port: Default is 5050, check `.env` for overrides
3. **Use 127.0.0.1, not localhost** (WebSocket issue on macOS)

### "MCP tools not available"

**Symptoms:** Agent says "I don't have access to agent-bridge tools"

**Fixes:**
1. Verify MCP server is built: `ls mcp/build/index.js`
2. Check `.claude/mcp.json` has absolute path (not relative)
3. Restart Claude Code session
4. Check broker URL in mcp.json: `http://127.0.0.1:5050`

### "Database locked"

**Symptoms:** Broker crashes with "database is locked"

**Fixes:**
1. Stop broker: `Ctrl+C`
2. Check for other processes using database: `lsof broker/src/db/kokino.db`
3. Kill those processes or wait for them to finish
4. Restart broker

---

## Getting Help

### Documentation
- **[docs/README.md](../README.md)** - Complete documentation index
- **[Operations Runbooks](../ops/)** - Production troubleshooting

### Community
- **GitHub Issues:** Report bugs or ask questions
- **Discussions:** Share use cases and tips

### Debug Mode
```bash
# Enable verbose logging
DEBUG=kokino:* npm start
```

---

**Congratulations! You're ready to build with Kokino. 🎉**

Next: [Development Guide](DEVELOPMENT.md) for deep dive into development workflow.
