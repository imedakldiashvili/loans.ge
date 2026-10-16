import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// OTP viewer — TEST ENVIRONMENTS ONLY. Reads /dev/outbox from the API (exists only when the API runs with DEV_OUTBOX=true).
const API = process.env.API_URL ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, proxy: { '/dev/': API } },
});
