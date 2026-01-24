#!/usr/bin/env node
/**
 * Dual-Mode Load Testing Suite for Kokino
 *
 * Tests both tmux and headless communication modes under load:
 * - Burst testing (high throughput)
 * - Mixed-mode concurrency (tmux + headless)
 * - Runtime fallback scenarios
 * - Resource monitoring
 *
 * Usage:
 *   node tests/load/headless-load-test.js
 *   node tests/load/headless-load-test.js --burst-only
 *   node tests/load/headless-load-test.js --fallback-only
 */

import { performance } from 'node:perf_hooks';

class DualModeLoadTest {
  constructor(brokerUrl = 'http://127.0.0.1:5050') {
    this.brokerUrl = brokerUrl;
    this.results = [];
  }

  /**
   * Burst test: Send N messages as fast as possible
   * @param {string} commMode - 'tmux', 'headless', or 'mixed'
   */
  async burstTest({ agentCount = 10, messagesPerAgent = 10, commMode = 'headless' }) {
    console.log(`\n🔥 Burst test (${commMode}): ${agentCount} agents × ${messagesPerAgent} messages`);

    const agents = Array.from({ length: agentCount }, (_, i) => {
      const mode = commMode === 'mixed' ? (i % 2 === 0 ? 'tmux' : 'headless') : commMode;
      return { id: `load-test-${mode}-${i}`, commMode: mode };
    });

    // Register all agents
    console.log('  📝 Registering agents...');
    await Promise.all(agents.map(a => this.registerAgent(a.id, a.commMode)));

    // Send all messages simultaneously
    console.log('  🚀 Sending messages...');
    const startTime = performance.now();
    const promises = [];

    for (const agent of agents) {
      for (let i = 0; i < messagesPerAgent; i++) {
        promises.push(this.sendMessage(agent.id, `Test message ${i + 1}`));
      }
    }

    const results = await Promise.allSettled(promises);
    const endTime = performance.now();

    const stats = {
      commMode,
      total: results.length,
      succeeded: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      durationMs: Math.round(endTime - startTime),
      throughput: Math.round((results.length / ((endTime - startTime) / 1000)) * 100) / 100,
    };

    // Calculate latency stats from successful results
    const latencies = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value.durationMs)
      .sort((a, b) => a - b);

    if (latencies.length > 0) {
      stats.latencyP50 = Math.round(latencies[Math.floor(latencies.length * 0.5)]);
      stats.latencyP95 = Math.round(latencies[Math.floor(latencies.length * 0.95)]);
      stats.latencyP99 = Math.round(latencies[Math.floor(latencies.length * 0.99)]);
    }

    console.log(`  ✅ Burst test (${commMode}) complete:`);
    console.log(`     Total: ${stats.total}, Succeeded: ${stats.succeeded}, Failed: ${stats.failed}`);
    console.log(`     Duration: ${stats.durationMs}ms, Throughput: ${stats.throughput} msg/sec`);
    if (stats.latencyP50) {
      console.log(`     Latency: P50=${stats.latencyP50}ms, P95=${stats.latencyP95}ms, P99=${stats.latencyP99}ms`);
    }

    // Cleanup
    await this.cleanupAgents(agents.map(a => a.id));

