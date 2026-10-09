import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

config({ path: resolve(import.meta.dirname, '../../.env'), quiet: true });
const apiUrl = process.env['API_URL'] ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Same-origin API in dev (mirrors CloudFront routing /api to the API in prod), so the
  // httpOnly refresh cookie works without CORS.
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: apiUrl, changeOrigin: false } },
  },
  preview: { port: 5173, proxy: { '/api': { target: apiUrl } } },
});
