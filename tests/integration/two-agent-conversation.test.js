#!/usr/bin/env node

/**
 * Integration Test: Two-Agent Conversation (Issue #18)
 *
 * Tests bidirectional async messaging between two agents:
 * 1. Spawn Alice
 * 2. Spawn Bob
 * 3. Alice sends message to Bob
 * 4. Verify Bob receives in pending tickets
 * 5. Bob replies
 * 6. Verify Alice receives reply via reverse ticket
 *
 * Acceptance Criteria:
 * - Message delivery < 10 seconds
 * - No duplicate messages
 * - Clean cleanup (agents deregistered, tmux sessions killed)
 * - Passes 10/10 runs
 */

import { spawn, execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BROKER_URL = process.env.BROKER_URL || 'http://127.0.0.1:5050';
const TEST_TIMEOUT_MS = 10000; // 10 second requirement

// Color output for readability
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`❌ Assertion failed: ${message}`);
  }
  log(`✓ ${message}`, 'green');
}

async function fetch(url, options = {}) {
  const response = await globalThis.fetch(url, options);
  return response;
}

/**
 * Register agent with broker
 */
async function registerAgent(agentId, type = 'test-agent') {
  const response = await fetch(`${BROKER_URL}/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId,
      type,
      metadata: { test: true, session: `test-${agentId}` },
      heartbeatIntervalMs: 60000
    })
  });

  assert(response.ok, `Registered ${agentId}`);
  return await response.json();
}

/**
 * Send message from one agent to another
 */
async function sendMessage(fromAgent, toAgent, payload) {
  const startTime = Date.now();

  const response = await fetch(`${BROKER_URL}/agents/${toAgent}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload,
      metadata: { origin: fromAgent, testMessage: true },
      expectReply: false,
      timeoutMs: 30000
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send message (${response.status}): ${errorText}`);
  }

  assert(response.ok, `${fromAgent} sent message to ${toAgent}`);
  const result = await response.json();

  return { ticketId: result.ticketId, timestamp: startTime };
}

/**
 * Get pending tickets for an agent
 */
async function getPendingTickets(agentId) {
  const response = await fetch(`${BROKER_URL}/agents/${agentId}/tickets/pending`);
  assert(response.ok, `Fetched pending tickets for ${agentId}`);
  return await response.json();
}

/**
 * Post reply to a ticket
 */
async function postReply(ticketId, payload, fromAgent) {
  const response = await fetch(`${BROKER_URL}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ticketId,
      payload,
      metadata: { origin: fromAgent }
    })
  });

  assert(response.status === 204, `Posted reply to ticket ${ticketId.substring(0, 8)}...`);
}

/**
 * Delete agent from broker
 */
async function deleteAgent(agentId) {
  const response = await fetch(`${BROKER_URL}/agents/${agentId}`, {
    method: 'DELETE'
  });

  assert(response.status === 204 || response.status === 404, `Deleted ${agentId} from broker`);
}

/**
 * Kill tmux session (silent - doesn't fail if session doesn't exist)
 */
function killTmuxSession(sessionName) {
  try {
    execSync(`tmux has-session -t ${sessionName} 2>/dev/null`, { stdio: 'ignore' });
    execSync(`tmux kill-session -t ${sessionName}`, { stdio: 'ignore' });
    log(`  ✓ Killed tmux session: ${sessionName}`, 'cyan');
  } catch {
    // Session doesn't exist - that's fine
  }
}

/**
 * Wait for condition with timeout
 */
async function waitFor(conditionFn, timeout = 10000, interval = 500, description = 'condition') {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await conditionFn();
    if (result) return result;
    await sleep(interval);
  }

  throw new Error(`Timeout waiting for ${description} (${timeout}ms)`);
}

/**
 * Main test
 */
