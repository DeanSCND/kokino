# Phase 2: Agent Lifecycle - Test Script

## Prerequisites
```bash
# Start broker
cd broker && npm start
```

## Test 1: Templates API
```bash
# Should return 9 templates
curl http://127.0.0.1:5050/agents/templates | jq '.[] | {id, name, type}'
```

## Test 2: Spawn Mock Agent
```bash
# Spawn a mock agent
curl -X POST http://127.0.0.1:5050/agents/spawn \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "TestAgent",
    "type": "mock-agent",
    "role": "Mock Agent (Testing)"
  }' | jq

# Expected: { "success": true, "agentId": "TestAgent", "session": "dev-TestAgent", ... }
```

## Test 3: Verify Agent Running
```bash
# Check tmux session exists
tmux has-session -t dev-TestAgent && echo "✓ Session exists"

# Check agent registered
curl http://127.0.0.1:5050/agents | jq '.[] | select(.agentId=="TestAgent")'

# Check watcher running
ps aux | grep "message-watcher.*TestAgent"
```

## Test 4: Health Checker (wait 30s)
```bash
# Kill tmux session manually
tmux kill-session -t dev-TestAgent

# Wait 30 seconds for health check
sleep 30

# Agent should be marked offline
curl http://127.0.0.1:5050/agents | jq '.[] | select(.agentId=="TestAgent") | {agentId, status}'
```

## Test 5: Session Recovery
```bash
# Spawn agent again
curl -X POST http://127.0.0.1:5050/agents/spawn \
  -H "Content-Type: application/json" \
  -d '{"agentId": "RecoveryTest", "type": "mock-agent", "role": "Recovery Test"}' | jq

# Restart broker (Ctrl+C in broker terminal, then npm start again)

# After restart, check logs for:
# [ProcessManager] Starting session recovery...
# [ProcessManager] ✓ Reconnected to RecoveryTest in dev-RecoveryTest

# Verify agent still online
curl http://127.0.0.1:5050/agents | jq '.[] | select(.agentId=="RecoveryTest")'
```

## Test 6: UI Integration
```bash
# Start UI
cd ui && npm run dev

# Open http://localhost:5173
# 1. Click "Spawn Agent" button
# 2. Select a template (e.g., "Frontend Engineer")
# 3. Edit agent name (optional)
# 4. Click "Spawn Agent"
# 5. Verify agent appears on canvas
# 6. Check tmux session: tmux ls
```

## Cleanup
```bash
# Kill all test sessions
tmux kill-session -t dev-TestAgent 2>/dev/null
tmux kill-session -t dev-RecoveryTest 2>/dev/null

# Or use cleanup script
./bin/cleanup-agents.sh
```

## Success Criteria
- ✅ Templates API returns 9 templates
- ✅ Agent spawns successfully with tmux session
- ✅ Watcher process starts automatically
- ✅ Health checker detects dead session
- ✅ Session recovery reconnects on restart
- ✅ UI spawn dialog works end-to-end
