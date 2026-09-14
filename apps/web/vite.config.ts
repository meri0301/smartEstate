import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const API_ORIGIN = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    // `host: true` binds 0.0.0.0 so the dev server is reachable from Docker.
    host: true,
    port: 5173,
    // Same-origin API in development: cookies and CORS behave as in production.
    proxy: {
      '/api': API_ORIGIN,
      '/health': API_ORIGIN,
      '/docs': API_ORIGIN,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
