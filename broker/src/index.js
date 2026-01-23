import * as http from 'node:http';
import { WebSocketServer } from 'ws';
import { URL } from 'node:url';
import { spawn } from 'node:child_process';

import { AgentRegistry } from './models/AgentRegistry.js';
import { TicketStore } from './models/TicketStore.js';
import { MessageRepository } from './db/MessageRepository.js';
import { ConversationStore } from './db/ConversationStore.js';
import { AgentRunner } from './agents/AgentRunner.js';
import { createAgentRoutes } from './routes/agents.js';
import { createMessageRoutes } from './routes/messages.js';
import { createGitHubRoutes } from './routes/github.js';
import { jsonResponse, handleCors } from './utils/response.js';

const PORT = Number(process.env.BROKER_PORT || 5050);
const HOST = process.env.BROKER_HOST || '127.0.0.1'; // IPv4 enforcement

console.log(`[broker] Starting Kokino message broker...`);
console.log(`[broker] Node version: ${process.version}`);

// Initialize stores
const registry = new AgentRegistry();
const ticketStore = new TicketStore(registry);
const messageRepository = new MessageRepository();
const conversationStore = new ConversationStore();
const agentRunner = new AgentRunner(registry, conversationStore);

console.log('[broker] ✓ AgentRunner initialized for headless execution');

// Create route handlers
const agentRoutes = createAgentRoutes(registry, ticketStore, messageRepository, agentRunner, conversationStore);
const messageRoutes = createMessageRoutes(ticketStore, messageRepository);
const githubRoutes = createGitHubRoutes();

// Cleanup old tickets every minute
setInterval(() => {
  ticketStore.cleanup(60000); // Remove tickets older than 1 minute
}, 60000);

// HTTP Server
const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (handleCors(req, res)) return;

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  console.log(`[${method}] ${pathname}`);

  try {
    // Health check
    if (pathname === '/health') {
      return jsonResponse(res, 200, {
        status: 'ok',
        agents: registry.size(),
        tickets: ticketStore.size(),
        uptime: process.uptime()
      });
    }

    // Agent registration
    if (pathname === '/agents/register' && method === 'POST') {
      return await agentRoutes.register(req, res);
    }

    // List agents
    if (pathname === '/agents' && method === 'GET') {
      return await agentRoutes.list(req, res);
    }

    // Agent-specific routes
    const agentMatch = pathname.match(/^\/agents\/([^\/]+)$/);
    if (agentMatch) {
      const agentId = agentMatch[1];

      if (method === 'DELETE') {
        return await agentRoutes.delete(req, res, agentId);
      }
    }

    // Send message to agent
    const sendMatch = pathname.match(/^\/agents\/([^\/]+)\/send$/);
    if (sendMatch && method === 'POST') {
      const agentId = sendMatch[1];
      return await agentRoutes.send(req, res, agentId);
    }

    // Get pending tickets for agent
    const ticketsMatch = pathname.match(/^\/agents\/([^\/]+)\/tickets\/pending$/);
    if (ticketsMatch && method === 'GET') {
      const agentId = ticketsMatch[1];
      return await agentRoutes.getPendingTickets(req, res, agentId);
    }

    // Heartbeat
    const heartbeatMatch = pathname.match(/^\/agents\/([^\/]+)\/heartbeat$/);
    if (heartbeatMatch && method === 'POST') {
      const agentId = heartbeatMatch[1];
      return await agentRoutes.heartbeat(req, res, agentId);
    }

    // Lifecycle: Start
    const startMatch = pathname.match(/^\/agents\/([^\/]+)\/start$/);
    if (startMatch && method === 'POST') {
      const agentId = startMatch[1];
      return await agentRoutes.start(req, res, agentId);
    }

    // Lifecycle: Stop
    const stopMatch = pathname.match(/^\/agents\/([^\/]+)\/stop$/);
    if (stopMatch && method === 'POST') {
      const agentId = stopMatch[1];
      return await agentRoutes.stop(req, res, agentId);
    }

    // Lifecycle: Restart
    const restartMatch = pathname.match(/^\/agents\/([^\/]+)\/restart$/);
    if (restartMatch && method === 'POST') {
      const agentId = restartMatch[1];
      return await agentRoutes.restart(req, res, agentId);
    }

    // Lifecycle: Kill tmux session
    const killTmuxMatch = pathname.match(/^\/agents\/([^\/]+)\/kill-tmux$/);
    if (killTmuxMatch && method === 'POST') {
      const agentId = killTmuxMatch[1];
      return await agentRoutes.killTmux(req, res, agentId);
    }

    // Headless Execution: Execute task
    const executeMatch = pathname.match(/^\/agents\/([^\/]+)\/execute$/);
    if (executeMatch && method === 'POST') {
      const agentId = executeMatch[1];
      return await agentRoutes.execute(req, res, agentId);
    }

    // Headless Execution: End session
    const endSessionMatch = pathname.match(/^\/agents\/([^\/]+)\/end-session$/);
    if (endSessionMatch && method === 'POST') {
      const agentId = endSessionMatch[1];
      return await agentRoutes.endSession(req, res, agentId);
    }

    // Headless Execution: Get agent conversations
    const conversationsMatch = pathname.match(/^\/agents\/([^\/]+)\/conversations$/);
    if (conversationsMatch && method === 'GET') {
      const agentId = conversationsMatch[1];
      return await agentRoutes.getConversations(req, res, agentId);
    }

    // Headless Execution: Get specific conversation
    const conversationMatch = pathname.match(/^\/conversations\/([^\/]+)$/);
    if (conversationMatch) {
      const conversationId = conversationMatch[1];
      if (method === 'GET') {
        return await agentRoutes.getConversation(req, res, conversationId);
      }
      if (method === 'DELETE') {
        return await agentRoutes.deleteConversation(req, res, conversationId);
      }
    }

    // Post reply
    if (pathname === '/replies' && method === 'POST') {
      return await messageRoutes.postReply(req, res);
    }

    // Get reply status
    const replyMatch = pathname.match(/^\/replies\/([^\/]+)$/);
    if (replyMatch && method === 'GET') {
      const ticketId = replyMatch[1];
      return await messageRoutes.getReply(req, res, ticketId);
    }

    // Wait for reply (long-poll)
    const waitMatch = pathname.match(/^\/replies\/([^\/]+)\/wait$/);
    if (waitMatch && method === 'GET') {
      const ticketId = waitMatch[1];
      return await messageRoutes.waitForReply(req, res, ticketId);
    }

    // Acknowledge ticket delivery
    const acknowledgeMatch = pathname.match(/^\/tickets\/([^\/]+)\/acknowledge$/);
    if (acknowledgeMatch && method === 'POST') {
      const ticketId = acknowledgeMatch[1];
      return await messageRoutes.acknowledgeTicket(req, res, ticketId);
    }

    // Message history
    if (pathname === '/api/messages/history' && method === 'GET') {
      return await messageRoutes.getHistory(req, res);
    }

    // Thread messages
    const threadMatch = pathname.match(/^\/api\/messages\/thread\/([^\/]+)$/);
    if (threadMatch && method === 'GET') {
      const threadId = threadMatch[1];
      return await messageRoutes.getThread(req, res, threadId);
    }

    // Agent messages
    const agentMessagesMatch = pathname.match(/^\/api\/messages\/agent\/([^\/]+)$/);
    if (agentMessagesMatch && method === 'GET') {
      const agentId = agentMessagesMatch[1];
      return await messageRoutes.getAgentMessages(req, res, agentId);
    }

    // Phase 9: GitHub OAuth
    if (pathname === '/api/github/oauth' && method === 'POST') {
      return await githubRoutes.exchangeOAuthCode(req, res);
    }

    // Phase 9: GitHub Webhook
    if (pathname === '/api/github/webhook' && method === 'POST') {
      return await githubRoutes.handleWebhook(req, res);
    }

    // 404
    jsonResponse(res, 404, { error: 'Not found' });

  } catch (error) {
    console.error('[server] Unhandled error:', error);
    jsonResponse(res, 500, { error: 'Internal server error' });
  }
});

