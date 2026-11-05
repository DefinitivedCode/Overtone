import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

export default defineConfig({
  base: process.env['VITE_BASE'] ?? '/',
  plugins: [react()],
  resolve: { alias },
  build: { target: 'es2022', sourcemap: false },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/engine/**'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'engine',
          environment: 'node',
          include: ['src/engine/**/*.test.ts'],
          setupFiles: ['src/test/setup-node.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'linguistic',
          environment: 'node',
          include: ['tests/linguistic/**/*.test.ts'],
          testTimeout: 120_000,
        },
      },
    ],
  },
});
