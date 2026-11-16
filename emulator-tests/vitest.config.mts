import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['emulator-tests/**/*.test.ts'], fileParallelism: false, testTimeout: 20000 },
});
