import * as http from 'node:http';
import { WebSocketServer } from 'ws';
import { URL } from 'node:url';

import { AgentRegistry } from './models/AgentRegistry.js';
import { TicketStore } from './models/TicketStore.js';
import { createAgentRoutes } from './routes/agents.js';
import { createMessageRoutes } from './routes/messages.js';
import { jsonResponse, handleCors } from './utils/response.js';

const PORT = Number(process.env.BROKER_PORT || 5050);
const HOST = process.env.BROKER_HOST || '127.0.0.1'; // IPv4 enforcement

console.log(`[broker] Starting Kokino message broker...`);
console.log(`[broker] Node version: ${process.version}`);

// Initialize stores
const registry = new AgentRegistry();
const ticketStore = new TicketStore();

// Create route handlers
const agentRoutes = createAgentRoutes(registry, ticketStore);
const messageRoutes = createMessageRoutes(ticketStore);

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

    // Phase 6 will implement tmux PTY proxy
    ws.send(JSON.stringify({
      type: 'info',
      message: 'Terminal proxy not yet implemented (Phase 6)'
    }));

    ws.on('message', (data) => {
      console.log(`[ws/${agentId}] Received:`, data.toString());
    });

    ws.on('close', () => {
      console.log(`[ws/${agentId}] Connection closed`);
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
