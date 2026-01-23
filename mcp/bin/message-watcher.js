#!/usr/bin/env node

/**
 * Message Watcher - Polls broker for pending messages and injects them into tmux panes
 *
 * Usage:
 *   message-watcher.js --agent <agentId> --session <tmuxSession> [--pane <paneId>] [--no-auto-submit]
 *
 * Environment:
 *   BRIDGE_BROKER_URL - Broker URL (default: http://127.0.0.1:5050)
 *   POLL_INTERVAL_MS - Polling interval (default: 5000)
 */

import { spawn } from 'node:child_process';

const BROKER_URL = process.env.BRIDGE_BROKER_URL || 'http://127.0.0.1:5050';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
const INJECTION_COOLDOWN_MS = 2000;
const TERMINAL_READY_TIMEOUT_MS = 60000; // 1 minute max wait

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    autoSubmit: true // Default to true
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--no-auto-submit' || arg === '--no-auto-submit=true') {
      config.autoSubmit = false;
    } else if (arg.startsWith('--')) {
      const key = arg.replace(/^--/, '');
      const val = args[i + 1];
      if (val && !val.startsWith('--')) {
        config[key] = val;
        i++;
      } else {
        config[key] = true;
      }
    }
  }

  return config;
}

/**
 * Send keys to tmux using atomic buffer operations
 * CRITICAL: This prevents race conditions and ensures reliable injection
 */
async function sendTmuxKeys(session, pane, text, pressEnter = true) {
  // If pane ID is provided and starts with %, use it directly (it's globally unique)
  // Otherwise combine session:pane for window.pane format
  const target = pane && pane.startsWith('%') ? pane : (pane ? `${session}:${pane}` : session);

  // 1. Clear any existing input (Ctrl-C, Ctrl-U)
  await new Promise((resolve, reject) => {
    const tmuxClear = spawn('tmux', ['send-keys', '-t', target, 'C-c', 'C-u']);
    tmuxClear.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('Failed to clear terminal'));
    });
  });

  // 2. Wait for prompt to settle
  await new Promise(r => setTimeout(r, 1500));

  // 3. Load content into buffer (atomic operation)
  await new Promise((resolve, reject) => {
    const tmuxLoad = spawn('tmux', ['load-buffer', '-']);
    tmuxLoad.stdin.write(text);
    tmuxLoad.stdin.end();
    tmuxLoad.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('Failed to load tmux buffer'));
    });
  });

  // 4. Paste buffer to terminal (atomic operation)
  await new Promise((resolve, reject) => {
    const tmuxPaste = spawn('tmux', ['paste-buffer', '-t', target, '-d']);
    tmuxPaste.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('Failed to paste tmux buffer'));
    });
  });

  // 5. Send Enter if requested
  if (pressEnter) {
    await new Promise(r => setTimeout(r, 500)); // Let buffer settle
    await new Promise((resolve, reject) => {
      const tmuxEnter = spawn('tmux', ['send-keys', '-t', target, 'C-m']);
      tmuxEnter.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('Failed to send Enter'));
      });
    });
  }
}

/**
 * Check if tmux session exists
 */
