#!/usr/bin/env node
/**
 * Manual Test: WebSocket Monitoring Stream
 *
 * Prerequisites:
 * 1. Start broker: cd broker && npm start
 * 2. Run this script: node tests/manual/test-websocket-stream.js
 *
 * This script connects to the monitoring stream and displays all events.
 * Use it to manually verify WebSocket functionality.
 *
 * WHY MANUAL INSTEAD OF AUTOMATED?
 * Integration tests that spin up an in-process broker are complex to maintain
 * and prone to timing issues. This manual script provides:
 * - Visual verification of event flow
 * - Easy debugging of WebSocket behavior
 * - Real-world testing against running broker
 * - No test framework complexity
 *
 * Combine with unit tests (tests/unit/MonitoringStream.test.js) for full coverage.
 */

import WebSocket from 'ws';
import { nanoid } from 'nanoid';

const BROKER_URL = 'http://127.0.0.1:5050';
const WS_URL = 'ws://127.0.0.1:5050/api/monitoring/stream';

console.log('='.repeat(60));
console.log('WebSocket Monitoring Stream - Manual Test');
console.log('='.repeat(60));
console.log();

// Helper: Send HTTP request
async function request(path, options = {}) {
  const url = `${BROKER_URL}${path}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

// Helper: Create agent
async function createAgent(agentId) {
  console.log(`  → Creating agent: ${agentId}`);
  return request('/agents/register', {
    method: 'POST',
    body: JSON.stringify({
      agentId,
      type: 'test',
      metadata: {},
      heartbeatIntervalMs: 30000
    })
  });
}

// Helper: Send message
async function sendMessage(fromAgent, toAgent, payload, threadId = null) {
  console.log(`  → Sending message: ${fromAgent} → ${toAgent}: "${payload}"`);
  return request(`/agents/${toAgent}/send`, {
    method: 'POST',
    body: JSON.stringify({
      from: fromAgent,
      payload,
      metadata: { threadId }
    })
  });
}

// Main test
async function main() {
  console.log('[1] Connecting to WebSocket...');

  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('  ✓ Connected!');
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log();
    console.log(`[EVENT] ${message.type}`);
    console.log(JSON.stringify(message, null, 2));
  });

  ws.on('error', (error) => {
    console.error('  ✗ WebSocket error:', error.message);
    process.exit(1);
  });

  ws.on('close', () => {
    console.log();
    console.log('[DISCONNECTED] WebSocket closed');
    process.exit(0);
  });

  // Wait for connection
  await new Promise(resolve => {
    ws.once('open', resolve);
  });

  console.log();
  console.log('[2] Waiting for connection confirmation...');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log();
  console.log('[3] Testing message.sent events...');
  const agent1 = `test-agent-1-${nanoid(6)}`;
  const agent2 = `test-agent-2-${nanoid(6)}`;

  await createAgent(agent1);
  await createAgent(agent2);
  await sendMessage(agent1, agent2, 'Hello from agent 1');
  await sendMessage(agent2, agent1, 'Hello back from agent 2');

  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log();
  console.log('[4] Testing agent filtering...');
  console.log(`  → Setting filter to only show ${agent1}`);

  ws.send(JSON.stringify({
    type: 'filter',
    agents: [agent1]
  }));

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log(`  → Sending message from ${agent1} (should see)`);
  await sendMessage(agent1, agent2, 'Filtered message from agent1');

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log(`  → Sending message from ${agent2} (should NOT see)`);
  await sendMessage(agent2, agent1, 'This should be filtered out');

  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log();
  console.log('[5] Clearing filters...');
  ws.send(JSON.stringify({
    type: 'filter',
    agents: null,
    types: null
  }));

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log();
  console.log('[6] Testing event type filtering...');
  console.log('  → Setting filter to only show "message" events');

  ws.send(JSON.stringify({
    type: 'filter',
    types: ['message']
  }));

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('  → Creating new agent (should NOT see agent.status event)');
  const agent3 = `test-agent-3-${nanoid(6)}`;
  await createAgent(agent3);

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('  → Sending message (should see message.sent event)');
  await sendMessage(agent1, agent3, 'Type-filtered message');

  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log();
  console.log('[7] Test complete! Press Ctrl+C to exit.');
  console.log('    The WebSocket will stay connected to show live events.');
  console.log();
}

main().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
