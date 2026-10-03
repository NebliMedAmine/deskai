import { defineConfig } from 'tsup';

// Dual build: CommonJS for the NestJS api, ESM for the Vite web app.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