async function sessionExists(session) {
  return new Promise((resolve) => {
    const tmux = spawn('tmux', ['has-session', '-t', session]);
    tmux.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Check if terminal is ready to receive input
 */
async function isTerminalReady(session, pane) {
  return new Promise((resolve) => {
    const target = pane && pane.startsWith('%') ? pane : (pane ? `${session}:${pane}` : session);
    const tmux = spawn('tmux', ['capture-pane', '-pt', target, '-S', '-5']);
    let output = '';
    tmux.stdout.on('data', (d) => output += d.toString());
    tmux.on('close', (code) => {
      if (code !== 0) return resolve(true); // Assume ready if can't check

      const lines = output.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length === 0) return resolve(true);

      // Look for shell prompts
      const promptRegex = /^>\s*|[$%#>]\s*$/;
      const isReady = lines.some(line => promptRegex.test(line) || line.includes('Ready and waiting'));

      resolve(isReady);
    });
  });
}

/**
 * Fetch pending messages from broker
 */
async function checkPendingMessages(agentId, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${BROKER_URL}/agents/${encodeURIComponent(agentId)}/tickets/pending`);

      if (!response.ok) {
        if (response.status === 404) {
          console.error(`[watcher] Agent ${agentId} not registered with broker`);
          return [];
        }
        console.error(`[watcher] Error checking pending (attempt ${attempt}): ${response.status}`);
        if (attempt === retries) return [];
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }

      return await response.json();
    } catch (error) {
      console.error(`[watcher] Error (attempt ${attempt}): ${error.message}`);
      if (attempt === retries) {
        if (error.cause) console.error(`[watcher] Cause: ${error.cause.message}`);
        return [];
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  return [];
}

/**
 * Acknowledge ticket delivery
 */
async function acknowledgeTicket(ticketId) {
  try {
    const response = await fetch(`${BROKER_URL}/tickets/${encodeURIComponent(ticketId)}/acknowledge`, {
      method: 'POST'
    });
    if (!response.ok) {
      console.error(`[watcher] Failed to acknowledge ticket ${ticketId}: ${response.status}`);
    }
  } catch (error) {
    console.error(`[watcher] Error acknowledging ticket: ${error.message}`);
  }
}

/**
 * Generate heredoc command for message injection
 */
function generateHeredoc(ticket, headerText, msgBody) {
  const delimiter = `MSG_${ticket.ticketId.split('-')[0].toUpperCase()}`;

  return `cat << '${delimiter}'
# =========================================
# ${headerText}
# =========================================
# Ticket-ID: ${ticket.ticketId}
#
${msgBody}
#
# ---
# To reply, use the agent-bridge MCP tool:
#   post_reply(ticketId="${ticket.ticketId}", payload="your response")
# =========================================
${delimiter}`;
}

/**
 * Inject message into tmux pane
 * CRITICAL: Add to seenSet BEFORE injection to prevent race conditions
 */
async function injectMessage(config, ticket) {
  const isReply = ticket.originAgent === config.agent;

  // Wait for terminal to be ready (with timeout)
  let ready = false;
  let attempts = 0;
  const maxAttempts = Math.floor(TERMINAL_READY_TIMEOUT_MS / 5000);

  while (!ready && attempts < maxAttempts) {
    ready = await isTerminalReady(config.session, config.pane);
    if (!ready) {
      if (attempts === 0) console.log(`[watcher] Terminal busy, waiting for prompt...`);
      attempts++;
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  if (!ready) {
    console.warn(`[watcher] ⚠️ Terminal not ready after ${TERMINAL_READY_TIMEOUT_MS}ms, injecting anyway...`);
  }

  const headerText = isReply
    ? `↩️ REPLY TO YOUR MESSAGE`
    : `📬 NEW MESSAGE FROM: ${ticket.metadata?.origin || 'unknown agent'}`;
  const msgBody = isReply ? (ticket.response?.payload || '') : (ticket.payload || '');

  const command = generateHeredoc(ticket, headerText, msgBody);

  try {
    await sendTmuxKeys(config.session, config.pane, command, config.autoSubmit);

    if (config.autoSubmit) {
      console.log(`[watcher] ✅ Injected and auto-submitted ${isReply ? 'reply' : 'message'} ${ticket.ticketId}`);
    } else {
      console.log(`[watcher] ✅ Injected ${isReply ? 'reply' : 'message'} ${ticket.ticketId} (manual submit required)`);
    }

    await acknowledgeTicket(ticket.ticketId);

    // Cooldown to prevent overwhelming the terminal
    await new Promise(r => setTimeout(r, INJECTION_COOLDOWN_MS));

  } catch (error) {
    console.error(`[watcher] ❌ Failed to inject message: ${error.message}`);
  }
}

async function main() {
  const config = parseArgs();

  if (!config.agent || !config.session) {
    console.error('Usage: message-watcher.js --agent <agentId> --session <tmuxSession> [--pane <paneId>] [--no-auto-submit]');
    console.error('');
    console.error('Options:');
    console.error('  --agent <id>        Agent ID registered with broker');
    console.error('  --session <name>    Tmux session name');
    console.error('  --pane <id>         Tmux pane ID (optional, uses first pane if not specified)');
    console.error('  --no-auto-submit    Don\'t auto-execute messages (requires manual Enter)');
    console.error('');
    console.error('Environment:');
    console.error('  BRIDGE_BROKER_URL   Broker URL (default: http://127.0.0.1:5050)');
    console.error('  POLL_INTERVAL_MS    Polling interval (default: 5000)');
    process.exit(1);
  }

  console.log(`[watcher] Starting message watcher for ${config.agent}`);
  console.log(`[watcher] Target: tmux ${config.session}${config.pane ? ':' + config.pane : ''}`);
  console.log(`[watcher] Auto-submit: ${config.autoSubmit ? 'YES' : 'NO'}`);
  console.log(`[watcher] Polling interval: ${POLL_INTERVAL_MS}ms`);

  // Verify session exists
  if (!await sessionExists(config.session)) {
    console.error(`[watcher] ❌ Tmux session '${config.session}' does not exist`);
    process.exit(1);
  }

  const seenTickets = new Set();
  let isPolling = false;

  async function pollWrapper() {
    if (isPolling) return;
    isPolling = true;

    try {
      // Check if session still exists
      if (!await sessionExists(config.session)) {
        console.error(`[watcher] ❌ Tmux session '${config.session}' died, exiting...`);
        process.exit(0);
      }

      const tickets = await checkPendingMessages(config.agent);

      // Process tickets one by one to avoid terminal buffer overflows
      for (const ticket of tickets) {
        // CRITICAL: Add to seenSet BEFORE injection to prevent race conditions
        if (!seenTickets.has(ticket.ticketId)) {
          seenTickets.add(ticket.ticketId);
          await injectMessage(config, ticket);
        }
      }
    } catch (error) {
      console.error(`[watcher] Error in poll cycle: ${error.message}`);
    } finally {
      isPolling = false;
    }
  }

  // Initial poll
  await pollWrapper();

  // Continuous polling
  setInterval(pollWrapper, POLL_INTERVAL_MS);

  console.log(`[watcher] 👀 Watching for messages...`);
}

main().catch((error) => {
  console.error('[watcher] Fatal error:', error);
  process.exit(1);
});
