import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
        statements: 90,
      },
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/index.ts', 'packages/*/src/types/**/*.ts', 'packages/diagnostics/src/cli.ts'],
    },
  },
});
