import * as http from 'node:http';
import { WebSocketServer } from 'ws';
import { URL } from 'node:url';
import { spawn } from 'node:child_process';

import { AgentRegistry } from './models/AgentRegistry.js';
import { TicketStore } from './models/TicketStore.js';
import { MessageRepository } from './db/MessageRepository.js';
import { ConversationStore } from './db/ConversationStore.js';
import { ConversationIntegrityChecker } from './db/ConversationIntegrityChecker.js';
import { AgentRunner } from './agents/AgentRunner.js';
import { ShadowModeController } from './agents/ShadowModeController.js';
import { FallbackController } from './agents/FallbackController.js';
import { createAgentRoutes } from './routes/agents.js';
import { createMessageRoutes } from './routes/messages.js';
import { createGitHubRoutes } from './routes/github.js';
import { jsonResponse, handleCors } from './utils/response.js';
import { getMetricsCollector } from './telemetry/MetricsCollector.js';
import { PrometheusExporter } from './telemetry/PrometheusExporter.js';
import { EnvironmentDoctor } from './agents/EnvironmentDoctor.js';

const PORT = Number(process.env.BROKER_PORT || 5050);
const HOST = process.env.BROKER_HOST || '127.0.0.1'; // IPv4 enforcement

console.log(`[broker] Starting Kokino message broker...`);
console.log(`[broker] Node version: ${process.version}`);

// Initialize stores (order matters for dependencies)
const registry = new AgentRegistry();
const messageRepository = new MessageRepository();
const conversationStore = new ConversationStore();
const agentRunner = new AgentRunner(registry, conversationStore);

// Initialize fallback controller
const fallbackController = new FallbackController();

// Initialize shadow mode controller (must be before TicketStore)
const shadowModeController = new ShadowModeController(null, agentRunner); // ticketStore passed after creation

const ticketStore = new TicketStore(registry, agentRunner, shadowModeController, fallbackController); // Pass controllers

// Wire ticketStore back into shadowModeController (circular dependency)
shadowModeController.ticketStore = ticketStore;

// Initialize telemetry
const metricsCollector = getMetricsCollector();
const prometheusExporter = new PrometheusExporter(metricsCollector);

// Initialize environment doctor
const environmentDoctor = new EnvironmentDoctor();

// Initialize integrity checker
const integrityChecker = new ConversationIntegrityChecker();

console.log('[broker] ✓ AgentRunner initialized for headless execution');
console.log('[broker] ✓ FallbackController initialized for runtime degradation');
console.log('[broker] ✓ ShadowModeController initialized for parallel testing');
console.log('[broker] ✓ Telemetry & monitoring initialized');
console.log('[broker] ✓ Environment Doctor initialized');
console.log('[broker] ✓ Conversation Integrity Checker initialized');

// Run startup health check for claude-code (most common CLI)
(async () => {
  console.log('[broker] Running startup environment check for claude-code...');
  const healthCheck = await environmentDoctor.check('claude-code');

  if (!healthCheck.passed) {
    console.error('[broker] ⚠️  WARNING: Environment check FAILED for claude-code');
    console.error('[broker] Failed checks:', healthCheck.checks.filter(c => !c.passed).map(c => `${c.name}: ${c.message}`).join(', '));
    console.error('[broker] Headless execution may not work properly.');
  } else if (healthCheck.warnings.length > 0) {
    console.warn('[broker] ⚠️  Environment check passed with warnings:');
    healthCheck.warnings.forEach(w => console.warn(`[broker]   - ${w}`));
  } else {
    console.log('[broker] ✓ Environment check passed for claude-code');
  }
})();

// Create route handlers
const agentRoutes = createAgentRoutes(registry, ticketStore, messageRepository, agentRunner, conversationStore);
const messageRoutes = createMessageRoutes(ticketStore, messageRepository);
const githubRoutes = createGitHubRoutes();

// Cleanup old tickets every minute
setInterval(() => {
  ticketStore.cleanup(60000); // Remove tickets older than 1 minute
}, 60000);

// Cleanup old metrics daily (90-day retention)
setInterval(() => {
  metricsCollector.cleanup(90); // Remove metrics older than 90 days
}, 86400000); // 24 hours

// Run nightly integrity check at 2am
const scheduleNightlyIntegrityCheck = () => {
  const now = new Date();
  const next2am = new Date(now);
  next2am.setHours(2, 0, 0, 0);

  // If 2am already passed today, schedule for tomorrow
  if (next2am <= now) {
    next2am.setDate(next2am.getDate() + 1);
  }

  const msUntil2am = next2am - now;

  setTimeout(() => {
    console.log('[broker] Running nightly integrity check...');
    integrityChecker.runFullCheck();

    // Schedule next run (24 hours)
    setInterval(() => {
      console.log('[broker] Running nightly integrity check...');
      integrityChecker.runFullCheck();
    }, 86400000); // 24 hours
  }, msUntil2am);
};

