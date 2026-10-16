// Loads .env into process.env before any module reads it (imported first in main.ts). Real environments set variables directly.
try {
  process.loadEnvFile();
} catch {
  /* no .env file */
}
