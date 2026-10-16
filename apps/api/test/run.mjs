// Runs all API test suites against the TEST database (TEST_DATABASE_URL, default loans_test): migrates and reseeds it, starts the built API on a free port with its log in a file,
// runs every suite against it and stops it. Usage: npm run test:api -w @loans/api  (after npm run build)
import { spawn, spawnSync } from 'child_process';
import { openSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const port = process.env.TEST_PORT ?? '4099';
const base = `http://localhost:${port}`;
const log = join(root, '.api-test.log');
const SUITES = ['auth', 'smoke', 'admin-config', 'users', 'views', 'partner'];

// tests use their own database — the working one (DATABASE_URL in .env) is never touched
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://loans:loans@localhost:5433/loans_test';
process.env.DEV_OUTBOX = 'true';
for (const args of [['prisma', 'migrate', 'deploy'], ['prisma', 'db', 'seed']]) {
  const r = spawnSync('npx', args, { cwd: root, shell: true, stdio: ['ignore', 'ignore', 'inherit'], env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// suites log in the same accounts one after another — use the shortest allowed OTP resend interval (10 s)
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();
const otp = await prisma.setting.findFirst({ where: { key: 'otp' } });
await prisma.setting.update({ where: { id: otp.id }, data: { value: { sms: { ...otp.value.sms, resend: 10 }, email: { ...otp.value.email, resend: 10 } } } });
await prisma.$disconnect();

const out = openSync(log, 'w');
const api = spawn(process.execPath, ['dist/main.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: ['ignore', out, out] });

let failed = 0;
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${base}/public/system/health`)).ok) break;
    } catch {}
    if (i > 50) throw new Error('API did not start — see ' + log);
    await new Promise((r) => setTimeout(r, 200));
  }
  for (const s of SUITES) {
    console.log(`\n── ${s}`);
    const r = spawnSync(process.execPath, [join(here, `${s}.mjs`), base, log], { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) failed++;
  }
} finally {
  api.kill();
}
console.log(failed ? `\n${failed} suite(s) failed` : `\nall ${SUITES.length} suites passed`);
process.exit(failed ? 1 : 0);