// WebSocket Server (for terminal connections - Phase 6)
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  console.log(`[ws] New WebSocket connection: ${url.pathname}`);

  // Terminal proxy endpoint: /ws/terminal/:agentId
  const terminalMatch = url.pathname.match(/^\/ws\/terminal\/([^\/]+)$/);
  if (terminalMatch) {
    const agentId = terminalMatch[1];
    console.log(`[ws] Terminal connection for agent: ${agentId}`);

    // Spawn tmux attach process
    const tmuxSession = `dev-${agentId}`;

    // Try to attach to existing session, or create new one if it doesn't exist
    const pty = spawn('tmux', ['new-session', '-A', '-s', tmuxSession, '-x', '80', '-y', '24'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      }
    });

    let ptyActive = true;

    // PTY stdout → WebSocket
    pty.stdout.on('data', (data) => {
      if (ws.readyState === 1 && ptyActive) {
        ws.send(data.toString());
      }
    });

    // PTY stderr → WebSocket (error messages)
    pty.stderr.on('data', (data) => {
      if (ws.readyState === 1 && ptyActive) {
        const error = data.toString();
        console.error(`[ws/${agentId}] PTY error:`, error);
        ws.send(`\x1b[31m${error}\x1b[0m`);
      }
    });

    // WebSocket → PTY stdin
    ws.on('message', (data) => {
      if (ptyActive && pty.stdin.writable) {
        pty.stdin.write(data);
      }
    });

    // Handle PTY process exit
    pty.on('exit', (code) => {
      console.log(`[ws/${agentId}] PTY process exited with code ${code}`);
      ptyActive = false;
      if (ws.readyState === 1) {
        ws.send(`\r\n\x1b[33m[Session ended with code ${code}]\x1b[0m\r\n`);
        ws.close();
      }
    });

    pty.on('error', (err) => {
      console.error(`[ws/${agentId}] PTY error:`, err);
      ptyActive = false;
      if (ws.readyState === 1) {
        ws.send(`\r\n\x1b[31m[Error: ${err.message}]\x1b[0m\r\n`);
        ws.close();
      }
    });

    // Cleanup on WebSocket disconnect
    ws.on('close', () => {
      console.log(`[ws/${agentId}] WebSocket closed`);
      if (ptyActive) {
        ptyActive = false;
        // Detach from tmux session (don't kill it)
        pty.stdin.end();
        pty.kill('SIGTERM');
      }
    });

    ws.on('error', (err) => {
      // Only log real errors, not cleanup errors
      if (ws.readyState !== 2 && ws.readyState !== 3) {
        console.error(`[ws/${agentId}] WebSocket error:`, err);
      }
    });

    return;
  }

  // Unknown WebSocket endpoint
  ws.send(JSON.stringify({ error: 'Unknown WebSocket endpoint' }));
  ws.close();
});

// Start server
server.listen(PORT, HOST, () => {
  console.log(`[broker] ✓ HTTP server listening on http://${HOST}:${PORT}`);
  console.log(`[broker] ✓ WebSocket server ready`);
  console.log(`[broker] ✓ Health check: http://${HOST}:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[broker] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('[broker] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[broker] SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('[broker] Server closed');
    process.exit(0);
  });
});
