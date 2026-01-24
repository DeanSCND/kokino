# Environment Troubleshooting Guide

**Diagnosing and fixing headless CLI execution environment issues**

---

## Overview

The Environment Doctor runs 5 checks for each CLI type (claude-code, factory-droid, gemini):

1. **Binary** - CLI executable found in PATH
2. **Environment** - Required environment variables set
3. **Auth** - Credentials/API keys configured
4. **Disk** - Sufficient disk space available
5. **Dry-run** - CLI responds to test invocation

This guide provides troubleshooting steps for each check failure.

---

## Quick Diagnostic

```bash
# Run environment doctor for all CLIs
curl http://127.0.0.1:5050/api/health/environment | jq

# Check specific CLI
curl http://127.0.0.1:5050/api/health/environment?cli=claude-code | jq

# Or use diagnostic script
./scripts/diagnose-headless.sh
```

**Expected healthy response:**
```json
{
  "cliType": "claude-code",
  "passed": true,
  "checks": [
    { "name": "binary", "passed": true, "message": "claude found at /usr/local/bin/claude" },
    { "name": "environment", "passed": true, "message": "Environment variables correct" },
    { "name": "auth", "passed": true, "message": "Auth credentials found" },
    { "name": "disk", "passed": true, "message": "Disk 45% full - 120Gi available" },
    { "name": "dryrun", "passed": true, "message": "CLI responds to --version" }
  ],
  "warnings": []
}
```

---

## Check 1: Binary Not Found

### Symptom

```json
{
  "name": "binary",
  "passed": false,
  "message": "claude not found in PATH. Install with: npm install -g @anthropic-ai/claude-cli"
}
```

### Causes

- CLI not installed
- CLI installed but not in PATH
- Permission issues

### Solutions

#### For claude-code:

```bash
# Install Claude Code CLI
npm install -g @anthropic-ai/claude-cli

# Verify installation
which claude
claude --version

# If installed but not found, add to PATH
export PATH="/usr/local/bin:$PATH"
```

#### For factory-droid:

```bash
# Install Factory Droid CLI
npm install -g @factory-ai/droid-cli

# Verify
which droid
droid --version
```

#### For gemini:

```bash
# Install Gemini CLI
pip install google-gemini-cli

# Verify
which gemini
gemini --version
```

### Verify Fix

```bash
curl http://127.0.0.1:5050/api/health/environment?cli=claude-code | jq '.checks[] | select(.name == "binary")'
```

Expected: `"passed": true`

---

## Check 2: Environment Variables Incorrect

### Symptom

```json
{
  "name": "environment",
  "passed": false,
  "message": "CLAUDECODE not set in runtime env; ANTHROPIC_API_KEY should be deleted (prevents subscription auth)"
}
```

### Claude Code Environment Issues

#### Issue 2.1: CLAUDECODE not set

**Cause:** AgentRunner's `buildClaudeEnvironment()` not setting CLAUDECODE=1

**Solution:**
```javascript
// In broker/src/agents/AgentRunner.js
const env = {
  ...process.env,
  CLAUDECODE: '1',  // REQUIRED
  CLAUDE_CODE_ENTRYPOINT: 'cli'  // REQUIRED
};
```

#### Issue 2.2: ANTHROPIC_API_KEY is set

**Cause:** ANTHROPIC_API_KEY in environment forces API auth instead of subscription auth

**Solution:**
```javascript
// In broker/src/agents/AgentRunner.js
const env = buildClaudeEnvironment();

// CRITICAL: Remove ANTHROPIC_API_KEY
delete env.ANTHROPIC_API_KEY;
```

Or from shell:
```bash
unset ANTHROPIC_API_KEY
```

#### Issue 2.3: Missing PATH components

**Cause:** PATH doesn't include /opt/homebrew/bin, /usr/local/bin, etc.

**Solution:**
```javascript
// In broker/src/agents/AgentRunner.js
const fullPath = [
  '/opt/homebrew/bin',  // macOS Homebrew
  '/usr/local/bin',
  path.join(HOME, '.local/bin'),
  path.join(HOME, '.bun/bin'),
  '/usr/bin',
  '/bin'
].join(':');

const env = {
  ...process.env,
  PATH: fullPath
};
```

### Verify Fix

```bash
curl http://127.0.0.1:5050/api/health/environment?cli=claude-code | jq '.checks[] | select(.name == "environment")'
```

---

## Check 3: Auth Credentials Missing

### Symptom

