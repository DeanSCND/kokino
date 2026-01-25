/**
 * Telemetry Middleware - Logs EVERY request with timing
 *
 * This middleware MUST be applied to all routes to ensure complete observability.
 * Captures request/response metrics and feeds them to MetricsCollector.
 */

import { randomUUID } from 'node:crypto';
import { getMetricsCollector } from '../../telemetry/MetricsCollector.js';

/**
 * Generate request ID for tracing
 */
function generateRequestId() {
  return `req-${Date.now()}-${randomUUID().split('-')[0]}`;
}

/**
 * Calculate request body size
 */
function getBodySize(body) {
  if (!body) return 0;
  if (typeof body === 'string') return Buffer.byteLength(body);
  if (Buffer.isBuffer(body)) return body.length;
  return Buffer.byteLength(JSON.stringify(body));
}

/**
 * Telemetry middleware factory
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.logBody - Whether to log request bodies (default: false)
 * @param {boolean} options.logHeaders - Whether to log headers (default: false)
 * @returns {Function} Express-style middleware
 */
export function telemetryMiddleware(options = {}) {
  const { logBody = false, logHeaders = false } = options;
  const metricsCollector = getMetricsCollector();

  return async (req, res, next) => {
    // Generate request ID
    const requestId = req.headers['x-request-id'] || generateRequestId();
    req.id = requestId;

    // Capture start time with high precision
    const startTime = process.hrtime.bigint();
    const startTimestamp = new Date().toISOString();

    // Capture request details
    const method = req.method;
    const path = req.url;
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Parse body size if available
    let bodySize = 0;
    if (req.body) {
      bodySize = getBodySize(req.body);
    }

    // Log request start
    console.log(`[${requestId}] ${method} ${path} - START`);

    // Store original res.end to intercept response
    const originalEnd = res.end;
    let responseBody = '';
    let responseSize = 0;

    // Override res.end to capture response details
    res.end = function(chunk, encoding) {
      // Calculate response time
      const endTime = process.hrtime.bigint();
      const durationMs = Number((endTime - startTime) / 1000000n); // Convert nanoseconds to milliseconds

      // Capture response size
      if (chunk) {
        responseSize = getBodySize(chunk);
        if (typeof chunk === 'string' || Buffer.isBuffer(chunk)) {
          responseBody = chunk.toString();
        }
      }

      // Get status code
      const statusCode = res.statusCode;
      const success = statusCode >= 200 && statusCode < 400;

      // Log completion
      console.log(`[${requestId}] ${method} ${path} - ${statusCode} - ${durationMs}ms`);

      // Record metrics
      metricsCollector.record('HTTP_REQUEST', 'broker', {
        durationMs,
        success,
        metadata: {
          requestId,
          method,
          path,
          statusCode,
          userAgent,
          requestBodySize: bodySize,
          responseBodySize: responseSize,
          timestamp: startTimestamp,
          ...(logHeaders && { headers: req.headers }),
          ...(logBody && req.body && { requestBody: req.body }),
        }
      });

      // Track specific endpoint metrics
      const endpoint = `${method} ${path.split('?')[0]}`;
      metricsCollector.recordEndpointMetric(endpoint, {
        durationMs,
        statusCode,
        success
      });

      // Add request ID to response headers
      res.setHeader('X-Request-Id', requestId);
      res.setHeader('X-Response-Time', `${durationMs}ms`);

      // Call original end
      return originalEnd.call(this, chunk, encoding);
    };

    // Error handling
    res.on('error', (error) => {
      const endTime = process.hrtime.bigint();
      const durationMs = Number((endTime - startTime) / 1000000n);

      console.error(`[${requestId}] ${method} ${path} - ERROR - ${error.message}`);

      metricsCollector.record('HTTP_REQUEST_ERROR', 'broker', {
        durationMs,
        success: false,
        metadata: {
          requestId,
          method,
          path,
          error: error.message,
          stack: error.stack,
          timestamp: startTimestamp
        }
      });
    });

    // Continue to next middleware
    if (next) {
      next();
    }
  };
}

/**
 * Request ID propagation middleware
 * Ensures request IDs flow through the entire request lifecycle
 */
export function requestIdMiddleware() {
  return (req, res, next) => {
    if (!req.id) {
      req.id = req.headers['x-request-id'] || generateRequestId();
    }
    res.setHeader('X-Request-Id', req.id);
    next();
  };
}

/**
 * Performance SLO monitoring middleware
 * Tracks requests that violate performance targets
 */
export function sloMonitoringMiddleware(targetMs = 200) {
  const metricsCollector = getMetricsCollector();

  return (req, res, next) => {
    const startTime = process.hrtime.bigint();

    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
      const endTime = process.hrtime.bigint();
      const durationMs = Number((endTime - startTime) / 1000000n);

      if (durationMs > targetMs) {
        console.warn(`[SLO] ${req.method} ${req.url} exceeded target (${durationMs}ms > ${targetMs}ms)`);

        metricsCollector.record('SLO_VIOLATION', 'broker', {
          durationMs,
          metadata: {
            requestId: req.id,
            method: req.method,
            path: req.url,
            targetMs,
            excessMs: durationMs - targetMs
          }
        });
      }

      return originalEnd.call(this, chunk, encoding);
    };

    next();
  };
}

export default telemetryMiddleware;