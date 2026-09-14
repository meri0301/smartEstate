import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Where the dev server proxies API calls. Overridable because port 3000 is a
 * popular default and may already be taken by something else on the machine;
 * set API_PROXY_TARGET to wherever the API is actually listening.
 */
const API_ORIGIN = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
