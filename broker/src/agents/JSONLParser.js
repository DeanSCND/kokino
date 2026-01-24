/**
 * JSONLParser - Hardened parser for Claude Code JSONL output with schema validation
 *
 * Prevents silent failures by:
 * - Schema validation with zod
 * - Unknown event type handling
 * - CLI version tracking
 * - Malformed JSON recovery
 * - Telemetry emission
 *
 * Related: Issue #91 - JSONL Parser Hardening & Schema Validation
 */

import { z } from 'zod';
import { getMetricsCollector } from '../telemetry/MetricsCollector.js';

// Schema definitions for known Claude Code JSONL events
const EVENT_SCHEMAS = {
  result: z.object({
    type: z.literal('result'),
    result: z.string(),
    session_id: z.string().optional(),
    usage: z.object({
      input_tokens: z.number(),
      output_tokens: z.number(),
      cache_creation_input_tokens: z.number().optional(),
      cache_read_input_tokens: z.number().optional(),
    }).optional(),
    timestamp: z.string().optional(),
  }),

  tool_use: z.object({
    type: z.literal('tool_use'),
    tool_name: z.string(),
    tool_input: z.record(z.any()).optional(),
    tool_use_id: z.string().optional(),
  }),

  tool_result: z.object({
    type: z.literal('tool_result'),
    tool_use_id: z.string(),
    content: z.string(),
  }),

  error: z.object({
    type: z.literal('error'),
    error: z.string(),
    code: z.string().optional(),
  }),

  status: z.object({
    type: z.literal('status'),
    status: z.string(),
    message: z.string().optional(),
  }),

  thinking: z.object({
    type: z.literal('thinking'),
    content: z.string(),
  }),
};

export class JSONLParser {
  constructor() {
    this.metrics = getMetricsCollector();
    console.log('[JSONLParser] Initialized with schema validation');
  }

  /**
   * Parse JSONL output from Claude Code CLI
   *
   * @param {string} stdout - Raw JSONL output
   * @param {object} options - Parsing options
   * @returns {object} Parsed result { response, sessionId, events, usage, errors }
   */
  parse(stdout, options = {}) {
    const { agentId = 'unknown', cliType = 'claude-code', strict = false } = options;

    const result = {
      response: '',
      sessionId: null,
      events: [],
      usage: null,
      errors: [],
      unknownEvents: [],
    };

    if (!stdout || typeof stdout !== 'string') {
      this.metrics.record('JSONL_PARSE_FAILED', agentId, {
        metadata: { reason: 'empty_or_invalid_input', cliType }
      });
      return result;
    }

    const lines = stdout.trim().split('\n');
    let validLines = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line) continue; // Skip empty lines

      try {
        // Parse JSON
        const raw = JSON.parse(line);

        // Validate with schema
        const validated = this.validateEvent(raw, agentId, cliType);

        if (validated.valid) {
          const event = validated.data;
          result.events.push(event);
          validLines++;

          // Extract key fields
          if (event.type === 'result') {
            result.response = event.result;
            result.sessionId = event.session_id || null;
            result.usage = event.usage || null;
          }

        } else {
          // Unknown event type
          result.unknownEvents.push({
            lineNumber: i + 1,
            raw,
            error: validated.error
          });

          // In strict mode, treat unknown events as errors
          if (strict) {
            throw new Error(`Unknown event type at line ${i + 1}: ${raw.type}`);
          }
        }

      } catch (error) {
        // JSON parse error or schema validation error
        const parseError = {
          lineNumber: i + 1,
          line: line.substring(0, 100), // First 100 chars
          error: error.message
        };

        result.errors.push(parseError);

        // Emit telemetry
        this.metrics.record('JSONL_PARSE_ERROR', agentId, {
          metadata: {
            cliType,
            lineNumber: i + 1,
            error: error.message
          }
        });

        // In strict mode, fail fast
        if (strict) {
          throw error;
        }
      }
    }

    // Fallback: If no 'result' event found, use raw stdout
    // Check response (not validLines) - we may have parsed other valid events (error, status, tool_use)
    if (!result.response) {
      result.response = stdout.trim();

      this.metrics.record('JSONL_FALLBACK_RAW', agentId, {
        metadata: {
          cliType,
          reason: 'no_result_event',
          validLines,
          linesAttempted: lines.length
        }
      });
    }

    // Emit success telemetry
    if (validLines > 0) {
      this.metrics.record('JSONL_PARSE_SUCCESS', agentId, {
        metadata: {
          cliType,
          validLines,
          totalLines: lines.length,
          unknownEvents: result.unknownEvents.length,
          errors: result.errors.length
        }
      });
    }

    return result;
  }

  /**
   * Validate event against schema
   *
   * @param {object} raw - Raw JSON event
   * @param {string} agentId - Agent identifier
   * @param {string} cliType - CLI type
   * @returns {object} Validation result { valid, data?, error? }
   */
  validateEvent(raw, agentId, cliType) {
    if (!raw || typeof raw !== 'object' || !raw.type) {
      return {
        valid: false,
        error: 'Event missing type field'
      };
    }

    const schema = EVENT_SCHEMAS[raw.type];

    if (!schema) {
      // Unknown event type - log but don't fail
      console.warn(`[JSONLParser] Unknown event type: ${raw.type} (agent: ${agentId})`);

      this.metrics.record('JSONL_UNKNOWN_EVENT', agentId, {
        metadata: {
          cliType,
          eventType: raw.type
        }
      });

      return {
        valid: false,
        error: `Unknown event type: ${raw.type}`
      };
    }

    try {
      const validated = schema.parse(raw);
      return {
        valid: true,
        data: validated
      };
    } catch (error) {
      // Schema validation error
      console.warn(`[JSONLParser] Schema validation failed for event type ${raw.type}:`, error.message);

      this.metrics.record('JSONL_SCHEMA_ERROR', agentId, {
        metadata: {
          cliType,
          eventType: raw.type,
          error: error.message
        }
      });

      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Get list of supported event types
   *
   * @returns {string[]} Event type names
   */
  getSupportedEvents() {
    return Object.keys(EVENT_SCHEMAS);
  }

  /**
   * Add custom event schema (for future CLI types)
   *
   * @param {string} eventType - Event type name
   * @param {z.ZodSchema} schema - Zod schema
   */
  registerEventSchema(eventType, schema) {
    if (EVENT_SCHEMAS[eventType]) {
      console.warn(`[JSONLParser] Overwriting existing schema for event type: ${eventType}`);
    }

    EVENT_SCHEMAS[eventType] = schema;
    console.log(`[JSONLParser] Registered schema for event type: ${eventType}`);
  }
}