    return stats;
  }

  /**
   * Fallback scenario test: Disable headless mid-test
   */
  async fallbackTest({ agentCount = 5, messagesTotal = 50 }) {
    console.log(`\n🔄 Fallback test: ${agentCount} agents, disable headless mid-flight`);

    const agents = Array.from({ length: agentCount }, (_, i) => `fallback-test-${i}`);

    // Register as headless
    console.log('  📝 Registering headless agents...');
    await Promise.all(agents.map(id => this.registerAgent(id, 'headless')));

    const stats = { sent: 0, succeeded: 0, failed: 0, messageLoss: 0 };
    const messagesBefore = Math.floor(messagesTotal / 2);

    // Send first half
    console.log(`  🚀 Sending ${messagesBefore} messages in headless mode...`);
    for (let i = 0; i < messagesBefore; i++) {
      const agentId = agents[i % agents.length];
      try {
        await this.sendMessage(agentId, `Message ${i + 1}`);
        stats.succeeded++;
      } catch (err) {
        stats.failed++;
        console.log(`     ⚠️  Message ${i + 1} failed: ${err.message}`);
      }
      stats.sent++;
    }

    // Disable headless for claude-code
    console.log('  ⚠️  Disabling headless mode...');
    const disableRes = await fetch(`${this.brokerUrl}/api/fallback/cli/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliType: 'claude-code', reason: 'Load test fallback scenario' }),
    });

    if (!disableRes.ok) {
      console.log('     ⚠️  Failed to disable headless mode, continuing anyway...');
    }

    // Send second half (should auto-fallback to tmux)
    console.log(`  🔄 Sending ${messagesTotal - messagesBefore} messages (should fallback to tmux)...`);
    for (let i = messagesBefore; i < messagesTotal; i++) {
      const agentId = agents[i % agents.length];
      try {
        await this.sendMessage(agentId, `Message ${i + 1}`);
        stats.succeeded++;
      } catch (err) {
        stats.messageLoss++;
        console.log(`     ❌ Message ${i + 1} lost: ${err.message}`);
      }
      stats.sent++;
    }

    // Re-enable headless
    console.log('  🔄 Re-enabling headless mode...');
    const enableRes = await fetch(`${this.brokerUrl}/api/fallback/cli/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliType: 'claude-code' }),
    });

    if (!enableRes.ok) {
      console.log('     ⚠️  Failed to re-enable headless mode');
    }

    stats.messageLossRate = Math.round((stats.messageLoss / stats.sent) * 10000) / 100;

    console.log(`  ✅ Fallback test complete:`);
    console.log(`     Sent: ${stats.sent}, Succeeded: ${stats.succeeded}, Lost: ${stats.messageLoss}`);
    console.log(`     Message loss rate: ${stats.messageLossRate}%`);

    // Cleanup
    await this.cleanupAgents(agents);

    return stats;
  }

  /**
   * Concurrency test: Verify session locking serializes requests
   */
  async concurrencyTest({ agentId = 'concurrency-test', concurrentRequests = 5 }) {
    console.log(`\n🔐 Concurrency test: ${concurrentRequests} concurrent requests to same agent`);

    // Register single agent
    console.log('  📝 Registering agent...');
    await this.registerAgent(agentId, 'headless');

    // Send concurrent requests
    console.log('  🚀 Sending concurrent requests...');
    const startTime = performance.now();
    const promises = Array.from({ length: concurrentRequests }, (_, i) =>
      this.sendMessage(agentId, `Concurrent message ${i + 1}`)
    );

    const results = await Promise.allSettled(promises);
    const endTime = performance.now();

    const stats = {
      total: results.length,
      succeeded: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      durationMs: Math.round(endTime - startTime),
    };

    // Check if requests were properly serialized (should NOT complete in parallel)
    const avgDuration = stats.durationMs / concurrentRequests;
    stats.probablySerialized = avgDuration > 100; // Each request should take some time

    console.log(`  ✅ Concurrency test complete:`);
    console.log(`     Total: ${stats.total}, Succeeded: ${stats.succeeded}, Failed: ${stats.failed}`);
    console.log(`     Duration: ${stats.durationMs}ms (avg ${Math.round(avgDuration)}ms/request)`);
    console.log(`     Serialization: ${stats.probablySerialized ? '✅ Properly serialized' : '⚠️  May have executed in parallel'}`);

    // Cleanup
    await this.cleanupAgents([agentId]);

    return stats;
  }

  async registerAgent(agentId, commMode = 'headless') {
    const response = await fetch(`${this.brokerUrl}/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        type: 'claude-code',
        metadata: { role: 'Load Tester', commMode },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to register ${agentId}: ${response.status} ${text}`);
    }

    return response.json();
  }

  async sendMessage(agentId, prompt) {
    const startTime = performance.now();

    const response = await fetch(`${this.brokerUrl}/agents/${agentId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, timeoutMs: 30000 }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Execute failed for ${agentId}: ${response.status} ${text}`);
    }

    const result = await response.json();
    const endTime = performance.now();

    return {
      ...result,
      durationMs: endTime - startTime,
    };
  }

  async cleanupAgents(agentIds) {
    console.log(`  🧹 Cleaning up ${agentIds.length} agents...`);
    const results = await Promise.allSettled(
      agentIds.map(id =>
        fetch(`${this.brokerUrl}/agents/${id}`, { method: 'DELETE' })
      )
    );
    const cleaned = results.filter(r => r.status === 'fulfilled').length;
    console.log(`     Cleaned up ${cleaned}/${agentIds.length} agents`);
  }

  async checkBrokerHealth() {
    try {
      const response = await fetch(`${this.brokerUrl}/health`);
      if (!response.ok) {
        throw new Error(`Broker health check failed: ${response.status}`);
      }
      return true;
    } catch (err) {
      throw new Error(`Broker not reachable at ${this.brokerUrl}: ${err.message}`);
    }
  }
}

