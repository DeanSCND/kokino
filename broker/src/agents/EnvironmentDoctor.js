/**
 * EnvironmentDoctor - Validates runtime environment for headless CLI execution
 *
 * Prevents silent failures by checking:
 * - CLI binary availability (claude, droid, gemini in PATH)
 * - Environment variables (CLAUDECODE, PATH, etc.)
 * - Auth credentials (~/.claude/.env)
 * - Disk space (prevent out-of-space errors)
 * - Dry-run execution (end-to-end validation)
 *
 * Related: Issue #88 - Environment Doctor & Self-Check System
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getMetricsCollector } from '../telemetry/MetricsCollector.js';
import { buildClaudeEnvironment } from './AgentRunner.js';

const CLI_COMMANDS = {
  'claude-code': 'claude',
  'factory-droid': 'droid',
  'gemini': 'gemini'
};

export class EnvironmentDoctor {
  constructor() {
    this.metrics = getMetricsCollector();
  }

  /**
   * Validate headless environment for a specific CLI type
   *
   * @param {string} cliType - CLI type to check (claude-code, factory-droid, gemini)
   * @returns {Promise<object>} Check results { cliType, passed, checks[], warnings[] }
   */
  async check(cliType) {
    const results = {
      cliType,
      passed: true,
      checks: [],
      warnings: [],
      timestamp: new Date().toISOString()
    };

    console.log(`[EnvironmentDoctor] Running checks for ${cliType}...`);

    // Check 1: CLI binary exists in PATH
    const binaryCheck = await this.checkBinary(cliType);
    results.checks.push(binaryCheck);
    if (!binaryCheck.passed) results.passed = false;

    // Check 2: Environment variables set correctly
    const envCheck = this.checkEnvironment(cliType);
    results.checks.push(envCheck);
    if (!envCheck.passed) results.passed = false;

    // Check 3: Auth/credentials available
    const authCheck = await this.checkAuth(cliType);
    results.checks.push(authCheck);
    if (!authCheck.passed) results.passed = false;

    // Check 4: Disk space sufficient
    const diskCheck = await this.checkDiskSpace();
    results.checks.push(diskCheck);
    if (!diskCheck.passed) {
      results.passed = false;
    } else if (diskCheck.warning) {
      results.warnings.push(diskCheck.warning);
    }

    // Check 5: Dry-run execution works (only if all previous checks passed)
    if (results.passed) {
      const dryRunCheck = await this.checkDryRun(cliType);
      results.checks.push(dryRunCheck);
      if (!dryRunCheck.passed) results.passed = false;
    }

    // Emit telemetry event
    const eventType = results.passed ? 'ENV_CHECK_PASSED' : 'ENV_CHECK_FAILED';
    this.metrics.record(eventType, cliType, {
      cliType,
      success: results.passed,
      metadata: {
        failedChecks: results.checks.filter(c => !c.passed).map(c => c.name),
        warningCount: results.warnings.length
      }
    });

    if (!results.passed) {
      console.error(`[EnvironmentDoctor] ✗ Environment check FAILED for ${cliType}`);
      console.error(`[EnvironmentDoctor] Failed checks: ${results.checks.filter(c => !c.passed).map(c => c.name).join(', ')}`);
    } else if (results.warnings.length > 0) {
      console.warn(`[EnvironmentDoctor] ⚠ Environment check passed with warnings for ${cliType}`);
      this.metrics.record('ENV_DEGRADED', cliType, {
        cliType,
        metadata: { warnings: results.warnings }
      });
    } else {
      console.log(`[EnvironmentDoctor] ✓ Environment check PASSED for ${cliType}`);
    }

    return results;
  }

  /**
   * Check if CLI binary exists in PATH
   */
  async checkBinary(cliType) {
    const command = CLI_COMMANDS[cliType];

    if (!command) {
      return {
        name: 'binary',
        passed: false,
        message: `Unknown CLI type: ${cliType}`
      };
    }

    try {
      const result = execSync(`which ${command}`, { stdio: 'pipe', encoding: 'utf8' }).trim();
      return {
        name: 'binary',
        passed: true,
        message: `${command} found at ${result}`
      };
    } catch (error) {
      return {
        name: 'binary',
        passed: false,
        message: `${command} not found in PATH. Install with: npm install -g @anthropic-ai/claude-cli`
      };
    }
  }

  /**
   * Check environment variables for CLI type
   */
  checkEnvironment(cliType) {
    if (cliType === 'claude-code') {
      // Validate the actual runtime environment, not process.env
      const runtimeEnv = buildClaudeEnvironment();

      const issues = [];

      // Check CLAUDECODE flag
      if (!runtimeEnv.CLAUDECODE) {
        issues.push('CLAUDECODE not set in runtime env');
      }

      // Check CLAUDE_CODE_ENTRYPOINT
      if (!runtimeEnv.CLAUDE_CODE_ENTRYPOINT) {
        issues.push('CLAUDE_CODE_ENTRYPOINT not set in runtime env');
      }

      // CRITICAL: ANTHROPIC_API_KEY should NOT be set (forces API auth instead of subscription)
      if (runtimeEnv.ANTHROPIC_API_KEY) {
        issues.push('ANTHROPIC_API_KEY should be deleted (prevents subscription auth)');
      }

      // PATH validation removed - checkBinary() already verifies CLI is executable

      if (issues.length > 0) {
        return {
          name: 'environment',
          passed: false,
          message: issues.join('; ')
        };
      }
    }

    return {
      name: 'environment',
      passed: true,
      message: 'Environment variables correct'
    };
  }

  /**
   * Check auth credentials exist
   */
  async checkAuth(cliType) {
    if (cliType === 'claude-code') {
      const claudeDir = path.join(process.env.HOME, '.claude');
      const envPath = path.join(claudeDir, '.env');

      if (!fs.existsSync(claudeDir)) {
        return {
          name: 'auth',
          passed: false,
          message: '~/.claude directory not found. Run `claude` first to initialize.'
        };
      }

      if (!fs.existsSync(envPath)) {
        return {
          name: 'auth',
          passed: false,
          message: '~/.claude/.env not found. Login with: claude login'
        };
      }

      // Check for auth tokens (without revealing values)
      const envContent = fs.readFileSync(envPath, 'utf8');
      const hasToken = envContent.includes('CLAUDE_') || envContent.includes('ANTHROPIC_');

      if (!hasToken) {
        return {
          name: 'auth',
          passed: false,
          message: '~/.claude/.env missing auth tokens. Re-login: claude login'
        };
      }

      return {
        name: 'auth',
        passed: true,
        message: 'Auth credentials found'
      };
    }

    // For other CLIs, just check if binary exists (auth done separately)
    return {
      name: 'auth',
      passed: true,
      message: `Auth check skipped for ${cliType}`
    };
  }

  /**
   * Check available disk space
   */
  async checkDiskSpace() {
    try {
      const dataDir = path.join(process.cwd(), 'data');
      const result = execSync(`df -h ${dataDir}`, { stdio: 'pipe', encoding: 'utf8' });
      const lines = result.trim().split('\n');

      if (lines.length < 2) {
        return {
          name: 'disk',
          passed: true,
          message: 'Disk space check skipped (df unavailable)'
        };
      }

      // Parse df output: Filesystem  Size  Used Avail Use% Mounted
      const parts = lines[1].split(/\s+/);
      const availableGB = parts[3]; // e.g., "50Gi"
      const usedPercent = parseInt(parts[4]); // e.g., "75%"

      if (usedPercent >= 95) {
        return {
          name: 'disk',
          passed: false,
          message: `Disk ${usedPercent}% full - only ${availableGB} available`
        };
      }

      if (usedPercent >= 85) {
        return {
          name: 'disk',
          passed: true,
          warning: `Disk ${usedPercent}% full - consider cleanup`,
          message: `Disk ${usedPercent}% full - ${availableGB} available`
        };
      }

      return {
        name: 'disk',
        passed: true,
        message: `Disk ${usedPercent}% full - ${availableGB} available`
      };
    } catch (error) {
      return {
        name: 'disk',
        passed: true,
        message: 'Disk space check skipped (df command failed)'
      };
    }
  }

  /**
   * Dry-run execution test
   */
  async checkDryRun(cliType) {
    if (cliType !== 'claude-code') {
      return {
        name: 'dryrun',
        passed: true,
        message: `Dry-run skipped for ${cliType}`
      };
    }

    try {
      // Attempt minimal claude command with timeout
      const result = execSync('claude --version 2>&1', {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 5000
      });

      if (result.toLowerCase().includes('claude')) {
        return {
          name: 'dryrun',
          passed: true,
          message: 'CLI responds to --version'
        };
      }

      return {
        name: 'dryrun',
        passed: false,
        message: 'CLI --version returned unexpected output'
      };
    } catch (error) {
      return {
        name: 'dryrun',
        passed: false,
        message: `CLI execution failed: ${error.message}`
      };
    }
  }

  /**
   * Check all supported CLI types
   *
   * @returns {Promise<object>} Results for all CLIs { overall, results: [...] }
   */
  async checkAll() {
    const cliTypes = Object.keys(CLI_COMMANDS);
    const results = [];

    for (const cliType of cliTypes) {
      const result = await this.check(cliType);
      results.push(result);
    }

    const overallPassed = results.every(r => r.passed);

    return {
      overall: overallPassed,
      timestamp: new Date().toISOString(),
      results
    };
  }
}
