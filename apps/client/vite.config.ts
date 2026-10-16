import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

// The API answers on /{gateway}/… (STANDARDS.md); in development the customer site proxies those paths,
// so the session cookie stays on the same origin. App routes never start with a gateway name.
const API = process.env.API_URL ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  // shared package is used from source (status machine, offer calculation)
  resolve: { alias: { '@loans/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) } },
  server: {
    port: 5176, strictPort: true,
    proxy: { '/client/': API, '/public/': API, '/fs/': API },
  },
});
