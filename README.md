# xnuxuz — Personal Life OS

Personal assistant system yang meng-cover **schedule**, **grinding/produktivitas**, dan
**finance** dalam satu ekosistem, diakses lewat Telegram, web, dan (nanti) mobile.

Spesifikasi lengkap ada di [`REQUIREMENT.MD`](./REQUIREMENT.MD).
Fase 0 (foundation) selesai; **Fase 1 — Assistant MVP** sedang berjalan.

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
│   ├── notify/             # NotificationService + adapter         (@xnuxuz/notify)
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

## Endpoint

Semua di bawah `/api/v1`. Kecuali `/auth/register`, `/auth/login`, `/auth/refresh`,
semuanya butuh header `Authorization: Bearer <access token>`.

| Metode | Path | Fungsi |
|---|---|---|
| POST | `/auth/register` `/auth/login` `/auth/refresh` `/auth/logout` | kredensial & token |
| GET | `/auth/me` | profil user |
| GET/DELETE | `/auth/sessions[/:id]` | device management |
| POST/DELETE | `/auth/telegram/code`, `/auth/telegram/link` | hubungkan akun Telegram |
| PATCH | `/user/me` | timezone, jam briefing |
| GET/PUT | `/user/notif-prefs[/:type]` | channel & quiet hours per jenis notifikasi |
| GET/POST/PATCH/DELETE | `/categories` | kategori task/event/finance |
| GET/POST/PATCH/DELETE | `/tasks` | CRUD task |
| POST | `/tasks/:id/complete` | selesai; task berulang otomatis dibuat ulang |
| GET | `/events/schedule?from=&to=` | jadwal dengan RRULE sudah diekspansi |
| GET | `/events/conflicts?from=&to=` | cek bentrok sebelum simpan |
| GET/POST/PATCH/DELETE | `/events` | CRUD event |
| POST | `/sessions/start` `/sessions/stop` | timer sesi kerja |
| GET/POST/DELETE | `/sessions` | riwayat & entri manual |
| GET | `/sessions/stats` | streak, heatmap, progres mingguan |
| GET/PUT/DELETE | `/goals[/:categoryId]` | target jam mingguan per kategori |

Endpoint di bawah `/internal` hanya untuk worker/bot, dilindungi
`x-internal-secret`, dan tidak diteruskan Caddy ke publik.

## Perintah bot

`/link <kode>` · `/today` · `/tasks` · `/task <judul>` · `/done <nomor>` · `/help`

Handler bot hanya meneruskan ke API dan menampilkan balasannya — nol business
logic di bot (§2).

## Status

Fase 0 — selesai:

- Monorepo moon + Biome, toolchain Node/pnpm ter-pin
- Express API: helmet, CORS, rate limit ber-Redis, error handler berkode stabil,
  health/readiness check, graceful shutdown
- Auth: argon2id, JWT 15 menit, refresh token opaque dengan rotasi + deteksi reuse,
  device management, link Telegram lewat kode sekali pakai
- `NotificationService` (package terpisah) dengan adapter Telegram & email,
  fallback antar-channel, quiet hours, dan preferensi per jenis notifikasi
- Data model penuh 16 tabel sesuai §6
- Docker Compose + Dockerfile multi-stage + Caddy, GitHub Actions `moon ci`

Fase 1 — sedang berjalan:

- ✅ CRUD task (prioritas, deadline, recurring lewat RRULE) dan event
  (RRULE kompatibel Google Calendar, deteksi bentrok)
- ✅ Reminder BullMQ: offset kustom atau default kategori, dibatalkan otomatis
  saat item digeser/dihapus, job id deterministik supaya tidak double-fire
- ✅ Daily briefing per zona waktu user (jadwal, task prioritas, sisa jatah harian)
- ✅ Bot Telegram dua arah
- ✅ Session logging (timer + entri manual), streak global & per kategori,
  heatmap kontribusi, goal jam mingguan
- ⬜ Nightly review otomatis

Belum tersentuh: modul finance (fase 3), AI layer (fase 2), Google Calendar sync,
dashboard web.
