// Demo "bank system": receives loans.ge webhooks on POST /hook, checks the HMAC signature, shows them on GET /.
// Test tool for integration (not part of the product). The signing secret: WEBHOOK_SECRET env or POST /secret { secret }.
// Usage: npm run demo:webhook  (or: node tools/webhook-receiver.mjs [port]) → register http://localhost:5190/hook in the partner cabinet.
import { createHmac, timingSafeEqual } from 'crypto';
import { createServer } from 'http';

const port = Number(process.argv[2] ?? 5190);
let secret = process.env.WEBHOOK_SECRET ?? '';
const got = [];

const verify = (h, body) => {
  if (!secret) return 'no secret set';
  const expected = `sha256=${createHmac('sha256', secret).update(`${h['x-loans-timestamp']}.${body}`).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(h['x-loans-signature'] ?? ''));
  return a.length === b.length && timingSafeEqual(a, b) ? 'valid' : 'INVALID';
};

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bank system · webhook receiver</title>
<style>
:root{--bg:#f4f6fb;--card:#fff;--fg:#1f2840;--muted:#6b7590;--line:#dde3ef;--ok:#2e8b3e;--bad:#c0392b}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#151826;--card:#1f2336;--fg:#e8ebf5;--muted:#9aa0b8;--line:#2e3450}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:8px 0 4px}p.sub{color:var(--muted);margin:0 0 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:12px;animation:in .4s}
@keyframes in{from{background:#fff7d6}}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
.ev{font-weight:700;font-size:15px}.t{color:var(--muted);font-size:12px}
.tag{padding:2px 8px;border-radius:99px;font-size:12px;font-weight:700;color:#fff}.ok{background:var(--ok)}.bad{background:var(--bad)}
pre{margin:0;background:var(--bg);border-radius:6px;padding:10px;overflow:auto;font-size:12px}
.h{font-size:12px;color:var(--muted);word-break:break-all}.empty{color:var(--muted);text-align:center;padding:40px}
</style></head><body><div class="wrap">
<h1>🏦 Bank system — webhook receiver</h1><p class="sub">Listening on <code>http://localhost:${port}/hook</code> · updates every second</p>
<div id="list"><div class="empty">Waiting for webhooks…</div></div></div>
<script>
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
async function load(){const r=await fetch('/events');const l=await r.json();
document.getElementById('list').innerHTML=l.length?l.map(e=>'<div class="card"><div class="row"><span class="ev">'+esc(e.event)+'</span>'
+'<span class="tag '+(e.signature==='valid'?'ok':'bad')+'">signature '+esc(e.signature)+'</span><span class="t">'+esc(e.at)+'</span></div>'
+'<div class="h">X-Loans-Delivery: '+esc(e.delivery)+'<br>X-Loans-Signature: '+esc(e.sig)+'</div><pre>'+esc(JSON.stringify(e.body,null,2))+'</pre></div>').join(''):'<div class="empty">Waiting for webhooks…</div>';}
load();setInterval(load,1000);
</script></body></html>`;

createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method === 'POST' && req.url === '/hook') {
      let parsed = body;
      try {
        parsed = JSON.parse(body);
      } catch {
        /* keep raw */
      }
      got.unshift({ at: new Date().toLocaleTimeString(), event: req.headers['x-loans-event'], delivery: req.headers['x-loans-delivery'], sig: req.headers['x-loans-signature'], signature: verify(req.headers, body), body: parsed });
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"received":true}');
    } else if (req.method === 'POST' && req.url === '/secret') {
      secret = JSON.parse(body || '{}').secret ?? '';
      res.writeHead(200).end('ok');
    } else if (req.url === '/events') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(got));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page);
    }
  });
}).listen(port, () => console.log(`webhook receiver on http://localhost:${port}`));
