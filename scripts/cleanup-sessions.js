#!/usr/bin/env node
/**
 * cleanup-sessions.js - Clean up stale agent sessions and conversations
 *
 * Usage:
 *   node scripts/cleanup-sessions.js --dry-run           # Report only, no changes
 *   node scripts/cleanup-sessions.js --max-age 24h       # Clean sessions idle >24h
 *   node scripts/cleanup-sessions.js --agent alice       # Clean specific agent
 *   node scripts/cleanup-sessions.js --max-age 48h --yes # Cron-safe (no prompts)
 *
 * Safe to run:
 *   - Via cron for automated cleanup
 *   - Before/after major deployments
 *   - When investigating session leaks
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import readline from 'node:readline/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  maxAge: parseMaxAge(args),
  agent: parseAgent(args),
  yes: args.includes('--yes') || args.includes('-y'),
  verbose: args.includes('--verbose') || args.includes('-v')
};

function parseMaxAge(args) {
  const idx = args.indexOf('--max-age');
  if (idx === -1) return 24 * 3600 * 1000; // Default: 24h

  const value = args[idx + 1];
  if (!value) return 24 * 3600 * 1000;

  // Parse duration (e.g., "24h", "7d", "30m")
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) {
    console.error(`Invalid max-age format: ${value}`);
    process.exit(1);
  }

  const [, num, unit] = match;
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return parseInt(num) * multipliers[unit];
}

function parseAgent(args) {
  const idx = args.indexOf('--agent');
  return idx !== -1 ? args[idx + 1] : null;
}

// Database connection
const dbPath = join(__dirname, '../broker/data/kokino.db');
let db;

try {
  db = new Database(dbPath);
} catch (error) {
  console.error(`Failed to open database at ${dbPath}:`, error.message);
  process.exit(1);
}

// Logging
function log(message) {
  console.log(`[cleanup] ${message}`);
}

function verbose(message) {
  if (options.verbose) {
    console.log(`[verbose] ${message}`);
  }
}

function warn(message) {
  console.warn(`[warning] ${message}`);
}

// Find stale sessions
function findStaleSessions() {
  const cutoffTime = new Date(Date.now() - options.maxAge).toISOString();

  let query = `
    SELECT
      conversation_id,
      agent_id,
      status,
      created_at,
      updated_at,
      (julianday('now') - julianday(updated_at)) * 86400 as age_seconds
    FROM conversations
    WHERE updated_at < ?
      AND status IN ('active', 'error')
  `;

  const params = [cutoffTime];

  if (options.agent) {
    query += ` AND agent_id = ?`;
    params.push(options.agent);
  }

  query += ` ORDER BY updated_at ASC`;

  const stale = db.prepare(query).all(...params);

  verbose(`Found ${stale.length} stale conversations (cutoff: ${cutoffTime})`);

  return stale;
}

// Find orphaned turns (turns without parent conversation)
function findOrphanedTurns() {
  const orphans = db.prepare(`
    SELECT
      turn_id,
      conversation_id,
      direction,
      created_at
    FROM turns
    WHERE conversation_id NOT IN (SELECT conversation_id FROM conversations)
  `).all();

  if (orphans.length > 0) {
    warn(`Found ${orphans.length} orphaned turns`);
  }

  return orphans;
}

// Count turns for conversation
function countTurns(conversationId) {
  const result = db.prepare(`
    SELECT COUNT(*) as count
    FROM turns
    WHERE conversation_id = ?
  `).get(conversationId);

  return result.count;
}

// Delete conversation and its turns
function deleteConversation(conversationId) {
  const turnCount = countTurns(conversationId);

  if (options.dryRun) {
    log(`[DRY RUN] Would delete conversation ${conversationId} (${turnCount} turns)`);
    return { conversationId, turnCount, deleted: false };
  }

  // Delete turns first (foreign key constraint)
  db.prepare(`DELETE FROM turns WHERE conversation_id = ?`).run(conversationId);

  // Delete conversation
  db.prepare(`DELETE FROM conversations WHERE conversation_id = ?`).run(conversationId);

  verbose(`Deleted conversation ${conversationId} (${turnCount} turns)`);

  return { conversationId, turnCount, deleted: true };
}

// Delete orphaned turn
function deleteOrphanedTurn(turnId) {
  if (options.dryRun) {
    log(`[DRY RUN] Would delete orphaned turn ${turnId}`);
    return false;
  }

  db.prepare(`DELETE FROM turns WHERE turn_id = ?`).run(turnId);
  verbose(`Deleted orphaned turn ${turnId}`);

  return true;
}

// Confirm deletion (unless --yes flag)
async function confirmDeletion(staleCount, orphanCount) {
  if (options.yes || options.dryRun) {
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('');
  console.log('='.repeat(60));
  console.log(`About to delete:`);
  console.log(`  - ${staleCount} stale conversations`);
  console.log(`  - ${orphanCount} orphaned turns`);
  console.log('='.repeat(60));
  console.log('');

  const answer = await rl.question('Proceed with deletion? (yes/no): ');
  rl.close();

  return answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y';
}

// Main cleanup routine
async function cleanup() {
  log('Starting session cleanup...');
  log(`Max age: ${(options.maxAge / 3600000).toFixed(1)}h`);
  if (options.agent) log(`Agent filter: ${options.agent}`);
  if (options.dryRun) log('DRY RUN MODE - no changes will be made');

  console.log('');

  // Find stale sessions
  const staleSessions = findStaleSessions();
  log(`Found ${staleSessions.length} stale conversations`);

  // Find orphaned turns
  const orphanedTurns = findOrphanedTurns();

  if (staleSessions.length === 0 && orphanedTurns.length === 0) {
    log('No cleanup needed');
    return 0;
  }

  // Show summary
  console.log('');
  console.log('Stale Conversations:');
  console.log('-'.repeat(80));
  staleSessions.forEach((session, idx) => {
    const age_hours = (session.age_seconds / 3600).toFixed(1);
    console.log(`${idx + 1}. ${session.conversation_id} | ${session.agent_id} | ${age_hours}h idle | ${session.status}`);
  });

  if (orphanedTurns.length > 0) {
    console.log('');
    console.log('Orphaned Turns:');
    console.log('-'.repeat(80));
    orphanedTurns.slice(0, 10).forEach((turn, idx) => {
      console.log(`${idx + 1}. ${turn.turn_id} | missing conversation: ${turn.conversation_id}`);
    });
    if (orphanedTurns.length > 10) {
      console.log(`... and ${orphanedTurns.length - 10} more`);
    }
  }

  console.log('');

  // Confirm deletion
  const confirmed = await confirmDeletion(staleSessions.length, orphanedTurns.length);

  if (!confirmed) {
    log('Cleanup cancelled');
    return 1;
  }

  // Perform cleanup
  log('Performing cleanup...');

  let deletedConversations = 0;
  let deletedTurns = 0;

  // Delete stale conversations
  for (const session of staleSessions) {
    const result = deleteConversation(session.conversation_id);
    if (result.deleted) {
      deletedConversations++;
      deletedTurns += result.turnCount;
    }
  }

  // Delete orphaned turns
  let deletedOrphans = 0;
  for (const turn of orphanedTurns) {
    if (deleteOrphanedTurn(turn.turn_id)) {
      deletedOrphans++;
    }
  }

  // Summary
  console.log('');
  console.log('='.repeat(60));
  if (options.dryRun) {
    log(`DRY RUN COMPLETE - Would have deleted:`);
  } else {
    log('CLEANUP COMPLETE');
  }
  log(`  Conversations deleted: ${deletedConversations}`);
  log(`  Turns deleted: ${deletedTurns + deletedOrphans} (${deletedTurns} from conversations, ${deletedOrphans} orphans)`);
  console.log('='.repeat(60));

  return 0;
}

// Show help
function showHelp() {
  console.log(`
Usage: node scripts/cleanup-sessions.js [OPTIONS]

Options:
  --dry-run           Report only, make no changes
  --max-age <dur>     Clean sessions idle longer than duration (e.g., 24h, 7d, 30m)
  --agent <id>        Clean specific agent only
  --yes, -y           Skip confirmation prompt (for cron)
  --verbose, -v       Show detailed logging
  --help, -h          Show this help

Examples:
  # Dry run (safe to test)
  node scripts/cleanup-sessions.js --dry-run

  # Clean sessions idle >24 hours
  node scripts/cleanup-sessions.js --max-age 24h

  # Clean specific agent
  node scripts/cleanup-sessions.js --agent frontend-mary

  # Automated cleanup (cron)
  node scripts/cleanup-sessions.js --max-age 48h --yes

  # Clean everything older than 1 hour (emergency)
  node scripts/cleanup-sessions.js --max-age 1h
  `);
}

// Entry point
if (args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

cleanup()
  .then(code => {
    db.close();
    process.exit(code);
  })
  .catch(error => {
    console.error('[ERROR]', error.message);
    if (db) db.close();
    process.exit(1);
  });
