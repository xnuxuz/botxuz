# xnuxuz — Personal Life OS

Personal assistant system yang meng-cover **schedule**, **grinding/produktivitas**, dan
**finance** dalam satu ekosistem, diakses lewat Telegram, web, dan (nanti) mobile.

Spesifikasi lengkap ada di [`REQUIREMENT.MD`](./REQUIREMENT.MD).
Repo ini saat ini berada di **Fase 0 — Foundation**.

---

## Struktur

```
xnuxuz/
├── .moon/                  # workspace.yml, toolchains.yml, tasks/node.yml
├── apps/
│   ├── api/                # Express API — single source of truth  (@xnuxuz/api)
│   ├── worker/             # BullMQ consumer + bot Telegram        (@xnuxuz/worker)
│   └── web/                # Next.js dashboard                     (@xnuxuz/web)
├── packages/
│   ├── shared/             # types, zod schema, konstanta          (@xnuxuz/shared)
│   ├── db/                 # Prisma schema, migration, query layer (@xnuxuz/db)
│   └── ai/                 # abstraksi LLM + function schema       (@xnuxuz/ai)
├── infra/
│   ├── Dockerfile          # multi-stage: api, worker, web
│   ├── caddy/Caddyfile     # reverse proxy + auto-SSL
│   └── mysql/init/         # SQL yang jalan sekali saat volume dibuat
├── biome.json              # satu-satunya linter + formatter
└── docker-compose.yml
```

Aturan arsitektur yang dipegang: **semua client (bot, web, mobile) hanya konsumsi API**,
zero business logic di handler bot. Semua tabel punya `user_id` sejak hari pertama.

---

## Setup pertama kali

Butuh Node 24, pnpm 11, moon 2, dan Docker.

```bash
pnpm install
cp .env.example .env          # lalu isi secret-nya
```

Isi minimal di `.env`:

```bash
# Generate dua-duanya:
openssl rand -base64 48
```

`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`
wajib diisi; `DATABASE_URL` harus memakai password yang sama dengan `MYSQL_PASSWORD`.

Lalu nyalakan infra dan migrasi database:

```bash
pnpm infra:up                 # MySQL + Redis Stack
pnpm db:migrate               # bikin & apply migration
```

## Menjalankan (development)

```bash
moon run api:dev              # http://localhost:3011
moon run worker:dev           # BullMQ + bot Telegram (polling)
moon run web:dev              # http://localhost:3010
```

Cek API hidup:

```bash
curl http://localhost:3011/health         # liveness
curl http://localhost:3011/health/ready   # readiness: cek MySQL + Redis
```

### Kenapa portnya tidak standar

Port default di repo ini digeser (`3011` api, `3010` web, `3316` MySQL, `6389` Redis)
supaya tidak bentrok dengan service lain di mesin dev. Semuanya bisa diubah lewat `.env`.

## Task moon

Task standar diwarisi semua project dari `.moon/tasks/node.yml`:

| Perintah | Fungsi |
|---|---|
| `moon run :build` | build semua project (topologis, ter-cache) |
| `moon run :typecheck` | `tsc --noEmit` |
| `moon run :lint` | Biome check |
| `moon run :test` | Vitest |
| `moon ci` | hanya project yang **affected** oleh perubahan |

Pre-commit (lefthook) menjalankan `biome check --write` pada file staged;
pre-push menjalankan typecheck.

## Deploy (single VPS)

```bash
docker compose --profile app up -d --build
```

Menyalakan `mysql`, `redis`, `api`, `worker`, `web`, dan `caddy` (auto-SSL Let's Encrypt).
Set `DOMAIN` di `.env` ke domain asli sebelum menjalankan di VPS.

---

## Status Fase 0

Sudah ada:

- Monorepo moon + Biome, toolchain Node/pnpm ter-pin
- Express API dengan helmet, CORS, rate limit ber-Redis, error handler berkode stabil,
  health/readiness check, graceful shutdown
- Worker BullMQ (queue `reminder` + `notification`) dan kerangka bot Telegram long-polling
- Prisma 7 (query compiler TS, tanpa Rust engine) + migration `init`
- Abstraksi LLM (Groq + embedding Gemini) dan function schema intent router
- Docker Compose + Dockerfile multi-stage + Caddy, GitHub Actions `moon ci`

Belum ada (langkah berikutnya):

- Modul auth (register/login argon2id, JWT + refresh rotasi, `/link` Telegram)
- `NotificationService` beserta adapter Telegram & email
- Data model penuh — baru `User` yang dimodelkan; sisanya menunggu dokumen schema
  terpisah sesuai REQUIREMENT §6