scheduleNightlyIntegrityCheck();

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

    // Prometheus metrics
    if (pathname === '/metrics' && method === 'GET') {
      const metrics = prometheusExporter.export();
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
      res.end(metrics);
      return;
    }

    // SLO/SLI status
    if (pathname === '/api/slo/status' && method === 'GET') {
      return jsonResponse(res, 200, metricsCollector.getSLIStatus());
    }

    // Environment health check
    if (pathname === '/api/health/environment' && method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const cliType = url.searchParams.get('cli');

      if (cliType) {
        const result = await environmentDoctor.check(cliType);
        return jsonResponse(res, result.passed ? 200 : 503, result);
      } else {
        const result = await environmentDoctor.checkAll();
        return jsonResponse(res, result.overall ? 200 : 503, result);
      }
    }

    // Conversation integrity check
    if (pathname === '/api/integrity/check' && method === 'GET') {
      const report = integrityChecker.runFullCheck();
      const hasIssues = report.orphanedTurns > 0 || report.conversationsWithIssues > 0;
      return jsonResponse(res, hasIssues ? 503 : 200, report);
    }

    // Cleanup orphaned turns
    if (pathname === '/api/integrity/cleanup' && method === 'POST') {
      const count = integrityChecker.cleanupOrphans();
      return jsonResponse(res, 200, { deleted: count, message: `Cleaned up ${count} orphaned turns` });
    }

    // Conversation store statistics
    if (pathname === '/api/integrity/stats' && method === 'GET') {
      const stats = integrityChecker.getStats();
      return jsonResponse(res, 200, stats);
    }

    // Shadow mode metrics
    if (pathname === '/api/shadow-mode/metrics' && method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const days = Number(url.searchParams.get('days')) || 30;
      const metrics = shadowModeController.getShadowMetrics(days);
      return jsonResponse(res, 200, metrics);
    }

    // Shadow mode failures
    if (pathname === '/api/shadow-mode/failures' && method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const mode = url.searchParams.get('mode') || 'headless';
      const limit = Number(url.searchParams.get('limit')) || 100;
      const failures = shadowModeController.getShadowFailures(mode, limit);
      return jsonResponse(res, 200, failures);
    }

    // Shadow mode output mismatches
    if (pathname === '/api/shadow-mode/mismatches' && method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const limit = Number(url.searchParams.get('limit')) || 100;
      const mismatches = shadowModeController.getShadowMismatches(limit);
      return jsonResponse(res, 200, mismatches);
    }

    // Fallback status
    if (pathname === '/api/fallback/status' && method === 'GET') {
      const status = fallbackController.getStatus();
      return jsonResponse(res, 200, status);
    }

    // Disable CLI type
    if (pathname === '/api/fallback/cli/disable' && method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      await new Promise(resolve => req.on('end', resolve));
      const { cliType, reason } = JSON.parse(body);
      fallbackController.disableCLI(cliType, reason);
      return jsonResponse(res, 200, { message: `Disabled headless for ${cliType}` });
    }

    // Enable CLI type
    if (pathname === '/api/fallback/cli/enable' && method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      await new Promise(resolve => req.on('end', resolve));
      const { cliType } = JSON.parse(body);
      fallbackController.enableCLI(cliType);
      return jsonResponse(res, 200, { message: `Re-enabled headless for ${cliType}` });
    }

    // Force agent fallback
    if (pathname === '/api/fallback/agent/force' && method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      await new Promise(resolve => req.on('end', resolve));
      const { agentId, reason } = JSON.parse(body);
      fallbackController.forceAgentFallback(agentId, reason);
      return jsonResponse(res, 200, { message: `Forced ${agentId} to tmux` });
    }

    // Clear agent fallback
    if (pathname === '/api/fallback/agent/clear' && method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      await new Promise(resolve => req.on('end', resolve));
      const { agentId } = JSON.parse(body);
      fallbackController.clearAgentFallback(agentId);
      return jsonResponse(res, 200, { message: `Cleared fallback for ${agentId}` });
    }

    // Clear all fallbacks
    if (pathname === '/api/fallback/clear-all' && method === 'POST') {
      fallbackController.clearAll();
      return jsonResponse(res, 200, { message: 'Cleared all fallbacks' });
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

    // Headless Execution: Cancel execution
    const cancelMatch = pathname.match(/^\/agents\/([^\/]+)\/execute\/cancel$/);
    if (cancelMatch && method === 'POST') {
      const agentId = cancelMatch[1];
      return await agentRoutes.cancelExecution(req, res, agentId);
    }

    // Headless Execution: End session
    const endSessionMatch = pathname.match(/^\/agents\/([^\/]+)\/end-session$/);
    if (endSessionMatch && method === 'POST') {
      const agentId = endSessionMatch[1];
      return await agentRoutes.endSession(req, res, agentId);
    }

    // Session Manager: Get all session statuses
    if (pathname === '/agents/sessions/status' && method === 'GET') {
      return await agentRoutes.getSessionStatus(req, res);
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

    // Process supervisor status
    if (pathname === '/agents/processes/status' && method === 'GET') {
      return await agentRoutes.getProcessStatus(req, res);
    }

    // Circuit breaker status
    if (pathname === '/agents/circuits/status' && method === 'GET') {
      return await agentRoutes.getCircuitStatus(req, res);
    }

    // Reset circuit breaker for agent
    const resetCircuitMatch = pathname.match(/^\/agents\/([^\/]+)\/circuit\/reset$/);
    if (resetCircuitMatch && method === 'POST') {
      const agentId = resetCircuitMatch[1];
      return await agentRoutes.resetCircuit(req, res, agentId);
    }

    // Log rotator status
    if (pathname === '/agents/logs/status' && method === 'GET') {
      return await agentRoutes.getLogStatus(req, res);
    }

    // Agent logs
    const logsMatch = pathname.match(/^\/agents\/([^\/]+)\/logs$/);
    if (logsMatch && method === 'GET') {
      const agentId = logsMatch[1];
      return await agentRoutes.getLogs(req, res, agentId);
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
