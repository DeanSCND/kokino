# Project Context

- You are working inside a tmux-heavy workflow that coordinates multiple coding agents (Claude Code, Codex, others).
- Our goal is to minimise manual copy/paste by routing all cross-agent messages through the broker-backed `agent-bridge` MCP server.
- Assume the default shell inside the tmux panes is `fish` unless told otherwise.

# Operating Principles

- Prefer additive, well-documented changes; keep commits minimal and focused.
- Follow existing language and framework conventions when editing code. Surface uncertainties before making risky changes.
- Always describe any tmux automation you perform so we can audit activity if needed.
- When shelling out from tmux panes, favour `rg`, `fd`, and other fast CLI tools.

# Agent Bridge Workflow

- Use `agent-bridge.list_agents` / `co_workers` at session start to discover which handles are online and where they are working (cwd, capabilities).
- Prefer `agent-bridge.send_message` for all cross-agent requests. Provide `agentId` with the registered handle (e.g. `"Jerry"`). Leave `awaitResponse` at its default (`true`) unless you intentionally want to defer waiting.
- For fire-and-forget tasks, call `send_message` with `awaitResponse=false` and store the returned `ticketId`; later call `agent-bridge.await_reply` when you need the outcome.
- Downstream agents are expected to run `bridge-register` on startup and to reply via `bridge-reply` (or `agent-bridge.post_reply` if they have the MCP server configured). If a handle is missing, ask the agent to register or call `agent-bridge.register_agent` yourself as a stopgap.

Example synchronous hand-off:

```
send_message → agent-bridge
  agentId: "Jerry"
  payload: "Please review the latest diff and respond with blockers only."
  metadata: {"origin": "<YOUR_AGENT_ID>"}  # IMPORTANT: Always include your agent ID here!
  timeoutMs: 45000
```

**IMPORTANT:** When sending messages, ALWAYS include `metadata: {"origin": "<your-agent-id>"}` so recipients know who sent the message!

If the broker is unavailable, fall back to the low-level `tmux` MCP server (alias `tmux`) using `send-keys` for keystrokes and `capture-pane` for output. Avoid `execute-command`; it spawns subshells and is token-heavy.

# Extra Guidance for Inter-Agent Chats

- At session start, call `co_workers` (or `list_agents`) to confirm the bridge is available and see who is online.
- Encourage agents to pass their handle with `--agent <name>` when replying so tickets are easy to track.
- Keep messages concise—Codex already has its own context. Share summaries, references, or diffs rather than full transcripts unless necessary.
- For asynchronous flows, keep track of `ticketId`s and use `await_reply` instead of manually polling tmux.

# Safety Rails

- Never run destructive tmux commands (closing panes, killing windows) unless explicitly asked.
- Do not install global packages; rely on project or `npx`-scoped tooling.
- If MCP tooling fails, report the issue rather than retrying endlessly.

# Useful References

- `docs/claude-code-overview.md` summarises how Claude Code, `CLAUDE.md`, and `.claude/mcp.json` fit together.
- Keep tmux session names obvious (e.g. `dev` or `agents`) so the MCP scripts can reference panes reliably.
