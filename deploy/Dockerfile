# One build for the whole monorepo; two images come out of it:
#   api — the NestJS API (migrations run on start)
#   web — Caddy: HTTPS, the four web apps as static files, the gateway paths proxied to the API
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/client/package.json apps/client/
COPY apps/partner/package.json apps/partner/
COPY apps/otp-viewer/package.json apps/otp-viewer/
RUN npm ci
COPY . .
# the public address of the API (the integration pages link to its /docs)
ARG VITE_API_PUBLIC_URL
ENV VITE_API_PUBLIC_URL=$VITE_API_PUBLIC_URL
RUN cd apps/api && npx prisma generate \
 && cd /app && npm run build \
 && npm run build -w @loans/client -w @loans/admin -w @loans/partner -w @loans/otp-viewer

FROM build AS api
WORKDIR /app/apps/api
ENV FS_ROOT=/data/fs
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]

FROM caddy:2.8 AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/client/dist /srv/client
COPY --from=build /app/apps/admin/dist /srv/admin
COPY --from=build /app/apps/partner/dist /srv/partner
COPY --from=build /app/apps/otp-viewer/dist /srv/otp
