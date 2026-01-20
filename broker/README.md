# Broker - Message Routing Service

Optimized message broker for agent-to-agent communication.

## Architecture

**Store & Forward**: Instant acknowledgment (<20ms), background delivery
**Stateful Mailbox**: Accepts messages for offline agents
**SQLite Persistence**: Threads, messages, agents, workflows

## API Endpoints

### Orchestration (HTTP)
- `POST /orchestrate` - Launch agent teams
- `GET /agents` - List all agents
- `POST /agents/:id/stop` - Stop individual agent
- `POST /agents/kill-all` - Terminate all sessions

### Messaging (HTTP)
- `POST /agents/register` - Register new agent
- `POST /agents/:id/send` - Send message
- `GET /agents/:id/tickets/pending` - Poll for messages
- `POST /replies` - Post reply to ticket

### Real-time (WebSocket)
- `WS /ws` - General event stream
- `WS /ws/terminal/:id` - Terminal PTY sessions

## Phase

**Phase 4**: Initial implementation
**Phase 5**: UI integration
**Phase 8**: Advanced orchestration

## Key Optimizations

- IPv4 enforcement (127.0.0.1 only)
- Atomic tmux buffer operations
- Terminal readiness checking
- Post-injection cooldown

*Based on proven POC architecture*
