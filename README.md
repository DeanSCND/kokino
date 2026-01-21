# Kokino

> UI-First Multi-Agent Orchestration Platform

## Vision

Kokino is a localhost-first platform for orchestrating teams of AI agents that work together as a cohesive software development team. Built with a **UI-first approach**, we validate the user experience and orchestration model through interactive prototypes before building complex infrastructure.

## Philosophy

**"Mock it before you plumb it"** - The UI helps us understand if the plumbing is right. By visualizing agent teams and workflows first, we validate our architecture before committing to implementation details.

## Project Status

✅ **Phases 1-10 Complete** - Production Ready

Kokino is a fully functional multi-agent orchestration platform with real-time messaging, GitHub integration, terminal support, and collaborative workflows.

## Architecture

```
kokino/
├── ui/           # React frontend (Phase 1-3: UI mockup and validation)
├── broker/       # Message broker (Phase 4+: Real backend integration)
├── mcp/          # MCP server (Phase 4+: Agent communication tools)
└── docs/         # Documentation
```

## Features

- **Visual Team Builder**: Drag-and-drop interface for creating agent teams with role-based templates
- **Real-time Orchestration**: Live monitoring of agent status, communication, and task progress
- **GitHub Integration**: OAuth authentication, issue tracking, PR creation, and webhook handling
- **Message Broker**: Centralized communication hub for inter-agent messaging with SQLite persistence
- **Terminal Integration**: Built-in terminal access for each agent with tmux support
- **Commit Aggregation**: Multi-agent collaborative coding with conflict detection
- **Team Templates**: Pre-configured workflows for common development tasks (Code Review, Bug Fix, Feature Dev)
- **Timeline View**: Visual representation of agent activities and team progress
- **Enforcement Rules**: Automatic rule validation (required roles, max team size, etc.)

## Completed Development Phases

### ✅ Phase 1-3: UI Foundation & Canvas
- Interactive React Flow canvas
- Agent drag-and-drop
- Mock orchestration
- Visual workflow design

### ✅ Phase 4-5: Backend Integration
- Node.js message broker
- SQLite persistence
- Real-time WebSocket communication
- Ticket-based correlation

### ✅ Phase 6: Terminal Integration
- XTerm.js integration
- tmux session management
- Agent-specific terminals

### ✅ Phase 7: Team Templates & Workflows
- Pre-configured workflows
- Role-based templates
- Team spawning automation

### ✅ Phase 8: Advanced Orchestration
- Timeline visualization
- Health monitoring
- Enforcement rules

### ✅ Phase 9: GitHub Integration
- OAuth 2.0 authentication
- Issue browsing
- PR creation
- Webhook handling
- Branch management
- Commit aggregation

### ✅ Phase 10: Production Polish
- Toast notification system
- Loading states
- Environment configuration
- Comprehensive documentation
- Error boundaries
- API documentation

## Key Learnings from POC

Kokino builds on proven concepts from the agent-collab POC:

- **Store & Forward**: 10-20ms message acknowledgment
- **IPv4 Enforcement**: Use 127.0.0.1, not localhost (WebSocket stability)
- **Atomic Buffers**: tmux load-buffer for reliable injection
- **Multi-Model Support**: Claude, Droid, Gemini working together
- **Dual Protocol**: HTTP for orchestration, WebSocket for terminals

## Quick Start

### Prerequisites

- Node.js 20.19+ or 22.12+
- npm or yarn
- Git
- (Optional) GitHub OAuth App for GitHub integration

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/kokino.git
   cd kokino
   ```

2. **Install dependencies**
   ```bash
   # Install broker dependencies
   cd broker
   npm install

   # Install UI dependencies
   cd ../ui
   npm install
   ```

3. **Configure environment variables**
   ```bash
   # Broker configuration
   cd broker
   cp .env.example .env
   # Edit .env with your values

   # UI configuration
   cd ../ui
   cp .env.example .env
   # Edit .env with your values
   ```

4. **Start the broker**
   ```bash
   cd broker
   npm start
   ```
   Broker runs on `http://127.0.0.1:5050`

5. **Start the UI** (in a new terminal)
   ```bash
   cd ui
   npm run dev
   ```
   UI runs on `http://localhost:5173`

### GitHub Integration Setup (Optional)

1. Create a GitHub OAuth App at https://github.com/settings/developers
2. Set callback URL to: `http://localhost:5173/auth/github/callback`
3. Add credentials to `.env` files (see `.env.example` for details)
4. Restart both services

## Tech Stack

**Frontend**:
- React 19.2.0
- @xyflow/react 12.10.0 (Flow-based UI)
- TailwindCSS 3.4.17
- React Router 7.12.0
- Lucide React (Icons)

**Backend**:
- Node.js 20+
- SQLite3 (Persistence)
- WebSocket (Real-time communication)
- GitHub REST API integration

## Usage

### Creating an Agent Team

1. Open the UI at `http://localhost:5173`
2. Click "Create Agent" to add agents to the canvas
3. Select agent roles (Developer, QA, PM, etc.)
4. Configure agent properties and capabilities
5. Connect agents to define communication flows

### Spawning from GitHub Issues

1. Connect your GitHub account via the UI header
2. Browse your repositories and issues
3. Click "Spawn Team" on an issue
4. Kokino automatically creates a team based on issue labels
5. Monitor team progress in the Timeline view

## API Documentation

### Broker API Endpoints

**Agent Management**
- `GET /agents` - List all registered agents
- `POST /agents/register` - Register a new agent
- `DELETE /agents/:agentId` - Unregister an agent

**Messaging**
- `POST /api/messages/send` - Send a message to another agent
- `GET /api/messages/history` - Get message history
- `GET /agents/:agentId/tickets/pending` - Get pending tickets for an agent

**GitHub Integration**
- `POST /api/github/oauth` - Exchange OAuth code for access token
- `POST /api/github/webhook` - Receive GitHub webhook events

**Health**
- `GET /health` - Broker health check

See `/docs/` for detailed API documentation.

## Project Structure

```
ui/src/
├── components/       # Reusable UI components (Toast, LoadingSpinner, etc.)
├── pages/            # Page components (Canvas, GitHubCallback)
├── contexts/         # React contexts (ToastContext)
├── services/         # API clients (broker, github)
├── utils/            # Utilities (commitAggregator, statusSync, teamSpawner)
└── layouts/          # Layout components (DashboardLayout)

broker/src/
├── routes/           # API route handlers (agents, messages, github)
├── models/           # Data models (AgentRegistry, TicketStore)
├── db/               # Database layer (MessageRepository)
└── utils/            # Utilities (response helpers)
```

## Contributing

See GitHub issues organized by phase milestones. Each phase has clear acceptance criteria and testable checkpoints.

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## Roadmap

- [ ] Multi-language agent support
- [ ] Advanced conflict resolution strategies
- [ ] Team performance analytics
- [ ] Custom agent templates
- [ ] Enterprise SSO integration
- [ ] Cloud deployment guides
- [ ] Docker Compose setup

## License

MIT

---

**The future is localhost. The future is visual. The future is Kokino.** 🎨
