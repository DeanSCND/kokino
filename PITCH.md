# KOKINO

**Multi-Agent Orchestration for Complex Collaboration**

---

## The Opportunity

AI agents are now genuinely capable—Claude Code, Gemini CLI, Droid can autonomously write code, search the web, edit files, and reason through complex problems.

*What if they could work together?*

- **Software Projects** — Architect, implementers, reviewers, testers—each agent with the right model for the job
- **Research & Analysis** — Bull case vs bear case analysts, with a synthesizer drawing conclusions
- **Creative Work** — Lyricist, composer, producer collaborating on music—or writers, editors, fact-checkers

---

## The Problem

Today, orchestrating multiple AI agents requires:

- Multiple terminal windows, manually routing messages between agents
- Copy/paste to share context—no structured communication channel
- No visibility into who's working on what, or where they're stuck
- No escalation path when agents deadlock or need human judgment
- Framework alternatives (CrewAI, AutoGen) use API wrappers—losing the power of native CLI agents

**The human becomes the message bus—it doesn't scale.**

---

## Kokino: Infrastructure for AI Teams

### Message Broker
- Store-and-forward routing
- Agents communicate directly
- Works with offline agents
- Full audit trail

### Visual Canvas
- See team topology
- Real-time status
- Spawn from templates
- Monitor progress

### Escalation & Boxing
- Deadlock detection
- Human-in-the-loop decisions
- Budget constraints
- Autonomy slider

---

## Why CLI-Native Agents?

| Framework Abstractions | CLI-Native Agents |
|------------------------|-------------------|
| API wrappers with role prompts | Full agentic systems out of the box |
| Rebuild tool use from scratch | Native tool use, file editing, search |
| Limited context management | MCP extensibility for custom tools |
| "Simulated" expertise | Battle-tested, production-ready |

**Kokino orchestrates capable autonomous systems—not prompted personas.**

---

## Market Opportunity

*The market for multi-agent orchestration doesn't exist yet.*

We're betting on a paradigm shift:

| From | To |
|------|-----|
| Single-model prompting | Specialized agents collaborating |
| Human-as-router | Infrastructure-managed coordination |
| Framework abstractions | CLI-native autonomous systems |

**If that shift happens, the TAM is knowledge work itself.**

For now: developers and teams who've already hit the ceiling of single-agent workflows.

---

## Get Started

**Stop being the message bus. Start managing AI teams.**

[github.com/petervidaHU/kokino](https://github.com/petervidaHU/kokino)
