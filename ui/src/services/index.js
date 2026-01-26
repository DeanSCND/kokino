/**
 * Service Layer Entry Point
 * Phase 4a: Service Layer Foundation
 *
 * Centralized exports for all services
 */

// API Services
export { default as apiClient } from './api/client.js';
export * as agentService from './api/agentService.js';
export * as messageService from './api/messageService.js';
export * as configService from './api/configService.js';
export { default as teamService } from './api/teamService.js';
export { default as orchestrationService } from './api/orchestrationService.js';

// WebSocket
export { default as wsConnection } from './websocket/connection.js';
export { default as websocketService } from './websocket/connection.js';

// Storage
export { default as teamStorage } from './storage/teamStorage.js';
export * as canvasStorage from './storage/canvasStorage.js';

// Re-export API Error for convenience
export { APIError } from './api/client.js';
