// Issue #110: Agent Lifecycle State Testing
// Tests: idle → starting → ready → busy → ready → error

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

async function testLifecycle() {
  const agentId = `lifecycle-test-${Date.now()}`;

  console.log('\n=== Issue #110: Agent Lifecycle State Testing ===\n');

  try {
    // 1. Register agent (should start in idle state)
    console.log('1. Registering agent (should start in idle state)...');
    const registerResult = await request('/agents/register', {
      method: 'POST',
      body: JSON.stringify({
        agentId,
        type: 'claude-code',
        metadata: { commMode: 'headless', test: true },
        heartbeatIntervalMs: 30000
      })
    });
    console.log(`   ✓ Registered: status="${registerResult.status}" (expected: "idle")`);

    if (registerResult.status !== 'idle') {
      throw new Error(`Expected idle status, got: ${registerResult.status}`);
    }

    // 2. Start agent (idle → starting → ready)
    console.log('\n2. Starting agent (idle → starting → ready)...');
    const startResult = await request(`/agents/${agentId}/start`, {
      method: 'POST'
    });
    console.log(`   ✓ Started: status="${startResult.status}" (expected: "ready")`);
    console.log(`   Bootstrap time: ${startResult.bootstrapTime}ms`);

    if (startResult.status !== 'ready') {
      throw new Error(`Expected ready status after start, got: ${startResult.status}`);
    }

    // 3. Execute task (ready → busy → ready)
    console.log('\n3. Executing task (ready → busy → ready)...');
    const executeResult = await request(`/agents/${agentId}/execute`, {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'What is 2+2? Answer in one word.',
        timeoutMs: 30000,
        metadata: { test: 'lifecycle' }
      })
    });
    console.log(`   ✓ Executed: durationMs=${executeResult.durationMs}`);
    if (executeResult.response) {
      console.log(`   Response: "${executeResult.response.substring(0, 50)}${executeResult.response.length > 50 ? '...' : ''}"`);
    } else {
      console.log(`   Response: (no response returned)`);
    }

    // 4. Check final status (should be ready)
    console.log('\n4. Checking final status (should be ready)...');
    const agents = await request('/agents');
    const agent = agents.find(a => a.agentId === agentId);
    console.log(`   ✓ Final status: "${agent.status}" (expected: "ready")`);

    if (agent.status !== 'ready') {
      throw new Error(`Expected ready status after execute, got: ${agent.status}`);
    }

    // 5. Cleanup
    console.log('\n5. Cleaning up...');
    await request(`/agents/${agentId}`, { method: 'DELETE' });
    console.log(`   ✓ Deleted agent: ${agentId}`);

    console.log('\n=== ✓ All lifecycle tests passed! ===\n');
    process.exit(0);

  } catch (error) {
    console.error('\n=== ✗ Lifecycle test failed ===');
    console.error(`Error: ${error.message}`);

    // Cleanup on failure
    try {
      await request(`/agents/${agentId}`, { method: 'DELETE' });
      console.log(`Cleaned up test agent: ${agentId}`);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    process.exit(1);
  }
}

testLifecycle();