```json
{
  "name": "auth",
  "passed": false,
  "message": "~/.claude/.env not found. Login with: claude login"
}
```

### Claude Code Auth Issues

#### Issue 3.1: Never logged in

**Solution:**
```bash
# Interactive login
claude login

# Follow browser OAuth flow
# Credentials saved to ~/.claude/.env
```

#### Issue 3.2: ~/.claude directory missing

**Solution:**
```bash
# Run claude once to initialize
claude --help

# Then login
claude login
```

#### Issue 3.3: ~/.claude/.env exists but empty

**Solution:**
```bash
# Check current auth status
cat ~/.claude/.env

# Re-login
claude login --force
```

#### Issue 3.4: Auth tokens expired

**Symptom:** Dry-run check fails with "401 Unauthorized"

**Solution:**
```bash
# Re-authenticate
claude logout
claude login
```

### Factory Droid Auth

```bash
# Login to Factory AI
droid login

# Verify
droid whoami
```

### Gemini Auth

```bash
# Set API key via environment
export GEMINI_API_KEY="your-api-key"

# Or via config file
echo "api_key: your-api-key" > ~/.gemini/config.yaml
```

### Verify Fix

```bash
curl http://127.0.0.1:5050/api/health/environment?cli=claude-code | jq '.checks[] | select(.name == "auth")'
```

---

## Check 4: Disk Space Issues

### Symptom

```json
{
  "name": "disk",
  "passed": false,
  "message": "Disk 96% full - only 2.5Gi available"
}
```

### Solutions

#### Option 1: Clean broker logs

```bash
# Find large log files
du -sh broker/logs/agents/*

# Remove old logs (keep last 7 days)
find broker/logs/agents -name "*.log" -mtime +7 -delete

# Rotate current logs
npm run rotate-logs --workspace=broker
```

#### Option 2: Clean database

```bash
# Check database size
du -sh broker/data/kokino.db

# Cleanup old telemetry events (keep last 90 days)
curl -X POST http://127.0.0.1:5050/api/metrics/cleanup?days=90

# Cleanup old conversations
node scripts/cleanup-sessions.js --max-age 30d
```

#### Option 3: Clean orphaned sessions

```bash
# Find orphaned CLI sessions
ls -lah ~/.claude/sessions/
ls -lah ~/.factory/sessions/

# Remove sessions older than 30 days
find ~/.claude/sessions -mtime +30 -delete
```

#### Option 4: Clean Docker images (if using)

```bash
docker system prune -a --volumes
```

### Verify Fix

```bash
df -h
curl http://127.0.0.1:5050/api/health/environment | jq '.checks[] | select(.name == "disk")'
```

---

## Check 5: Dry-run Execution Failed

### Symptom

```json
{
  "name": "dryrun",
  "passed": false,
  "message": "CLI execution failed: Command failed with exit code 1"
}
```

### Causes

