#!/usr/bin/env node

/**
 * API Endpoints Test Script
 *
 * Tests all new API adapter and metrics endpoints to ensure they work correctly.
 * Run this after starting the broker to verify Phase 0 implementation.
 */

import * as http from 'node:http';

const BROKER_URL = process.env.BROKER_URL || 'http://127.0.0.1:5050';
const TEST_AGENT_ID = 'api-test-agent';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

/**
 * Make HTTP request
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
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          });
        } catch (err) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * Test result logger
 */
function logTest(name, passed, details = '') {
  const icon = passed ? '✓' : '✗';
  const color = passed ? colors.green : colors.red;
  console.log(`  ${color}${icon}${colors.reset} ${name}${details ? colors.dim + ' - ' + details + colors.reset : ''}`);
  return passed;
}

/**
 * Run all tests
 */
async function runTests() {
  console.log(`${colors.cyan}API Endpoints Test Suite${colors.reset}`);
  console.log('========================');
  console.log(`Testing broker at: ${BROKER_URL}`);
  console.log();

  let totalTests = 0;
  let passedTests = 0;

  // Test Categories
  const testCategories = [
    { name: 'Health Check', tests: testHealthEndpoints },
    { name: 'Metrics Endpoints', tests: testMetricsEndpoints },
    { name: 'Adapter Endpoints', tests: testAdapterEndpoints }
  ];

  for (const category of testCategories) {
    console.log(`${colors.yellow}${category.name}:${colors.reset}`);
    const results = await category.tests();
    totalTests += results.total;
    passedTests += results.passed;
    console.log();
  }

  // Summary
  console.log(`${colors.cyan}Test Summary:${colors.reset}`);
  console.log('=============');
  const allPassed = passedTests === totalTests;
  const summaryColor = allPassed ? colors.green : colors.red;
  console.log(`${summaryColor}${passedTests}/${totalTests} tests passed${colors.reset}`);

  if (!allPassed) {
    console.log(`\n${colors.red}Some tests failed. Please check the implementation.${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`\n${colors.green}All tests passed! Phase 0 implementation is working correctly.${colors.reset}`);
    process.exit(0);
  }
}

/**
 * Test health endpoints
 */
async function testHealthEndpoints() {
  let passed = 0;
  let total = 0;

  // Test broker health
  try {
    const res = await request('/health');
    total++;
    if (logTest('GET /health', res.status === 200, `status=${res.status}`)) passed++;
    if (res.body?.status === 'ok') {
      console.log(`    ${colors.dim}Agents: ${res.body.agents}, Tickets: ${res.body.tickets}${colors.reset}`);
    }
  } catch (err) {
    total++;
    logTest('GET /health', false, err.message);
  }

  return { passed, total };
}

/**
 * Test metrics endpoints
 */
async function testMetricsEndpoints() {
  let passed = 0;
  let total = 0;

  const endpoints = [
    { path: '/api/metrics/dashboard', method: 'GET', name: 'Dashboard metrics' },
    { path: '/api/metrics/performance?hours=1', method: 'GET', name: 'Performance metrics' },
    { path: '/api/metrics/endpoints?hours=1', method: 'GET', name: 'Endpoint metrics' },
    { path: '/api/metrics/slo?period=daily', method: 'GET', name: 'SLO status' },
    { path: '/api/metrics/errors?limit=10', method: 'GET', name: 'Recent errors' },
    { path: '/api/metrics/rate?minutes=60', method: 'GET', name: 'Request rate' }
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await request(endpoint.path, { method: endpoint.method });
      total++;

      // Check for telemetry headers
      const hasRequestId = res.headers['x-request-id'];
      const hasResponseTime = res.headers['x-response-time'];

      if (logTest(endpoint.name, res.status === 200 && hasRequestId && hasResponseTime,
        `status=${res.status}, telemetry=${hasRequestId && hasResponseTime ? 'yes' : 'no'}`)) {
        passed++;
      }

      // Show response time from header
      if (hasResponseTime) {
        console.log(`    ${colors.dim}Response time: ${res.headers['x-response-time']}${colors.reset}`);
      }
    } catch (err) {
      total++;
      logTest(endpoint.name, false, err.message);
    }
  }

  return { passed, total };
}

/**
 * Test adapter endpoints
 */
async function testAdapterEndpoints() {
  let passed = 0;
  let total = 0;

  // Clean up any existing test agent
  try {
    await request(`/api/adapter/agent/${TEST_AGENT_ID}`, { method: 'DELETE' });
  } catch {
    // Ignore cleanup errors
  }

  // Test agent registration
  try {
    const res = await request('/api/adapter/register', {
      method: 'POST',
      body: {
        agentId: TEST_AGENT_ID,
        type: 'mock',
        metadata: { test: true }
      }
    });
    total++;
    if (logTest('POST /api/adapter/register', res.status === 200, `agent=${TEST_AGENT_ID}`)) passed++;
  } catch (err) {
    total++;
    logTest('POST /api/adapter/register', false, err.message);
  }

  // Test list agents
  try {
    const res = await request('/api/adapter/agents');
    total++;
    const hasTestAgent = res.body?.agents?.some(a => a.agentId === TEST_AGENT_ID);
    if (logTest('GET /api/adapter/agents', res.status === 200 && hasTestAgent,
      `found=${hasTestAgent}, count=${res.body?.agents?.length || 0}`)) passed++;
  } catch (err) {
    total++;
    logTest('GET /api/adapter/agents', false, err.message);
  }

  // Test heartbeat
  try {
    const res = await request('/api/adapter/heartbeat', {
      method: 'POST',
      body: { agentId: TEST_AGENT_ID }
    });
    total++;
    if (logTest('POST /api/adapter/heartbeat', res.status === 200)) passed++;
  } catch (err) {
    total++;
    logTest('POST /api/adapter/heartbeat', false, err.message);
  }

  // Test get pending tickets
  try {
    const res = await request(`/api/adapter/pending/${TEST_AGENT_ID}`);
    total++;
    if (logTest('GET /api/adapter/pending/:id', res.status === 200,
      `tickets=${res.body?.tickets?.length || 0}`)) passed++;
  } catch (err) {
    total++;
    logTest('GET /api/adapter/pending/:id', false, err.message);
  }

  // Test delete agent
  try {
    const res = await request(`/api/adapter/agent/${TEST_AGENT_ID}`, { method: 'DELETE' });
    total++;
    if (logTest('DELETE /api/adapter/agent/:id', res.status === 200 || res.status === 204)) passed++;
  } catch (err) {
    total++;
    logTest('DELETE /api/adapter/agent/:id', false, err.message);
  }

  return { passed, total };
}

// Run tests
runTests().catch(err => {
  console.error(`${colors.red}Test suite failed:${colors.reset}`, err);
  process.exit(1);
});