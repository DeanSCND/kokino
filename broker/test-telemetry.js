#!/usr/bin/env node

/**
 * Test script for telemetry system
 * Emits synthetic events and validates SLI calculations
 */

import { MetricsCollector } from './src/telemetry/MetricsCollector.js';

const metrics = new MetricsCollector('./data/test-metrics.db');

console.log('\n=== Testing Telemetry System ===\n');

// Emit synthetic events
console.log('Emitting synthetic events...\n');

// 10 successful executions
for (let i = 0; i < 10; i++) {
  metrics.record('EXECUTION_STARTED', 'test-agent-1', {
    cliType: 'claude-code',
    metadata: { test: true }
  });

  const duration = 5000 + Math.random() * 25000; // 5-30s
  metrics.record('EXECUTION_COMPLETED', 'test-agent-1', {
    cliType: 'claude-code',
    durationMs: duration,
    success: true,
    metadata: { sessionId: `session-${i}` }
  });
}

// 2 failed executions
for (let i = 0; i < 2; i++) {
  metrics.record('EXECUTION_STARTED', 'test-agent-2', {
    cliType: 'gemini',
    metadata: { test: true }
  });

  metrics.record('EXECUTION_FAILED', 'test-agent-2', {
    cliType: 'gemini',
    durationMs: 2000,
    success: false,
    metadata: { error: 'API timeout' }
  });
}

// 1 timeout
metrics.record('EXECUTION_STARTED', 'test-agent-3', {
  cliType: 'factory-droid'
});

metrics.record('EXECUTION_TIMEOUT', 'test-agent-3', {
  cliType: 'factory-droid',
  durationMs: 300000,
  success: false,
  metadata: { error: 'Execution timeout after 300s' }
});

console.log('✓ Emitted 13 synthetic events (10 success, 2 failure, 1 timeout)\n');

// Calculate SLIs
console.log('=== SLI Calculations ===\n');

const availability = metrics.getAvailability(24);
console.log(`Availability (24h): ${(availability * 100).toFixed(2)}%`);
console.log(`  Target: ≥99.5%`);
console.log(`  Status: ${availability >= 0.995 ? '✓ PASS' : '✗ FAIL'}\n`);

const p50 = metrics.getLatencyPercentile(50, 24);
const p95 = metrics.getLatencyPercentile(95, 24);
const p99 = metrics.getLatencyPercentile(99, 24);
console.log(`Latency P50: ${(p50 / 1000).toFixed(2)}s`);
console.log(`Latency P95: ${(p95 / 1000).toFixed(2)}s`);
console.log(`Latency P99: ${(p99 / 1000).toFixed(2)}s`);
console.log(`  Target: P95 <30s`);
console.log(`  Status: ${p95 < 30000 ? '✓ PASS' : '✗ FAIL'}\n`);

// Error budget
console.log('=== Error Budget ===\n');

const availabilityBudget = metrics.getErrorBudget('availability', 24 * 30);
console.log(`Availability Error Budget (30-day):`);
console.log(`  Total Budget: ${availabilityBudget.budget} failed executions`);
console.log(`  Consumed: ${availabilityBudget.consumed} (${availabilityBudget.percentConsumed}%)`);
console.log(`  Remaining: ${availabilityBudget.remaining}`);
console.log(`  Status: ${availabilityBudget.percentConsumed < 100 ? '✓ OK' : '✗ EXHAUSTED'}\n`);

const latencyBudget = metrics.getErrorBudget('latency', 24);
console.log(`Latency Error Budget (24h):`);
console.log(`  Total Budget: ${latencyBudget.budget} slow executions (>30s)`);
console.log(`  Consumed: ${latencyBudget.consumed} (${latencyBudget.percentConsumed}%)`);
console.log(`  Remaining: ${latencyBudget.remaining}\n`);

// Event counts
console.log('=== Event Counts ===\n');
const events = metrics.getEventCounts(24);
for (const [event, count] of Object.entries(events)) {
  console.log(`  ${event}: ${count}`);
}
console.log();

// SLI Status (full dashboard data)
console.log('=== SLI Status (Dashboard) ===\n');
const status = metrics.getSLIStatus();
console.log(JSON.stringify(status, null, 2));

// Cleanup
metrics.close();
console.log('\n✓ Test completed. Metrics DB: data/test-metrics.db\n');