1. **Auth failure** (even though auth check passed - token may be invalid)
2. **Permission denied** (CLI doesn't have execute permissions)
3. **CLI version incompatible**
4. **Quota exceeded** (API rate limits)
5. **Network issues** (can't reach API)

### Solution 1: Re-authenticate

```bash
# For Claude Code
claude logout
claude login

# Test manually
claude -p "hello" --dangerously-skip-permissions
```

### Solution 2: Check CLI permissions

```bash
# Check if binary is executable
ls -l $(which claude)

# If not executable, fix permissions
chmod +x $(which claude)
```

### Solution 3: Update CLI version

```bash
# Update to latest
npm update -g @anthropic-ai/claude-cli

# Verify version
claude --version

# Check compatibility
curl http://127.0.0.1:5050/api/health/cli-versions
```

### Solution 4: Check quota/rate limits

```bash
# Test with minimal prompt
claude -p "test" --dangerously-skip-permissions

# If quota error, wait or upgrade plan
# Check dashboard: https://console.anthropic.com
```

### Solution 5: Network connectivity

```bash
# Test API endpoint connectivity
curl -I https://api.anthropic.com

# Check DNS resolution
nslookup api.anthropic.com

# Test from inside broker environment
node -e "require('https').get('https://api.anthropic.com', res => console.log(res.statusCode))"
```

### Verify Fix

```bash
# Manual test
claude -p "respond with OK only" --dangerously-skip-permissions

# Via environment doctor
curl http://127.0.0.1:5050/api/health/environment?cli=claude-code | jq '.checks[] | select(.name == "dryrun")'
```

---

## Multi-CLI Failures

### All CLIs Failing

If **all** CLIs fail environment checks, suspect system-level issues:

1. **Network outage** - Check internet connectivity
2. **Disk full** - Clean up space
3. **Permission changes** - Check user permissions
4. **Broker misconfiguration** - Review broker/src/agents/AgentRunner.js

### Specific CLI Failing

If **one** CLI fails consistently:

1. **Check CLI-specific docs** - Each CLI has unique requirements
2. **Review recent CLI updates** - Breaking changes?
3. **Force fallback to tmux** - While investigating:
   ```bash
   curl -X POST http://127.0.0.1:5050/api/fallback/cli/disable \
     -H 'Content-Type: application/json' \
     -d '{"cliType":"claude-code","reason":"Environment degraded"}'
   ```

---

## Common Error Patterns

### Pattern 1: Works in terminal, fails in broker

**Cause:** Shell environment differs from Node.js process environment

**Solution:**
```javascript
// In AgentRunner.js, ensure full environment built
function buildClaudeEnvironment() {
  // Load shell profile variables
  const shellProfile = execSync('bash -l -c "env"', { encoding: 'utf8' });
  // Parse and merge into process.env
}
```

### Pattern 2: Works once, then fails

**Cause:** Session locks not released, CLI state corrupted

**Solution:**
```bash
# Clear all sessions
curl -X POST http://127.0.0.1:5050/agents/sessions/clear

# Or manually
rm -rf ~/.claude/sessions/*
```

### Pattern 3: Intermittent failures

**Cause:** Network instability, API rate limiting, quota limits

**Solution:**
- Enable retry logic in AgentRunner
- Add exponential backoff
- Monitor circuit breaker status:
  ```bash
  curl http://127.0.0.1:5050/agents/circuits/status
  ```

---

## Recovery Procedures

### Complete Environment Reset

```bash
# 1. Stop broker
pkill -f "node.*broker"

# 2. Clear all CLI state
rm -rf ~/.claude/sessions/*
rm -rf ~/.factory/sessions/*

# 3. Re-authenticate all CLIs
claude logout && claude login
droid logout && droid login

# 4. Run diagnostics
./scripts/diagnose-headless.sh

# 5. Restart broker
npm run dev --workspace=broker
```

### Per-Agent Reset

```bash
# End session
curl -X POST http://127.0.0.1:5050/agents/{agentId}/end-session

# Clear fallback
curl -X DELETE http://127.0.0.1:5050/api/fallback/agent/{agentId}

# Reset circuit breaker
curl -X POST http://127.0.0.1:5050/agents/{agentId}/circuit/reset
```

---

## Preventive Measures

### Automated Health Checks

```bash
# Add to cron (every 6 hours)
0 */6 * * * curl http://127.0.0.1:5050/api/health/environment | jq -e '.overall' || echo "Environment degraded" | mail -s "Kokino Alert" ops@example.com
```

### Pre-flight Checks on Spawn

```javascript
// In broker/src/routes/agents.js
async spawn(req, res, agentId) {
  // Run environment check before spawning headless agent
  const envCheck = await environmentDoctor.check(agent.type);

  if (!envCheck.passed) {
    // Auto-fallback to tmux
    fallbackController.forceAgentFallback(agentId, `Env check failed: ${envCheck.checks.filter(c => !c.passed).map(c => c.message).join(', ')}`);
  }
}
```

### Weekly Maintenance

```bash
# Clean up old data
node scripts/cleanup-sessions.js --max-age 7d
curl -X POST http://127.0.0.1:5050/api/metrics/cleanup?days=90

# Rotate logs
npm run rotate-logs --workspace=broker

# Update CLIs
npm update -g @anthropic-ai/claude-cli
```

---

## Escalation Criteria

Escalate to engineering if:

-  All troubleshooting steps attempted
-  Manual CLI execution works, broker execution fails
-  Issue persists across broker restarts
-  Multiple CLIs affected simultaneously
-  Environment checks pass but executions fail

---

## Reference

- **Environment Doctor Source:** `broker/src/agents/EnvironmentDoctor.js`
- **AgentRunner Environment:** `broker/src/agents/AgentRunner.js` (buildClaudeEnvironment)
- **Diagnostic Script:** `scripts/diagnose-headless.sh`
- **API Endpoints:** `/api/health/environment`, `/api/health/environment?cli=<type>`

---

*Last Updated: 2025-01-24*