async function runTest() {
  const testStart = Date.now();

  log('\n==========================================', 'cyan');
  log('Integration Test: Two-Agent Conversation', 'cyan');
  log('==========================================\n', 'cyan');

  const ALICE = 'TestAlice';
  const BOB = 'TestBob';

  try {
    // Setup: Register agents
    log('1. Setting up agents...', 'blue');
    await registerAgent(ALICE, 'test-agent');
    await registerAgent(BOB, 'test-agent');
    log('');

    // Step 1: Alice sends message to Bob
    log('2. Alice sends message to Bob...', 'blue');
    const aliceMessage = { content: 'Hi Bob! Can you help me with this task?' };
    const { ticketId: aliceTicket, timestamp: aliceSendTime } = await sendMessage(ALICE, BOB, aliceMessage);
    log(`   Ticket ID: ${aliceTicket.substring(0, 8)}...`, 'cyan');
    log('');

    // Step 2: Verify Bob receives the message
    log('3. Verifying Bob receives message...', 'blue');
    const bobTickets = await waitFor(
      async () => {
        const tickets = await getPendingTickets(BOB);
        return tickets.length > 0 ? tickets : null;
      },
      TEST_TIMEOUT_MS,
      500,
      'Bob to receive message'
    );

    const aliceDeliveryTime = Date.now() - aliceSendTime;
    log(`   ⏱️  Delivery time: ${aliceDeliveryTime}ms`, 'yellow');
    assert(aliceDeliveryTime < TEST_TIMEOUT_MS, `Message delivered to Bob in <${TEST_TIMEOUT_MS}ms`);
    assert(bobTickets.length === 1, 'Bob received exactly 1 message (no duplicates)');
    assert(bobTickets[0].ticketId === aliceTicket, 'Bob received correct ticket');
    assert(bobTickets[0].metadata?.isReply !== true, 'Bob\'s ticket is not marked as reply');
    log('');

    // Step 3: Bob replies to Alice
    log('4. Bob replies to Alice...', 'blue');
    const bobReply = { content: 'Sure Alice, I\'d be happy to help!' };
    const bobReplyTime = Date.now();
    await postReply(aliceTicket, bobReply, BOB);
    log('');

    // Step 4: Verify Alice receives the reply via reverse ticket
    log('5. Verifying Alice receives reply via reverse ticket...', 'blue');
    const aliceTickets = await waitFor(
      async () => {
        const tickets = await getPendingTickets(ALICE);
        const replyTickets = tickets.filter(t => t.metadata?.isReply === true);
        return replyTickets.length > 0 ? replyTickets : null;
      },
      TEST_TIMEOUT_MS,
      500,
      'Alice to receive reply'
    );

    const replyDeliveryTime = Date.now() - bobReplyTime;
    log(`   ⏱️  Reply delivery time: ${replyDeliveryTime}ms`, 'yellow');
    assert(replyDeliveryTime < TEST_TIMEOUT_MS, `Reply delivered to Alice in <${TEST_TIMEOUT_MS}ms`);
    assert(aliceTickets.length === 1, 'Alice received exactly 1 reply (no duplicates)');

    const reverseTicket = aliceTickets[0];
    assert(reverseTicket.metadata?.isReply === true, 'Reverse ticket is marked as reply');
    assert(reverseTicket.metadata?.replyTo === aliceTicket, 'Reverse ticket references original ticket');
    assert(reverseTicket.originAgent === BOB, 'Reverse ticket originates from Bob');
    assert(reverseTicket.targetAgent === ALICE, 'Reverse ticket targets Alice');

    // Verify payload is the reply, not the original message
    const receivedPayload = typeof reverseTicket.payload === 'string'
      ? reverseTicket.payload
      : reverseTicket.payload.content;
    assert(receivedPayload.includes('happy to help'), 'Reverse ticket contains Bob\'s reply payload');
    log('');

    // Cleanup verification
    log('6. Cleaning up...', 'blue');
    await deleteAgent(ALICE);
    await deleteAgent(BOB);
    killTmuxSession(`test-${ALICE}`);
    killTmuxSession(`test-${BOB}`);
    log('');

    const totalTime = Date.now() - testStart;
    log('==========================================', 'green');
    log(`✅ TEST PASSED (${totalTime}ms total)`, 'green');
    log('==========================================\n', 'green');

    return { success: true, duration: totalTime };

  } catch (error) {
    log('\n==========================================', 'red');
    log(`❌ TEST FAILED: ${error.message}`, 'red');
    log('==========================================\n', 'red');

    // Cleanup on failure
    try {
      await deleteAgent(ALICE).catch(() => {});
      await deleteAgent(BOB).catch(() => {});
      killTmuxSession(`test-${ALICE}`);
      killTmuxSession(`test-${BOB}`);
    } catch {}

    return { success: false, error: error.message, duration: Date.now() - testStart };
  }
}

/**
 * Run test multiple times
 */
async function runMultiple(iterations = 10) {
  log('\n╔══════════════════════════════════════════╗', 'cyan');
  log(`║  Running ${iterations} iterations of test suite   ║`, 'cyan');
  log('╚══════════════════════════════════════════╝\n', 'cyan');

  const results = [];
  let passed = 0;
  let failed = 0;

  for (let i = 1; i <= iterations; i++) {
    log(`\n--- Run ${i}/${iterations} ---`, 'yellow');
    const result = await runTest();
    results.push(result);

    if (result.success) {
      passed++;
    } else {
      failed++;
    }

    // Delay between runs to let broker settle
    if (i < iterations) {
      await sleep(1000);
    }
  }

  log('\n╔══════════════════════════════════════════╗', 'cyan');
  log('║          FINAL RESULTS                   ║', 'cyan');
  log('╚══════════════════════════════════════════╝\n', 'cyan');

  log(`Total runs:    ${iterations}`, 'blue');
  log(`Passed:        ${passed}`, passed === iterations ? 'green' : 'yellow');
  log(`Failed:        ${failed}`, failed === 0 ? 'green' : 'red');
  log(`Success rate:  ${(passed / iterations * 100).toFixed(1)}%\n`, passed === iterations ? 'green' : 'yellow');

  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  log(`Average duration: ${avgDuration.toFixed(0)}ms`, 'cyan');

  if (passed === iterations) {
    log('\n✅ ALL TESTS PASSED!', 'green');
    process.exit(0);
  } else {
    log('\n❌ SOME TESTS FAILED', 'red');
    process.exit(1);
  }
}

// Run the test
const args = process.argv.slice(2);
const iterations = args.includes('--iterations')
  ? parseInt(args[args.indexOf('--iterations') + 1], 10)
  : (args.includes('--single') ? 1 : 10);

runMultiple(iterations).catch((error) => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  process.exit(1);
});
