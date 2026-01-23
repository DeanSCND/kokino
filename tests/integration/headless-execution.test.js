#!/usr/bin/env node
/**
 * Headless Agent Execution Integration Test
 *
 * Tests direct CLI subprocess execution via AgentRunner
 * Validates conversation storage, JSONL parsing, and session management
 *
 * Prerequisites:
 * - Broker running on http://127.0.0.1:5050
 * - Claude CLI available in PATH
 * - Valid Claude subscription (ANTHROPIC_API_KEY should NOT be set)
 *
 * Usage:
 *   node tests/integration/headless-execution.test.js
 */

const BROKER_URL = 'http://127.0.0.1:5050';
const TEST_AGENT_ID = 'test-headless-agent';

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Helper: Make HTTP request
async function request(path, options = {}) {
  const url = `${BROKER_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

// Test 1: Register headless agent
async function test1_registerAgent() {
  log('\n[Test 1] Registering headless agent...', 'cyan');

  const result = await request('/agents/register', {
    method: 'POST',
    body: JSON.stringify({
      agentId: TEST_AGENT_ID,
      type: 'claude-code',
      metadata: {
        role: 'Test Agent',
        commMode: 'headless',
        systemPrompt: 'You are a test agent. Keep responses brief.'
      },
      heartbeatIntervalMs: 30000
    })
  });

  log(`✓ Agent registered: ${result.agentId} (commMode: ${result.metadata.commMode})`, 'green');
  return result;
}

// Test 2: Execute simple task
async function test2_executeTask() {
  log('\n[Test 2] Executing simple task...', 'cyan');

  const startTime = Date.now();

  const result = await request(`/agents/${TEST_AGENT_ID}/execute`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Say "Hello from headless mode!" and nothing else.',
      timeoutMs: 60000,
      metadata: { test: true }
    })
  });

  const duration = Date.now() - startTime;

  log(`✓ Task executed in ${duration}ms`, 'green');
  log(`  Conversation ID: ${result.conversationId}`, 'dim');
  log(`  Response: ${result.content.substring(0, 100)}...`, 'dim');
  log(`  Success: ${result.success}`, 'dim');

  return result;
}

// Test 3: Get conversation history
async function test3_getConversation(conversationId) {
  log('\n[Test 3] Fetching conversation history...', 'cyan');

  const conversation = await request(`/conversations/${conversationId}`);

  log(`✓ Conversation fetched: ${conversation.conversationId}`, 'green');
  log(`  Agent ID: ${conversation.agentId}`, 'dim');
  log(`  Turns: ${conversation.turns.length}`, 'dim');

  conversation.turns.forEach((turn, index) => {
    log(`  Turn ${index + 1} [${turn.role}]: ${turn.content.substring(0, 50)}...`, 'dim');
  });

  if (conversation.turns.length !== 2) {
    throw new Error(`Expected 2 turns (user + assistant), got ${conversation.turns.length}`);
  }

  return conversation;
}

// Test 4: Execute follow-up task (session continuity)
async function test4_sessionContinuity() {
  log('\n[Test 4] Testing session continuity...', 'cyan');

  const result = await request(`/agents/${TEST_AGENT_ID}/execute`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'What was my previous message?',
      timeoutMs: 60000
    })
  });

  log(`✓ Follow-up executed`, 'green');
  log(`  Response: ${result.content.substring(0, 100)}...`, 'dim');

  // Check if response references previous message
  const refersToHello = result.content.toLowerCase().includes('hello');
  if (!refersToHello) {
    log(`⚠ Warning: Response may not reference previous message`, 'yellow');
  } else {
    log(`✓ Session continuity confirmed (referenced "hello")`, 'green');
  }

  return result;
}

// Test 5: List agent conversations
async function test5_listConversations() {
  log('\n[Test 5] Listing agent conversations...', 'cyan');

  const conversations = await request(`/agents/${TEST_AGENT_ID}/conversations`);

  log(`✓ Found ${conversations.length} conversation(s)`, 'green');
  conversations.forEach((conv, index) => {
    log(`  Conversation ${index + 1}: ${conv.conversationId} (updated: ${conv.updatedAt})`, 'dim');
  });

  if (conversations.length === 0) {
    throw new Error('Expected at least 1 conversation');
  }

  return conversations;
}

// Test 6: End session
async function test6_endSession() {
  log('\n[Test 6] Ending agent session...', 'cyan');

  const result = await request(`/agents/${TEST_AGENT_ID}/end-session`, {
    method: 'POST'
  });

  log(`✓ Session ended: ${result.status}`, 'green');
  return result;
}

// Test 7: Cleanup
async function test7_cleanup() {
  log('\n[Test 7] Cleaning up test agent...', 'cyan');

  await request(`/agents/${TEST_AGENT_ID}`, {
    method: 'DELETE'
  });

  log(`✓ Agent deleted`, 'green');
}

// Main test runner
async function runTests() {
  log('='.repeat(60), 'cyan');
  log('Headless Agent Execution Integration Test', 'cyan');
  log('='.repeat(60), 'cyan');

  let conversationId;

  try {
    // Check broker health
    log('\nChecking broker health...', 'cyan');
    const health = await request('/health');
    log(`✓ Broker is healthy (agents: ${health.agents}, uptime: ${Math.floor(health.uptime)}s)`, 'green');

    // Run tests
    await test1_registerAgent();
    const executeResult = await test2_executeTask();
    conversationId = executeResult.conversationId;
    await test3_getConversation(conversationId);
    await test4_sessionContinuity();
    await test5_listConversations();
    await test6_endSession();
    await test7_cleanup();

    // Summary
    log('\n' + '='.repeat(60), 'green');
    log('✓ ALL TESTS PASSED', 'green');
    log('='.repeat(60), 'green');
    log('\nHeadless execution is working correctly!', 'green');

  } catch (error) {
    log('\n' + '='.repeat(60), 'red');
    log('✗ TEST FAILED', 'red');
    log('='.repeat(60), 'red');
    log(`\nError: ${error.message}`, 'red');
    if (error.stack) {
      log(`\n${error.stack}`, 'dim');
    }

    // Cleanup on failure
    try {
      await request(`/agents/${TEST_AGENT_ID}`, { method: 'DELETE' });
      log('\n✓ Cleaned up test agent', 'yellow');
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    process.exit(1);
  }
}

// Run tests
runTests();
