import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only run files matching this pattern
    include: ['tests/**/*.test.js'],
    // Exclude standalone Node scripts
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/agent-config-endpoints.test.js', // Standalone Node script, not a Vitest test
      '**/test-api-endpoints.js' // Standalone Node script
    ],
    // Run tests in Node environment
    environment: 'node',
    // Show test output
    reporters: ['verbose'],
    // Test environment variables
    env: {
      DB_PATH: './src/db/kokino.test.db'
    }
  }
});
