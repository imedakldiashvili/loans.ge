// Tiny helpers for the API smoke tests (run against a running API).
// Usage: node test/<file>.mjs [baseUrl] [apiLogFile]
// The OTP code is only written to the API console (console SMS/email provider), so login reads it from the API log file.
import { readFileSync } from 'fs';

export const B = process.argv[2] ?? 'http://localhost:4000';
export const LOG = process.argv[3] ?? process.env.API_LOG;
let failed = 0;
/** session cookie per gateway, sent automatically by `call` */
const cookies = {};

export const ok = (cond, msg, extra) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}${!cond && extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 400) : ''}`);
  if (!cond) failed++;
};

export const call = async (method, path, body, headers = {}) => {
  const gw = path.split('/')[1];
  const cookie = cookies[gw];
  const r = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, uid: r.headers.get('x-request-uid'), headers: r.headers, json: await r.json().catch(() => null) };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Last OTP code sent to `target` according to the API log. */
export const otpFromLog = async (target) => {
  if (!LOG) throw new Error('API log file is required (3rd argument or API_LOG) to read the OTP code');
  for (let i = 0; i < 20; i++) {
    const lines = readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes(`→ ${target}`));
    // Nest colours its log lines — strip ANSI codes before reading the code
    const m = lines.at(-1)?.replace(/\x1b\[[0-9;]*m/g, '').match(/(\d{4,6})\s*$/);
    if (m) return m[1];
    await sleep(100);
  }
  throw new Error(`no OTP in log for ${target}`);
};

/** sendOtp → code from log → verifyOtp; keeps the session cookie for later calls to that gateway. */
export const login = async (gateway, loginValue, profileId) => {
  let s = await call('POST', '/public/auth/sendOtp', { Gateway: gateway, Login: loginValue });
  // resend interval not over yet (same account used by a previous suite) — wait and retry once
  if (s.status === 429) {
    const wait = Number(s.json?.Error?.Message?.match(/(\d+)/)?.[1] ?? 10);
    await sleep((wait + 1) * 1000);
    s = await call('POST', '/public/auth/sendOtp', { Gateway: gateway, Login: loginValue });
  }
  if (s.status !== 200) return { send: s };
  const target = loginValue.includes('@') ? loginValue.toLowerCase() : loginValue.replace(/\D/g, '').replace(/^995/, '');
  const code = await otpFromLog(target);
  const v = await call('POST', '/public/auth/verifyOtp', { ID: s.json.Data.ID, UID: s.json.Data.UID, Otp: code, ...(profileId ? { ProfileID: profileId } : {}) });
  const set = v.headers.get('set-cookie');
  if (set) cookies[gateway] = set.split(';')[0];
  return { send: s, verify: v, code };
};

export const forget = (gateway) => delete cookies[gateway];
export const setCookie = (gateway, value) => (cookies[gateway] = value);
export const getCookie = (gateway) => cookies[gateway];

export const done = () => {
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
};
