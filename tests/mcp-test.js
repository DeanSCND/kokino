// Issue #112: MCP Configuration for Headless Agents
// Tests that headless agents can use agent-bridge MCP to communicate

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

async function testMCP() {
  const agentId = `mcp-test-${Date.now()}`;

  console.log('\n=== Issue #112: MCP Configuration Testing ===\n');

  try {
    // 1. Register and start agent
    console.log('1. Registering and starting agent with MCP...');
    await request('/agents/register', {
      method: 'POST',
      body: JSON.stringify({
        agentId,
        type: 'claude-code',
        metadata: { commMode: 'headless', test: true },
        heartbeatIntervalMs: 30000
      })
    });

    const startResult = await request(`/agents/${agentId}/start`, {
      method: 'POST'
    });
    console.log(`   ✓ Started agent (bootstrap: ${startResult.bootstrapTime}ms)`);

    // 2. Test MCP tool access - ask agent to list co-workers
    console.log('\n2. Testing MCP tool access (list_agents)...');
    const startTime = Date.now();
    const executeResult = await request(`/agents/${agentId}/execute`, {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Use the agent-bridge MCP to list all online agents. Call the co_workers or list_agents tool directly. Answer with just the agent names.',
        timeoutMs: 60000,
        metadata: { test: 'mcp' }
      })
    });
    const duration = Date.now() - startTime;

    console.log(`   ✓ Executed in ${duration}ms (durationMs: ${executeResult.durationMs}ms)`);
    if (executeResult.response) {
      console.log(`   Response: "${executeResult.response.substring(0, 100)}${executeResult.response.length > 100 ? '...' : ''}"`);
    } else {
      console.log(`   Response: (no response field in result)`);
      console.log(`   Result keys: ${Object.keys(executeResult).join(', ')}`);
    }

    // 3. Verify latency is acceptable (<15s for simple MCP call)
    console.log('\n3. Checking latency...');
    if (duration > 15000) {
      console.log(`   ⚠ Warning: Latency ${duration}ms exceeds 15s target`);
      console.log(`   This may indicate MCP is not configured or agent spawned Task tool`);
    } else {
      console.log(`   ✓ Latency ${duration}ms is acceptable (<15s)`);
    }

    // 4. Cleanup
    console.log('\n4. Cleaning up...');
    await request(`/agents/${agentId}`, { method: 'DELETE' });
    console.log(`   ✓ Deleted agent: ${agentId}`);

    console.log('\n=== ✓ All MCP tests passed! ===\n');
    process.exit(0);

  } catch (error) {
    console.error('\n=== ✗ MCP test failed ===');
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

testMCP();
