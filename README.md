# Kokino

> UI-First Multi-Agent Orchestration Platform

## Vision

Kokino is a localhost-first platform for orchestrating teams of AI agents that work together as a cohesive software development team. Built with a **UI-first approach**, we validate the user experience and orchestration model through interactive prototypes before building complex infrastructure.

## Philosophy

**"Mock it before you plumb it"** - The UI helps us understand if the plumbing is right. By visualizing agent teams and workflows first, we validate our architecture before committing to implementation details.

## Project Status

🚧 **Phase 1: UI Foundation & Canvas** - In Progress

## Architecture

```
kokino/
├── ui/           # React frontend (Phase 1-3: UI mockup and validation)
├── broker/       # Message broker (Phase 4+: Real backend integration)
├── mcp/          # MCP server (Phase 4+: Agent communication tools)
└── docs/         # Documentation
```

## Development Phases

### Phase 1-3: UI-First Development (Weeks 1-2)
Build interactive mockup with React + React Flow to validate:
- Agent team composition via drag-and-drop
- Visual workflow design
- Simulated agent interactions
- User experience patterns

### Phase 4-5: Backend Integration (Weeks 3-4)
Connect mockup to real broker:
- Message routing and correlation
- Agent lifecycle management
- Real-time status updates
- SQLite persistence

### Phase 6-8: Advanced Features (Weeks 4-6)
- Terminal integration (XTerm.js)
- Team templates and workflows
- Message flow visualization
- Thread management

### Phase 9-10: Production (Weeks 7-8)
- GitHub integration
- Docker deployment
- Performance optimization
- Comprehensive testing

## Key Learnings from POC

Kokino builds on proven concepts from the agent-collab POC:

- **Store & Forward**: 10-20ms message acknowledgment
- **IPv4 Enforcement**: Use 127.0.0.1, not localhost (WebSocket stability)
- **Atomic Buffers**: tmux load-buffer for reliable injection
- **Multi-Model Support**: Claude, Droid, Gemini working together
- **Dual Protocol**: HTTP for orchestration, WebSocket for terminals

## Quick Start

*Coming in Phase 1 - UI mockup will be accessible via Vite dev server*

## Tech Stack

**Frontend** (Immediate):
- React 18 + TypeScript
- Vite (build tool)
- TailwindCSS (styling)
- React Flow (canvas)
- XTerm.js (terminals)
- Zustand (state management)

**Backend** (Phase 4+):
- Node.js + Express
- Socket.io (WebSocket)
- SQLite (persistence)

## Contributing

See GitHub issues organized by phase milestones. Each phase has clear acceptance criteria and testable checkpoints.

## License

MIT

---

**The future is localhost. The future is visual. The future is Kokino.** 🎨
