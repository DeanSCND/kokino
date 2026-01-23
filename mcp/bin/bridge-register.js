#!/usr/bin/env node

const args = process.argv.slice(2);

function parseArgs(rawArgs) {
  const result = {};
  let i = 0;
  while (i < rawArgs.length) {
    const token = rawArgs[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = rawArgs[i + 1];
      if (!next || next.startsWith('--')) {
        result[key] = true;
        i += 1;
      } else {
        if (result[key] !== undefined) {
          if (!Array.isArray(result[key])) {
            result[key] = [result[key]];
          }
          result[key].push(next);
        } else {
          result[key] = next;
        }
        i += 2;
      }
    } else {
      if (!result._) result._ = [];
      result._.push(token);
      i += 1;
    }
  }
  return result;
}

async function main() {
  const options = parseArgs(args);
  const agentId = options.agent || options.name;
  if (!agentId) {
    console.error('Usage: bridge-register --agent <handle> [--type <type>] [--cwd <path>] [--session <name>] [--pane <id>] [--capability <cap>]');
    console.error('');
    console.error('Options:');
    console.error('  --agent <handle>        Agent name/handle (required)');
    console.error('  --type <type>           Agent type (e.g., claude-code, codex, gemini)');
    console.error('  --cwd <path>            Current working directory');
    console.error('  --session <name>        Tmux session name');
    console.error('  --pane <id>             Tmux pane ID');
    console.error('  --capability <cap>      Agent capability (can be specified multiple times)');
    console.error('  --heartbeat <ms>        Heartbeat interval in milliseconds');
    console.error('  --broker-url <url>      Broker URL (default: http://127.0.0.1:5050)');
    console.error('');
    console.error('Example:');
    console.error('  bridge-register --agent Alice --type claude-code --session dev-Alice --capability review --capability code');
    process.exit(1);
  }

  const brokerUrl = options['broker-url'] || process.env.BRIDGE_BROKER_URL || 'http://127.0.0.1:5050';
  const type = options.type;

  const metadata = {};
  if (options.cwd) metadata.cwd = options.cwd;
  if (options.session) metadata.session = options.session;
  if (options.pane) metadata.paneId = options.pane;

  const capabilitiesRaw = options.capability;
  if (capabilitiesRaw) {
    const caps = Array.isArray(capabilitiesRaw) ? capabilitiesRaw : [capabilitiesRaw];
    metadata.capabilities = caps;
  }

  const heartbeatIntervalMs = options.heartbeat ? Number(options.heartbeat) : undefined;

  const payload = {
    agentId,
    type,
    metadata,
    heartbeatIntervalMs,
  };

  try {
    const response = await fetch(new URL('/agents/register', brokerUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`Registration failed (${response.status}): ${text}`);
      process.exit(1);
    }

    const result = await response.json();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
      console.error(`❌ Broker offline at ${brokerUrl}`);
      console.error('   Please start the broker first: cd broker && npm start');
      process.exit(1);
    }
    console.error(`Failed to contact broker: ${error.message}`);
    process.exit(1);
  }
}

main();
