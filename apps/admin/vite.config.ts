import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The API answers on /{gateway}/… (STANDARDS.md); in development the admin app proxies those paths,
// so the session cookie stays on the same origin. App routes never start with a gateway name.
const API = process.env.API_URL ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/admin/': API, '/public/': API },
  },
});
