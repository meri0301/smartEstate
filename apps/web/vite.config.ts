import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Where the dev server proxies API calls.
 *
 * 3100 matches the API's own default, which is deliberately not 3000: that is
 * the default of most Node frameworks and every tutorial, so on a machine with
 * a second project running it is the one port guaranteed to be taken.
 *
 * Still overridable, because the API can be told to listen anywhere; set
 * API_PROXY_TARGET to wherever it actually is.
 */
const API_ORIGIN = process.env.API_PROXY_TARGET ?? 'http://localhost:3100';

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
