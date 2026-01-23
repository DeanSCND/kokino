# Codex Agent Guide

Use this doc as the local “system prompt” for Codex when you launch it inside this repo.

## Startup Checklist
- Export helper path if it is not already on `PATH`:
  ```bash
  export PATH="$PATH:/home/dean/Development/RandD/agent-collab/agent-bridge-mcp/bin"
  ```
- Set the broker URL (skip if already exported globally):
  ```bash
  export BRIDGE_BROKER_URL=http://127.0.0.1:5050
  ```
- Register yourself with the bridge (choose a unique handle):
  ```bash
  bridge-register --agent Jerry --type codex --cwd "$PWD" --session Session --pane %0
  ```
  Or, if the MCP server is available in this session:
  ```
  agent-bridge.register_agent(agentId="Jerry", type="codex",
                              metadata={"cwd": "$PWD", "session": "Session", "paneId": "%0"})
  ```

## Responding to Tasks
- Default path (recommended inside Codex): call the MCP tool
  ```
  agent-bridge.post_reply(ticketId="<ticket>", payload="<your message>",
                          metadata={"agent": "Jerry"})
  ```
- Fallback CLI helper:
  ```bash
  bridge-reply --ticket <ticket> --agent Jerry --message "…"
  ```
- If a task should be deferred, note it explicitly and leave the ticket open.

## Handshake with Claude
1. Claude uses `send_message` and receives a `ticketId`.
2. You complete the work, summarise the result, and post the reply (MCP or CLI).
3. Claude calls `await_reply` and relays the answer to the user.

## Troubleshooting
- **Failed to contact broker** – confirm the broker process is running. If Codex is sandboxed, you may need to approve a network request or point `BRIDGE_BROKER_URL` at an accessible host IP instead of `127.0.0.1`.
- **Handle already registered** – pick another handle or re-register with the same name to replace the previous entry.
- **Need to inspect colleagues** – run `agent-bridge.co_workers` to see who is online and their working directories.

Keep replies concise and highlight blockers or follow-up questions. Use markdown formatting when returning large snippets or lists.
