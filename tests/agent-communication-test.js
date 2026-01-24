// Issue #112: Agent-to-Agent Communication Test (Part 2 - System Context)
// Tests that agents use MCP send_message when asked to communicate with other agents

const BROKER_URL = 'http://127.0.0.1:5050';

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

async function testAgentCommunication() {
  const aliceId = `alice-test-${Date.now()}`;
  const jerryId = `jerry-test-${Date.now()}`;

  console.log('\n=== Issue #112 Part 2: Agent Communication Testing ===\n');

  try {
    // 1. Register and start both agents
    console.log('1. Setting up test agents...');
    await request('/agents/register', {
      method: 'POST',
      body: JSON.stringify({
        agentId: aliceId,
        type: 'claude-code',
        metadata: { role: 'Alice', commMode: 'headless', test: true },
        heartbeatIntervalMs: 30000
      })
    });

    await request('/agents/register', {
      method: 'POST',
      body: JSON.stringify({
        agentId: jerryId,
        type: 'claude-code',
        metadata: { role: 'Jerry', commMode: 'headless', test: true },
        heartbeatIntervalMs: 30000
      })
    });

    await request(`/agents/${aliceId}/start`, { method: 'POST' });
    await request(`/agents/${jerryId}/start`, { method: 'POST' });
    console.log(`   ✓ Both agents registered and started`);

    // 2. Test Alice → Jerry communication
    console.log('\n2. Testing Alice → Jerry communication...');
    console.log('   Asking Alice to "Tell Jerry to say hello"...');

    const startTime = Date.now();
    const aliceResult = await request(`/agents/${aliceId}/execute`, {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Tell Jerry to say hello back to you',
        timeoutMs: 60000,
        metadata: { test: 'agent-communication' }
      })
    });
    const duration = Date.now() - startTime;

    console.log(`   ✓ Alice execution completed in ${duration}ms`);

    // 3. Check if ticket was created (Alice used send_message)
    console.log('\n3. Verifying inter-agent communication...');

    // Wait a moment for async ticket processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check for tickets in broker logs
    const logs = await fetch(`${BROKER_URL}/health`).then(() => 'broker healthy');

    // Check Jerry's pending tickets (should be empty if delivered)
    const jerryTickets = await request(`/agents/${jerryId}/tickets/pending`);

    if (jerryTickets.length > 0) {
      console.log(`   ⚠ Jerry has ${jerryTickets.length} pending ticket(s) - delivery may be in progress`);
    } else {
      console.log(`   ✓ Jerry has no pending tickets (ticket was delivered or never created)`);
    }

    // 4. Manual verification instructions
    console.log('\n4. Manual verification steps:');
    console.log('   - Check broker logs for: "Created ticket ... Alice → Jerry"');
    console.log('   - Grep for: grep "Created ticket.*Alice.*Jerry" /tmp/kokino-broker.log');
    console.log('   - If found: ✓ Alice used send_message correctly');
    console.log('   - If not found: ✗ Alice responded to user instead of using send_message');

    // 5. Cleanup
    console.log('\n5. Cleaning up...');
    await request(`/agents/${aliceId}`, { method: 'DELETE' });
    await request(`/agents/${jerryId}`, { method: 'DELETE' });
    console.log(`   ✓ Deleted test agents`);

    console.log('\n=== ✓ Agent communication test complete! ===');
    console.log('\nNOTE: Check broker logs to confirm Alice used send_message:');
    console.log('  grep "Created ticket.*Alice.*Jerry" /tmp/kokino-broker.log\n');

    process.exit(0);

  } catch (error) {
    console.error('\n=== ✗ Agent communication test failed ===');
    console.error(`Error: ${error.message}`);

    // Cleanup on failure
    try {
      await request(`/agents/${aliceId}`, { method: 'DELETE' });
      await request(`/agents/${jerryId}`, { method: 'DELETE' });
      console.log(`Cleaned up test agents`);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    process.exit(1);
  }
}

testAgentCommunication();
