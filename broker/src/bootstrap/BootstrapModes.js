/**
 * Bootstrap System - Mode and Status Constants
 * Phase 3: Bootstrap System
 */

export const BootstrapMode = {
  NONE: 'none',
  AUTO: 'auto',
  MANUAL: 'manual',
  CUSTOM: 'custom'
};

export const BootstrapStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  READY: 'ready'
};

export const DEFAULT_BOOTSTRAP_CONFIG = {
  mode: BootstrapMode.AUTO,
  timeout: 30000,
  autoLoadPaths: [
    'CLAUDE.md',
    '.kokino/context.md',
    '.kokino/bootstrap.md'
  ],
  maxContextSize: 50000 // characters
};

export default {
  BootstrapMode,
  BootstrapStatus,
  DEFAULT_BOOTSTRAP_CONFIG
};
