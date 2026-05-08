# GustoPro Gestionale

Sistema di gestione ristorante multi-tenant SaaS.
Live: https://gestione.gustopro.it

> Stack: React 19 + Vite 6 PWA · Express + Socket.io + Postgres 15 · Docker Compose · Cloudflare proxy · VPS Hetzner.

---

## Quick start (dev locale)

```bash
# Backend
cd backend && npm install
cp .env.example .env  # popola POSTGRES_PASSWORD, JWT_SECRET, SUPERADMIN_API_KEY
docker compose up -d postgres
npm run dev  # porta 3001

# Frontend
cd frontend && npm install
npm run dev  # porta 5173
```

Login dev: `admin` / `0000` (creato dal seed).

---

## Deploy in produzione

**Auto-deploy poll-based**: ogni `git push origin main` viene applicato sul VPS entro **5 minuti** (cron `*/5`).

```
git push origin main → cron VPS → diff-aware rebuild → health check → live
                                       ↓ (se fail)
                                   auto-rollback git+rebuild
```

Lo script `/home/gustopro/scripts/auto-deploy.sh` sul VPS:
- Polla `origin/main`, esce se HEAD locale = remote
- Rebuild **selettivo** in base al diff: solo `backend/`, `frontend/`, o entrambi
- Applica migrations SQL nuove (`migrations/*.sql`, idempotenti)
- Health check `/health` con timeout 30s; se fallisce → rollback al commit precedente
- Lock file `/tmp/gustopro-deploy.lock` previene deploy paralleli
- Log su `/home/gustopro/logs/auto-deploy.log`

**Trigger manuale immediato** (invece di aspettare il cron):
```bash
ssh -i ~/.ssh/qubitrex-deploy gustopro@178.104.106.143 "/home/gustopro/scripts/auto-deploy.sh"
```

---

## Architettura

### Multi-tenant
- **33 tabelle** hanno colonna `tenant_id UUID` con FK a `tenants(id) ON DELETE RESTRICT`
- **Indice** su `tenant_id` su tutte
- Backend: middleware `resolveTenant` estrae tenant dal JWT (post-login) o da header `X-Tenant-Slug` / query `?tenant=X` (pre-login)
- Frontend: `localStorage.gustopro_tenant_slug` viene mandato come header dall'axios interceptor
- 2 tenant attivi:
  - `riva-beach` (default, Riva Beach Salento)
  - `bistrot-test` (sandbox per test cross-tenant)

### Stack runtime
```
[Browser PWA] ──HTTPS── [Cloudflare proxy] ──HTTP── [VPS Hetzner CPX22 NBG1]
                                                          │
                                                ┌─────────┼─────────┐
                                                ▼         ▼         ▼
                                          gestionale-frontend (nginx :80)
                                          gestionale-backend (Express :3001)
                                          gestionale-postgres (PG 15.17 :5432)
```

### Frontend
- React 19 + Vite 6 + Tailwind 4 (`@theme` tokens Riva)
- Code-split: 1 chunk eager (Login) + 26 lazy chunks (uno per pagina)
- PWA: Service Worker (Workbox) + Dexie offline queue + idempotency-key UUID
- Design system v2 in `src/components/v2/`: Button, Card, Badge, StatusDot, Input, Modal, BottomSheet, Toast, useConfirm
- Bundle main: **138 KB gzip** + page chunks 3-7 KB gzip ciascuna

### Backend
- Express + Socket.io
- JWT 12h (HS256, secret in `.env`)
- Helmet + CORS allowlist + express-rate-limit (15 login/15min)
- Idempotency middleware su POST/PATCH/DELETE
- ServiceTimer background (ogni 30s) per generare alert workflow

---

## Sicurezza

| Layer | Protezione |
|---|---|
| TLS | Cloudflare edge HTTPS + cert origine Let's Encrypt |
| Headers | HSTS preload + X-Frame DENY + X-Content-Type nosniff + CSP stretta + Referrer-Policy |
| CSP | `default-src 'self'`, no `unsafe-eval`, no remote scripts |
| Auth | JWT 12h + bcrypt 10 PIN + rate-limit login 15/15min |
| CORS | Allowlist da env `ALLOWED_ORIGINS` |
| Tenant | Multi-tenant isolation testata empiricamente (cross-tenant smoke test) |
| Firewall | UFW: 22, 80, 443 only |
| Brute force | Fail2ban su sshd (5 retry, ban 1h) |
| SSH | Solo chiave (PasswordAuthentication no, root disabilitato) |
| Updates | unattended-upgrades attivo |
| Vulnerabilità | `npm audit` 0 deps issues |

---

## Backup e disaster recovery

