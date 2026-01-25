/**
 * Bootstrap Performance Test
 *
 * Automated test that ensures agent bootstrap completes within target time.
 * This test MUST pass for every commit to prevent performance regressions.
 *
 * Target: <10 seconds for agent bootstrap
 */

import { spawn } from 'node:child_process';
import * as http from 'node:http';
import { getMetricsCollector } from '../src/telemetry/MetricsCollector.js';

// Test configuration
const BROKER_URL = process.env.BROKER_URL || 'http://127.0.0.1:5050';
const BOOTSTRAP_TARGET_MS = 10000; // 10 seconds
const TEST_AGENT_ID = 'perf-test-agent';

/**
 * Make HTTP request to broker
 */
function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BROKER_URL);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: data ? JSON.parse(data) : null
          });
        } catch (err) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * Test agent bootstrap performance
 */
async function testBootstrapPerformance() {
  console.log('🧪 Bootstrap Performance Test');
  console.log('============================');
  console.log(`Target: <${BOOTSTRAP_TARGET_MS}ms`);
  console.log();

  const metricsCollector = getMetricsCollector();

  try {
    // 1. Check broker health
    console.log('1. Checking broker health...');
    const health = await request('/health');
    if (health.status !== 200) {
      throw new Error('Broker is not healthy');
    }
    console.log('   ✓ Broker is healthy');

    // 2. Clean up any existing test agent
    console.log('2. Cleaning up test agent...');
    await request(`/api/adapter/agent/${TEST_AGENT_ID}`, { method: 'DELETE' });
    console.log('   ✓ Cleanup complete');

    // 3. Register test agent
    console.log('3. Registering test agent...');
    const registerResult = await request('/api/adapter/register', {
      method: 'POST',
      body: {
        agentId: TEST_AGENT_ID,
        type: 'claude-code',
        metadata: {
          role: 'Performance Test Agent',
          testRun: true,
          timestamp: new Date().toISOString()
        }
      }
    });

    if (registerResult.status !== 200) {
      throw new Error(`Failed to register agent: ${registerResult.body?.error}`);
    }
    console.log('   ✓ Agent registered');

    // 4. Measure bootstrap time
    console.log('4. Starting agent (measuring bootstrap)...');
    const startTime = process.hrtime.bigint();

    const startResult = await request('/api/adapter/start', {
      method: 'POST',
      body: { agentId: TEST_AGENT_ID }
    });

    const endTime = process.hrtime.bigint();
    const durationMs = Number((endTime - startTime) / 1000000n);

    // 5. Record metrics
    metricsCollector.record('BOOTSTRAP_TEST', TEST_AGENT_ID, {
      durationMs,
      success: durationMs < BOOTSTRAP_TARGET_MS,
      metadata: {
        target: BOOTSTRAP_TARGET_MS,
        exceeded: durationMs > BOOTSTRAP_TARGET_MS,
        timestamp: new Date().toISOString()
      }
    });

    // 6. Evaluate results
    console.log();
    console.log('Results:');
    console.log('--------');
    console.log(`Bootstrap time: ${durationMs}ms`);
    console.log(`Target:        ${BOOTSTRAP_TARGET_MS}ms`);

    if (durationMs < BOOTSTRAP_TARGET_MS) {
      console.log(`Status:        ✅ PASS (${BOOTSTRAP_TARGET_MS - durationMs}ms under target)`);
    } else {
      console.log(`Status:        ❌ FAIL (${durationMs - BOOTSTRAP_TARGET_MS}ms over target)`);
    }

    // 7. Cleanup
    console.log();
    console.log('5. Cleaning up...');
    await request('/api/adapter/stop', {
      method: 'POST',
      body: { agentId: TEST_AGENT_ID }
    });
    await request(`/api/adapter/agent/${TEST_AGENT_ID}`, { method: 'DELETE' });
    console.log('   ✓ Test agent cleaned up');

    // 8. Check recent bootstrap trends
    console.log();
    console.log('Recent Bootstrap Performance:');
    console.log('-----------------------------');
    const recentTests = await getRecentBootstrapTests();
    if (recentTests.length > 0) {
      const avg = recentTests.reduce((sum, t) => sum + t.duration, 0) / recentTests.length;
      const min = Math.min(...recentTests.map(t => t.duration));
      const max = Math.max(...recentTests.map(t => t.duration));

      console.log(`Last ${recentTests.length} runs:`);
      console.log(`  Average: ${Math.round(avg)}ms`);
      console.log(`  Min:     ${min}ms`);
      console.log(`  Max:     ${max}ms`);

      // Check for regression
      if (durationMs > avg * 1.2) {
        console.log('  ⚠️  WARNING: Performance regression detected (20% slower than average)');
      }
    }

    // Return test result
    const passed = durationMs < BOOTSTRAP_TARGET_MS;
    if (!passed) {
      process.exit(1); // Exit with error code for CI
    }

    console.log();
    console.log('✅ Bootstrap performance test passed');
    process.exit(0);

  } catch (error) {
    console.error();
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

/**
 * Get recent bootstrap test results from metrics
 */
async function getRecentBootstrapTests() {
  try {
    const result = await request('/api/metrics/performance?hours=24');
    if (result.status !== 200) return [];

    // Filter for bootstrap tests
    // This is a simplified version - in production you'd query the DB directly
    return [];
  } catch {
    return [];
  }
}

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Wait a moment for broker to be ready (if just started)
  setTimeout(testBootstrapPerformance, 1000);
}

export { testBootstrapPerformance, BOOTSTRAP_TARGET_MS };