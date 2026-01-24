# JSONL Test Fixtures

Recorded JSONL samples from Claude Code CLI for regression testing.

## Files

- **claude-simple-result.jsonl** - Basic result event with usage stats
- **claude-tool-use.jsonl** - Tool use + tool result + final result
- **claude-error.jsonl** - Error event
- **claude-unknown-event.jsonl** - Unknown event type (should not crash parser)
- **claude-malformed.jsonl** - Malformed JSON line (should recover)

## Usage

```javascript
import { JSONLParser } from '../broker/src/agents/JSONLParser.js';
import * as fs from 'node:fs';

const parser = new JSONLParser();
const sample = fs.readFileSync('tests/fixtures/jsonl-samples/claude-simple-result.jsonl', 'utf8');

const result = parser.parse(sample, { agentId: 'test', cliType: 'claude-code' });
console.log(result.response); // "Hello! How can I assist you today?"
```

## Adding New Samples

When new JSONL event types are discovered, add them here with:
1. Actual CLI output (anonymized if needed)
2. Descriptive filename
3. Update this README
