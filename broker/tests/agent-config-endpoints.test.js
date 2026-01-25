#!/usr/bin/env node
/**
 * Agent Configuration API Endpoint Tests
 * Tests all CRUD operations and instantiation for Phase 2
 */

const BROKER_URL = 'http://127.0.0.1:5050';

async function testEndpoint(name, method, path, body = null, expectedStatus = 200) {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const startTime = Date.now();
    const response = await fetch(`${BROKER_URL}${path}`, options);
    const duration = Date.now() - startTime;

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    const success = response.status === expectedStatus;
    const status = success ? '✅' : '❌';

    console.log(`${status} ${name}`);
    console.log(`   ${method} ${path}`);
    console.log(`   Status: ${response.status} (expected ${expectedStatus}) - ${duration}ms`);

    if (!success) {
      console.log(`   Response:`, data);
    }

    return { success, data, status: response.status };
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     Agent Configuration API Endpoint Tests      ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  let testConfigId;
  let instantiatedAgentId;

  // Test 1: List all agent configurations
  console.log('1. List Agent Configurations');
  const listResult = await testEndpoint(
    'GET /api/agents',
    'GET',
    '/api/agents'
  );
  if (listResult.success && Array.isArray(listResult.data)) {
    console.log(`   Found ${listResult.data.length} agent configs\n`);
  }

  // Test 2: Get specific agent config (use first one from list)
  if (listResult.data && listResult.data.length > 0) {
    const firstConfig = listResult.data[0];
    console.log(`2. Get Specific Agent Config (${firstConfig.id})`);
    const getResult = await testEndpoint(
      'GET /api/agents/:id',
      'GET',
      `/api/agents/${firstConfig.id}`
    );
    console.log();
  }

  // Test 3: Create new agent configuration
  console.log('3. Create New Agent Config');
  const createResult = await testEndpoint(
    'POST /api/agents',
    'POST',
    '/api/agents',
    {
      name: 'Test Agent',
      role: 'Tester',
      cliType: 'claude-code',
      systemPrompt: 'You are a test agent for automated testing',
      capabilities: ['test', 'validation'],
      metadata: { test: true }
    },
    201
  );
  if (createResult.success && createResult.data.agent) {
    testConfigId = createResult.data.agent.id;
    console.log(`   Created config: ${testConfigId}\n`);
  }

  // Test 4: Update agent configuration
  if (testConfigId) {
    console.log('4. Update Agent Config');
    await testEndpoint(
      'PUT /api/agents/:id',
      'PUT',
      `/api/agents/${testConfigId}`,
      {
        name: 'Updated Test Agent',
        systemPrompt: 'Updated system prompt for testing'
      }
    );
    console.log();
  }

  // Test 5: Clone agent configuration
  if (testConfigId) {
    console.log('5. Clone Agent Config');
    await testEndpoint(
      'POST /api/agents/:id/clone',
      'POST',
      `/api/agents/${testConfigId}/clone`,
      {
        name: 'Cloned Test Agent'
      },
      201
    );
    console.log();
  }

  // Test 6: Instantiate agent from configuration
  if (testConfigId) {
    console.log('6. Instantiate Agent from Config');
    const instantiateResult = await testEndpoint(
      'POST /api/agents/:id/instantiate',
      'POST',
      `/api/agents/${testConfigId}/instantiate`,
      {
        name: 'test-agent-instance-1'
      },
      201
    );
    if (instantiateResult.success && instantiateResult.data.agent) {
      instantiatedAgentId = instantiateResult.data.agent.agentId;
      console.log(`   Instantiated: ${instantiatedAgentId}`);
      console.log(`   Config ID: ${instantiateResult.data.agent.configId}`);
      console.log(`   Project ID: ${instantiateResult.data.agent.projectId}\n`);
    }
  }

  // Test 7: Verify instantiated agent has project_id and config_id
  if (instantiatedAgentId) {
    console.log('7. Verify Agent Linkage');
    const agentListResult = await testEndpoint(
      'GET /adapter/agents',
      'GET',
      '/api/adapter/agents'
    );
    if (agentListResult.success && Array.isArray(agentListResult.data)) {
      const instantiatedAgent = agentListResult.data.find(a => a.agentId === instantiatedAgentId);
      if (instantiatedAgent) {
        const hasConfigId = instantiatedAgent.configId !== null && instantiatedAgent.configId !== undefined;
        const hasProjectId = instantiatedAgent.projectId !== null && instantiatedAgent.projectId !== undefined;

        console.log(`   ✅ Agent found in registry`);
        console.log(`   ${hasConfigId ? '✅' : '❌'} config_id: ${instantiatedAgent.configId}`);
        console.log(`   ${hasProjectId ? '✅' : '❌'} project_id: ${instantiatedAgent.projectId}\n`);
      } else {
        console.log(`   ❌ Agent not found in registry\n`);
      }
    }
  }

  // Test 8: Delete agent configuration
  if (testConfigId) {
    console.log('8. Delete Agent Config');
    await testEndpoint(
      'DELETE /api/agents/:id',
      'DELETE',
      `/api/agents/${testConfigId}`
    );
    console.log();
  }

  // Test 9: Test timeout protection (was blocking issue #1)
  console.log('9. Test POST endpoint response time');
  const createResult2 = await testEndpoint(
    'POST /api/agents (timeout test)',
    'POST',
    '/api/agents',
    {
      name: 'Quick Test',
      role: 'Tester'
    },
    201
  );
  if (createResult2.success) {
    // Cleanup
    await fetch(`${BROKER_URL}/api/agents/${createResult2.data.agent.id}`, { method: 'DELETE' });
  }
  console.log();

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║             Tests Complete                       ║');
  console.log('╚══════════════════════════════════════════════════╝');
}

main().catch(console.error);
