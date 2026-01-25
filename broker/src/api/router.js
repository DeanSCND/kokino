/**
 * API Router - Central routing with middleware pipeline
 *
 * This router handles all /api/* endpoints with consistent
 * middleware application and error handling.
 */

import { URL } from 'node:url';
import { telemetryMiddleware, requestIdMiddleware, sloMonitoringMiddleware } from './middleware/telemetry.js';
import { jsonResponse } from '../utils/response.js';

/**
 * Route registry
 */
class RouteRegistry {
  constructor() {
    this.routes = new Map();
  }

  /**
   * Register a route handler
   * @param {string} method - HTTP method
   * @param {string|RegExp} pattern - Path pattern or regex
   * @param {Function} handler - Route handler function
   */
  register(method, pattern, handler) {
    const key = `${method}:${pattern}`;
    this.routes.set(key, { method, pattern, handler });
  }

  /**
   * Find matching route
   * @param {string} method - HTTP method
   * @param {string} path - Request path
   * @returns {object|null} Route match with params
   */
  match(method, path) {
    // Try exact match first
    const exactKey = `${method}:${path}`;
    if (this.routes.has(exactKey)) {
      return { handler: this.routes.get(exactKey).handler, params: {} };
    }

    // Try pattern matching
    for (const [key, route] of this.routes) {
      if (route.method !== method) continue;

      if (route.pattern instanceof RegExp) {
        const match = path.match(route.pattern);
        if (match) {
          const params = {};
          // Extract named groups if available
          if (match.groups) {
            Object.assign(params, match.groups);
          }
          return { handler: route.handler, params, matches: match };
        }
      } else if (typeof route.pattern === 'string') {
        // Simple pattern matching with :param syntax
        const patternParts = route.pattern.split('/');
        const pathParts = path.split('/');

        if (patternParts.length !== pathParts.length) continue;

        let matches = true;
        const params = {};

        for (let i = 0; i < patternParts.length; i++) {
          if (patternParts[i].startsWith(':')) {
            // Parameter extraction
            params[patternParts[i].slice(1)] = pathParts[i];
          } else if (patternParts[i] !== pathParts[i]) {
            matches = false;
            break;
          }
        }

        if (matches) {
          return { handler: route.handler, params };
        }
      }
    }

    return null;
  }
}

/**
 * API Router class
 * Manages routing and middleware for API endpoints
 */
export class APIRouter {
  constructor() {
    this.registry = new RouteRegistry();
    this.middlewares = [];

    // Apply default middlewares
    this.use(requestIdMiddleware());
    this.use(telemetryMiddleware({ logBody: false, logHeaders: false }));
    this.use(sloMonitoringMiddleware(200)); // 200ms SLO target
  }

  /**
   * Add global middleware
   * @param {Function} middleware - Middleware function
   */
  use(middleware) {
    this.middlewares.push(middleware);
  }

  /**
   * Register GET route
   */
  get(pattern, handler) {
    this.registry.register('GET', pattern, handler);
  }

  /**
   * Register POST route
   */
  post(pattern, handler) {
    this.registry.register('POST', pattern, handler);
  }

  /**
   * Register PUT route
   */
  put(pattern, handler) {
    this.registry.register('PUT', pattern, handler);
  }

  /**
   * Register DELETE route
   */
  delete(pattern, handler) {
    this.registry.register('DELETE', pattern, handler);
  }

  /**
   * Register PATCH route
   */
  patch(pattern, handler) {
    this.registry.register('PATCH', pattern, handler);
  }

  /**
   * Parse request body
   * @param {http.IncomingMessage} req
   * @returns {Promise<any>} Parsed body
   */
  async parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          if (body) {
            req.body = JSON.parse(body);
          } else {
            req.body = {};
          }
          resolve(req.body);
        } catch (err) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Apply middleware chain
   * @param {Array} middlewares - Middleware functions
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @returns {Promise<void>}
   */
  async applyMiddlewares(middlewares, req, res) {
    for (const middleware of middlewares) {
      await new Promise((resolve, reject) => {
        middleware(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  /**
   * Handle incoming request
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  async handle(req, res) {
    try {
      // Parse URL
      const url = new URL(req.url, `http://${req.headers.host}`);
      const pathname = url.pathname;

      // Remove /api prefix if present, but keep the leading slash
      let path = pathname;
      if (pathname.startsWith('/api/')) {
        path = pathname.slice(4); // Remove '/api'
      }
      // Ensure path starts with /
      if (!path.startsWith('/')) {
        path = '/' + path;
      }
      req.path = path;
      req.query = Object.fromEntries(url.searchParams);

      // Apply global middlewares
      await this.applyMiddlewares(this.middlewares, req, res);

      // Find matching route
      const match = this.registry.match(req.method, path);

      if (!match) {
        return jsonResponse(res, 404, {
          error: 'Not found',
          path: pathname,
          method: req.method
        });
      }

      // Add params to request
      req.params = match.params;
      req.matches = match.matches;

      // Parse body for POST/PUT/PATCH requests
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        await this.parseBody(req);
      }

      // Call route handler with params
      await match.handler(req, res, match.params);

    } catch (error) {
      console.error('[Router] Error handling request:', error);

      // Check if response already sent
      if (res.headersSent) {
        return;
      }

      // Send error response
      const statusCode = error.statusCode || 500;
      const message = error.expose ? error.message : 'Internal server error';

      jsonResponse(res, statusCode, {
        error: message,
        ...(process.env.NODE_ENV === 'development' && {
          stack: error.stack,
          details: error.message
        })
      });
    }
  }

  /**
   * Mount sub-router at path prefix
   * @param {string} prefix - Path prefix
   * @param {APIRouter} subRouter - Sub-router instance
   */
  mount(prefix, subRouter) {
    // Copy all routes from sub-router with prefix
    for (const [key, route] of subRouter.registry.routes) {
      const newPattern = prefix + route.pattern;
      this.registry.register(route.method, newPattern, route.handler);
    }
  }

  /**
   * Create error with status code
   * @param {number} status - HTTP status code
   * @param {string} message - Error message
   * @returns {Error} Error with statusCode property
   */
  static error(status, message) {
    const err = new Error(message);
    err.statusCode = status;
    err.expose = true;
    return err;
  }
}

// Create main router instance
export const apiRouter = new APIRouter();

// Export for convenience
export default apiRouter;