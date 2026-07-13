# SEO Dashboard Ops Runbook

Last updated: 2026-07-13

## Purpose

Operate Maximo SEO Dashboard portfolio spine:

- project roster (`seo_domains`)
- durable snapshots (`seo_snapshots`)
- open alerts / tasks (`seo_alerts`, `seo_tasks`)
- Command Center KPIs + CSV export + operator sync

## Required production env

| Variable | Role |
|---|---|
| `DASHBOARD_AUTH_USERNAME` | Login email/username |
| `DASHBOARD_AUTH_PASSWORD` | Login password (rotate regularly) |
| `DASHBOARD_AUTH_SECRET` | HMAC secret for dashboard tokens |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Browser-safe anon key / JWT verify |
| `SUPABASE_SERVICE_ROLE` | Server-only durable writes (NEVER ship to client) |

Aliases accepted for service role:

- `SUPABASE_SERVICE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_MCP_SERVICE_ROLE`

Optional bridges:

- `TODO_API_KEY` + `TODO_API_BASE_URL` → push critical alerts to To-Do Tasks
- `ASANA_ACCESS_TOKEN` + `ASANA_SEO_PROJECT_GID` (or workspace gid)

## Secret rotation

1. Generate new password / secret (24+ chars, unique).
2. Set in Vercel project env for Production + Preview.
3. Redeploy API/serverless functions so runtime picks env.
4. Invalidate old active sessions by rotating `DASHBOARD_AUTH_SECRET`.
5. Update operator password manager / secure notes.
6. Smoke-test login at `/api/status` + dashboard login page.

**Rules**

- Never commit secrets.
- Never put service role in `VITE_*` vars.
- Prefer Doppler / platform secret stores over shell plaintext.

## Operator workflows

### Full portfolio sync (persist alerts + task briefs)

```bash
curl -X POST https://seo-dashboard.maximo-seo.ai/api/sync \
  -H "Authorization: Bearer <dashboard-token>" \
  -H "Content-Type: application/json" \
  -d '{"limit":20,"createTasks":true,"push":false}'
```

### Sync + push bridges (Todo/Asana)

```bash
curl -X POST https://seo-dashboard.maximo-seo.ai/api/sync \
  -H "Authorization: Bearer <dashboard-token>" \
  -H "Content-Type: application/json" \
  -d '{"limit":10,"createTasks":true,"push":true}'
```

Single domain:

```bash
curl -X POST .../api/sync -d '{"domain":"example.com","createTasks":true}'
```

UI path: **Command Center → Sync spine / Sync + push bridges**

### Portfolio export

- UI buttons on Projects or Command Center
- API: `GET /api/portfolio/export?format=csv&status=active&q=`
- CSV is UTF-8 with BOM for Excel Hebrew/RTL friendliness

### Command Center

- `GET /api/command-center`
- KPIs: projects, avg health, open alerts/tasks, synced vs stale
- Worst health sites + hottest alert backlog

## Data health checks

1. `GET /api/status` → auth mode + identity
2. `GET /api/projects` → source should be `supabase` when service role healthy
3. `GET /api/command-center` → `kpis.serviceRole=true` and `source=supabase`
4. After sync: expect snapshot rows + alerts upserted without duplicates (`dedupe_key` in evidence)

## Failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `/api/sync` 503 | missing service role | set `SUPABASE_SERVICE_ROLE` then redeploy |
| auth fails after rotate | secret/password mismatch | re-set `DASHBOARD_AUTH_*` consistently |
| portfolio shows seeds | anon-only path / no domains | ensure domains insert + service role |
| Excel CSV garbled Hebrew | missing BOM | use export endpoint (BOM included) |
| bridge skipped | missing TODO/ASANA env | soft-fail expected; add keys if needed |

## Local verify

```bash
npm run typecheck
npm run test
npm run build
```

Optional smoke:

```bash
npm run server:dev
# AUTH_DISABLED=true only for local sandbox
```

## Safety

- Client sites: optimistic increase only after dual-check HTTP 200/no layout break.
- Alerts/tasks persist with idempotent keys — safe to re-run sync.
- Bridges never throw into request lifecycle; each returns `skipped|ok|error`.