// Run all tests
async function main() {
  const args = process.argv.slice(2);
  const burstOnly = args.includes('--burst-only');
  const fallbackOnly = args.includes('--fallback-only');
  const concurrencyOnly = args.includes('--concurrency-only');

  const tester = new DualModeLoadTest();

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Dual-Mode Load Testing Suite - Kokino         ║');
  console.log('╚══════════════════════════════════════════════════╝');

  // Check broker health
  console.log('\n🏥 Checking broker health...');
  try {
    await tester.checkBrokerHealth();
    console.log('   ✅ Broker is healthy');
  } catch (err) {
    console.error(`   ❌ ${err.message}`);
    console.error('\n💡 Make sure the broker is running:');
    console.error('   cd broker && npm start\n');
    process.exit(1);
  }

  const results = {};

  // Run tests based on flags
  if (fallbackOnly) {
    results.fallback = await tester.fallbackTest({
      agentCount: 5,
      messagesTotal: 50,
    });
  } else if (concurrencyOnly) {
    results.concurrency = await tester.concurrencyTest({
      agentId: 'concurrency-test',
      concurrentRequests: 5,
    });
  } else if (burstOnly) {
    results.headlessBurst = await tester.burstTest({
      agentCount: 10,
      messagesPerAgent: 10,
      commMode: 'headless',
    });
  } else {
    // Run full suite
    console.log('\n📊 Running full test suite...');

    // 1. Headless burst test
    results.headlessBurst = await tester.burstTest({
      agentCount: 10,
      messagesPerAgent: 10,
      commMode: 'headless',
    });

    // 2. Tmux burst test (if tmux agents can be spawned)
    console.log('\n⚠️  Skipping tmux burst test (requires tmux agents)');
    console.log('   To test tmux mode, agents must be manually spawned via tmux');

    // 3. Mixed-mode test (skipping for now)
    console.log('\n⚠️  Skipping mixed-mode test (requires both tmux and headless agents)');

    // 4. Fallback scenario
    results.fallback = await tester.fallbackTest({
      agentCount: 5,
      messagesTotal: 50,
    });

    // 5. Concurrency test
    results.concurrency = await tester.concurrencyTest({
      agentId: 'concurrency-test',
      concurrentRequests: 5,
    });
  }

  // Print summary
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║              Test Summary                        ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  if (results.headlessBurst) {
    console.log('📊 Headless Burst Test:');
    console.log(`   Success Rate: ${Math.round((results.headlessBurst.succeeded / results.headlessBurst.total) * 100)}%`);
    console.log(`   Throughput: ${results.headlessBurst.throughput} msg/sec`);
    if (results.headlessBurst.latencyP95) {
      console.log(`   Latency P95: ${results.headlessBurst.latencyP95}ms`);
    }
  }

  if (results.tmuxBurst) {
    console.log('\n📊 Tmux Burst Test:');
    console.log(`   Success Rate: ${Math.round((results.tmuxBurst.succeeded / results.tmuxBurst.total) * 100)}%`);
    console.log(`   Throughput: ${results.tmuxBurst.throughput} msg/sec`);
  }

  if (results.mixedBurst) {
    console.log('\n📊 Mixed-Mode Test:');
    console.log(`   Success Rate: ${Math.round((results.mixedBurst.succeeded / results.mixedBurst.total) * 100)}%`);
    console.log(`   Throughput: ${results.mixedBurst.throughput} msg/sec`);
  }

  if (results.fallback) {
    console.log('\n🔄 Fallback Scenario:');
    console.log(`   Message Loss Rate: ${results.fallback.messageLossRate}%`);
    console.log(`   Success Rate: ${Math.round((results.fallback.succeeded / results.fallback.sent) * 100)}%`);
  }

  if (results.concurrency) {
    console.log('\n🔐 Concurrency Test:');
    console.log(`   Success Rate: ${Math.round((results.concurrency.succeeded / results.concurrency.total) * 100)}%`);
    console.log(`   Serialization: ${results.concurrency.probablySerialized ? '✅ Pass' : '⚠️  Fail'}`);
  }

  // Validate exit criteria
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║            Exit Criteria                         ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const criteria = [];

  if (results.headlessBurst) {
    const headlessPass = (results.headlessBurst.succeeded / results.headlessBurst.total) > 0.95;
    criteria.push({ name: 'Headless success rate >95%', pass: headlessPass });
  }

  if (results.tmuxBurst) {
    const tmuxPass = (results.tmuxBurst.succeeded / results.tmuxBurst.total) > 0.95;
    criteria.push({ name: 'Tmux success rate >95%', pass: tmuxPass });
  }

  if (results.mixedBurst) {
    const mixedPass = (results.mixedBurst.succeeded / results.mixedBurst.total) > 0.95;
    criteria.push({ name: 'Mixed-mode success rate >95%', pass: mixedPass });
  }

  if (results.fallback) {
    const fallbackPass = results.fallback.messageLossRate < 1;
    criteria.push({ name: 'Fallback message loss <1%', pass: fallbackPass });
  }

  if (results.concurrency) {
    const concurrencyPass = results.concurrency.probablySerialized &&
                           (results.concurrency.succeeded / results.concurrency.total) === 1;
    criteria.push({ name: 'Concurrency serialization', pass: concurrencyPass });
  }

  criteria.forEach(c => {
    console.log(`${c.pass ? '✅' : '❌'} ${c.name}`);
  });

  const allPass = criteria.every(c => c.pass);

  console.log('\n' + (allPass ? '🎉 All exit criteria passed!' : '⚠️  Some exit criteria failed'));

  process.exit(allPass ? 0 : 1);
}

// Handle uncaught errors
process.on('unhandledRejection', (err) => {
  console.error('\n❌ Unhandled error:', err);
  process.exit(1);
});

main().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
