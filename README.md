# loans.ge

Loan marketplace: customer site, partner (bank/MFO) cabinet, admin console, one API.
Plan and decisions: [BACKEND-PLAN.md](BACKEND-PLAN.md). Design prototypes (reference, not changed): [prototype/](prototype/).

## Layout

| Path | What |
|---|---|
| `packages/shared` | Types, offer status machine, offer calculation — used by the API and all clients |
| `apps/api` | NestJS API (`/{gateway}/{module}/{action}`, standards in [STANDARDS.md](STANDARDS.md)); Prisma schema and seed in `apps/api/prisma`; SMS / email go to the console for now |
| `apps/admin` | Admin console — React + Vite, talks to the API through the dev proxy (`/admin`, `/public`) |
| `apps/otp-viewer` | **Test environments only** — page with the one-time codes the API "sent" (needs `DEV_OUTBOX=true`) |
| `prototype/` | Single-file HTML prototypes and the design system (visual reference) |

## Run locally

```bash
npm install
npm test            # shared package tests
npm run build
npm run db:up       # postgres (port 5433) + redis (needs Docker Desktop running)
npm run db:migrate -w @loans/api   # apply migrations
npm run db:seed -w @loans/api      # demo data from the prototypes
npm run dev:api     # http://localhost:4000/public/system/health
npm run dev:admin   # http://localhost:5173 — admin console (API must be running)
npm run dev:otp     # http://localhost:5174 — OTP viewer (test environments only)
npm run test:api   # reseeds the DB, starts the API, runs all API test suites
```

Copy `.env.example` to `.env` to change ports or providers.

## Logging in locally

SMS / email are not sent yet. The one-time code is written to the API console (`[SMS]` / `[Email]` lines) and, with
`DEV_OUTBOX=true` in `.env`, shown in the OTP viewer (http://localhost:5174). `DEV_OUTBOX` is ignored when
`NODE_ENV=production` — the `/dev` routes are not registered and nothing is stored. Never enable it on a real server.
Demo admins: `admin@loans.ge` (super), `operator@loans.ge`, `analyst@loans.ge`.
