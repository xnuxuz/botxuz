# Multi-stage: satu Dockerfile menghasilkan tiga image (api, worker, web).
# Layer install di-cache terpisah dari source supaya rebuild cepat di VPS.

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate
WORKDIR /app

# ---------------------------------------------------------------- deps
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/ai/package.json packages/ai/
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------- build
FROM deps AS build
COPY . .
RUN pnpm --filter @xnuxuz/db generate \
  && pnpm --filter @xnuxuz/shared --filter @xnuxuz/db --filter @xnuxuz/ai exec tsc --build \
  && pnpm --filter @xnuxuz/api --filter @xnuxuz/worker exec tsc --build \
  && pnpm --filter @xnuxuz/web build

# Buang devDependencies supaya image runtime jauh lebih kecil.
FROM build AS prune
RUN pnpm prune --prod

# ---------------------------------------------------------------- api
FROM base AS api
ENV NODE_ENV=production
COPY --from=prune /app/node_modules ./node_modules
COPY --from=prune /app/packages ./packages
COPY --from=prune /app/apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 3011
CMD ["node", "dist/main.js"]

# ---------------------------------------------------------------- worker
FROM base AS worker
ENV NODE_ENV=production
COPY --from=prune /app/node_modules ./node_modules
COPY --from=prune /app/packages ./packages
COPY --from=prune /app/apps/worker ./apps/worker
WORKDIR /app/apps/worker
CMD ["node", "dist/main.js"]

# ---------------------------------------------------------------- web
FROM base AS web
ENV NODE_ENV=production
# Output standalone sudah membundel node_modules yang dibutuhkan.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3010
CMD ["node", "apps/web/server.js"]