### Strato 1 — pg_dump giornaliero locale
Cron `03:00 UTC` (05:00 IT) → `/home/gustopro/backups/gustopro_YYYY-MM-DD_HHMMSS.sql.gz`

Script: `/home/gustopro/scripts/db-backup.sh`
- Integrity check post-dump (gzip + count CREATE/COPY ≥ 30)
- Retention 30 giorni (~1 MB/anno alla crescita attuale)
- Healthcheck pingback opzionale via `HEALTHCHECK_URL` in `/home/gustopro/.backup-env`

### Strato 2 — Hetzner snapshot settimanale
Snapshot intera VM, automatico, incluso nel costo del CPX22.

### Restore
```bash
ssh gustopro@178.104.106.143
ls -lh /home/gustopro/backups/  # scegli il dump
/home/gustopro/scripts/db-restore.sh /home/gustopro/backups/gustopro_2026-05-08_135648.sql.gz
# conferma "YES" maiuscolo (case sensitive)
```

Tempo stimato: 30-60s (su DB attuale 35 KB compresso → ~10 MB raw).

---

## Performance (live audit 2026-05-08)

| Endpoint | TTFB | Note |
|---|---|---|
| `/health` | 104 ms | proxy → backend |
| `/api/tables` | 84 ms | 48 rows |
| `/api/menu/items` | 102 ms | 85 rows |
| `/api/kds/pending` | 184 ms | join 4 tabelle |
| `/api/billing/receipts` | 67 ms | 11 rows |

Container resources (idle Riva chiuso):
- Postgres: 3.4 MB / 3.7 GB (0.09%)
- Backend:  22.7 MB / 3.7 GB
- Frontend: 37.7 MB / 3.7 GB
- CPU totale: < 0.05%

DB query profiling: tutte le top 15 query sotto **1 ms** mean_exec_time.
Tracking attivo via `pg_stat_statements`.

---

## Operazioni comuni

### Vedere log live
```bash
ssh gustopro@178.104.106.143
docker logs -f gestionale-backend  # o frontend / postgres
docker stats  # uso risorse
```

### Lista query DB più lente
```sql
SELECT substring(query, 1, 80), calls, ROUND(mean_exec_time::numeric, 2) AS mean_ms
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY mean_exec_time DESC LIMIT 20;
```

### Reset stats
```sql
SELECT pg_stat_statements_reset();
```

### Onboarding nuovo tenant (superadmin)
1. Vai su https://gestione.gustopro.it/admin-saas
2. Inserisci `SUPERADMIN_API_KEY` (in `.env` su VPS)
3. Click "Nuovo tenant" → compila slug, nome, P.IVA, indirizzo, admin nome+PIN
4. L'admin del nuovo tenant può loggarsi con
   - URL `https://gestione.gustopro.it/?t=<slug>`
   - oppure header `X-Tenant-Slug: <slug>`

---

## File chiave

```
.
├── backend/src/
│   ├── app.js             # express setup + helmet/cors/rate-limit
│   ├── index.js           # server entrypoint
│   ├── controllers/       # 27 controller (tutti tenant-aware)
│   ├── middleware/
│   │   ├── auth.js        # JWT verify
│   │   ├── tenant.js      # resolveTenant (JWT/header/query)
│   │   ├── idempotency.js # idempotency-key cache
│   │   └── requireSuperadmin.js
│   ├── routes/            # mount per /api/<resource>
│   ├── services/
│   │   ├── serviceTimer.js   # background alerts (30s tick)
│   │   └── performanceTracker.js
│   └── socket.js
├── frontend/src/
│   ├── pages/             # 27 pages (tutte lazy-loaded)
│   ├── components/v2/     # design system v2 (10 primitivi)
│   ├── context/           # Auth, Toast (adapter→v2), Socket, Cart
│   ├── lib/
│   │   ├── api.js         # axios + interceptor JWT/idempotency/offline
│   │   ├── storage.js     # safe localStorage wrapper
│   │   ├── offlineDB.js   # Dexie queue PWA
│   │   └── offlineSync.js # background sync
│   └── App.jsx            # routing + Suspense + RouteFallback
├── migrations/            # SQL schema migrations 001-018
├── docker-compose.yml     # postgres + backend + frontend
└── README.md              # questo file
```

---

## Memo VPS

```
IPv4:  178.104.106.143
SSH:   ssh -i ~/.ssh/qubitrex-deploy gustopro@178.104.106.143
DB:    postgres://gustopro:***@postgres:5432/gustopro
.env:  /home/gustopro/app/.env (chmod 600)
Logs:  /home/gustopro/logs/
       /home/gustopro/backups/backup.log
```

---

## License

Privato, proprietario GustoPro / Riva Beach Salento.
