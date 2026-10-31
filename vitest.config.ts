import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/web/**/*.test.ts'], reporters: ['default', 'junit'], outputFile: { junit: 'artifacts/vitest.xml' } } });
