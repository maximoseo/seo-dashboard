# SEO Dashboard — Operational Reality + Feature Plan
**Date:** 2026-07-13  
**Live URL:** https://seo-dashboard.maximo-seo.ai  
**Repo:** maximoseo/seo-dashboard (`main` @ `78531de`)  
**Local clone:** `/root/seo-dashboard`  
**Login verified:** `service@maximo-seo.com` → `/api/auth/login` **200**, cookie `maximo_dashboard_session`, `/api/projects` **200** (39 projects, `source=supabase`)

---

## 1) What this product is

A Vite + React + Express API SEO ops dashboard for the Webs / MaximoSEO portfolio.

- Landing route: `/projects` (Clients page is effectively the same portfolio selector)
- Per-domain workspace modules: Overview, Keywords, Backlinks, Pages, Vitals, Alerts, Competitors, Content, Local SEO, GEO/AI, Tasks, Reports, Settings
- Auth: **dashboard username/password cookie session** (`mode=dashboard-cookie`), not Supabase Auth for day-to-day login
- Data list: live from Supabase table `seo_domains` (+ `seo_clients`)
- Module metrics: intended multi-provider calls (Ahrefs, SEMrush, DataForSEO, PageSpeed, GTmetrix, SE Ranking, Exa, Browserless, Thorbit) with graceful degradation

---

## 2) Production map (verified)

### 2.1 Domains / Vercel

| Surface | Project | Project ID | Git connect | Production aliases | Latest SHA | State |
|---|---|---|---|---|---|---|
| **REAL PROD** | `seo-dashboard-work` | `prj_YKHzo0voOlbqDxnJnSIlFtSQaIuE` | GitHub `maximoseo/seo-dashboard` @ `main` | **`seo-dashboard.maximo-seo.ai`**, `seo-dashboard-work.vercel.app`, … | `78531de` breadcrumb nav | READY |
| Shadow / stale twin | `seo-dashboard` | `prj_UnyHoFDvkioNY5FFhnk9H6JNsHSu` | **No git link** | `seo-dashboard-roan.vercel.app`, `seo-dashboard-maximo-seo.vercel.app` | older `87b988b` | READY but **not** custom domain prod |

**Important:** Prefer and operator-of-record is **`seo-dashboard-work`**, not the older `seo-dashboard` Vercel project name.

### 2.2 Env vars (verified via Vercel API)

| Project | Env keys present (names only) | Implication |
|---|---|---|
| `seo-dashboard-work` (live domain) | `SUPABASE_URL`, `SUPABASE_ANON_KEY` only | Matches runtime: **all providers report `configured: false`** |
| `seo-dashboard` (shadow) | 16 keys: auth + providers + Supabase + Google OAuth + Frontend | Full ops stack keys exist, but **not on the project that serves maximo-seo.ai** |

**Local secrets-run** has provider keys available (for backfill), and Supabase keys for both:
- `wtpczvyupmavzrxisvcm` (older/extra project, wrong schema for this app)
- `sunrupuwvpalipiuebcv` (**correct** for SEO Dashboard domain tables)

### 2.3 Supabase (canonical for this product)

| Ref | Role for SEO Dashboard | Evidence |
|---|---|---|
| **`sunrupuwvpalipiuebcv`** | **Canonical** | Has `seo_clients` (1: `לקוחות וובס`), `seo_domains` (**39** active), empty `seo_snapshots` / `seo_alerts` / `seo_tasks`, plus broader Agentic OS tables (`sites`, `seo_sites`, …) |
| `wtpczvyupmavzrxisvcm` | **Wrong schema** for this app | No `seo_domains` / `seo_clients`; different `seo_snapshots` shape (`site_id/metric`) |

Migrations in-repo (must stay in sync with sunru):
1. `supabase/migrations/001_seo_foundation.sql` — clients/domains/snapshots/alerts/tasks + broad RLS
2. `supabase/migrations/002_project_workspace_fields.sql` — domain workspace fields + tenant membership table

Live domain rows: **39/39 status=active**; priorities mostly `medium` (3 `high`); exactly **1 client** bucket.

### 2.4 Auth (verified end-to-end)

| Check | Result |
|---|---|
| `GET /api/health` | 200 `{ok:true}` public |
| Protected APIs without cookie | 401 |
| `POST /api/auth/login` with `service@maximo-seo.com` + provided password | **200**, `user.provider=dashboard`, sets `maximo_dashboard_session` |
| `GET /api/projects` after login | **200**, 39 projects, `source=supabase` |
| `/api/status` auth | `{configured:true, mode:dashboard-cookie}` |

UI login page: `/login` (`src/pages/LoginPage.tsx` + `AuthContext`).

**Note:** Cookie auth works in production even though Vercel API lists only Supabase envs on the work project. Treat this as an **ops audit item** (team-level / hidden env / drift). Providers are clearly **not** wired on the live project.

### 2.5 Codebase shape

| Layer | Location |
|---|---|
| Frontend | `src/` React Router app, project workspace nested routes |
| Server | `server/index.ts` Express + serverless wrapper |
| Vercel API shims | `api/*` → serverless rewrites |
| Deploy config | `vercel.json` SPA rewrite + secure headers; `build:frontend` |
| Schema docs | `supabase/migrations/*`, older `DASHBOARD_AUDIT.md` (2026-07-08) |

Local clone was behind origin earlier; now at `78531de` after `git pull`.

---

## 3) Current product health (honest)

### Working
- Login + session cookie
- Projects portfolio from Supabase (**39 live Webs clients**)
- Project drill-down routes + module shells
- Alerts / Competitors pages are API-wired (no longer pure mock-only; continuous commits after 2026-07-08 fixed several audit items)
- New Project UI exists in `ProjectsIndexPage`
- Cookies / health / graceful provider unavailable pattern

### Broken / hollow
1. **Every SEO provider is Not configured on live** (`/api/status`)  
2. **`seo_snapshots`, `seo_alerts`, `seo_tasks` tables are empty** — counts/health/sources shown on cards are **rule-engine / summary synthesizer**, not durable stored SEO truth  
3. **Env split brain**: shadow project has keys; live work project does not (API names)  
4. **Dual Vercel projects** create redeploy/monitor confusion  
5. module `state: cached` with empty provider stack → pages will look populated by synthetic/fallback data more than paid API truth  
6. `seo_client_members` empty → tenant RLS policies in migration 002 are not operationally real yet (server uses anon key server-side; login is not Supabase JWT for staff)  
7. `/api/auth/status` and `/api/auth/me` return **401 without cookie** (path may also SPA-fallback sometimes depending on rewrite) — not used for cookie session validation cleanly in all paths  
8. Cache stats are zeroed (in-memory only; cold on every serverless instance)

---

## 4) Guiding product principle (recommended)

**One portfolio brain for Webs SEO execution:**
1. **Identity of work** = domain/project in `seo_domains`
2. **Evidence** = provider snapshots in `seo_snapshots` (+ Agentic OS `seo_sites`/`sites` later)
3. **Action** = alerts → tasks → done/verified loop
4. **Operations control plane** = provider health, credit usage, last-sync, auth users

Do not invent a second client CRMs if Agentic OS already holds roster tables — **bridge, don’t fork**.

---

## 5) Feature & ops plan (prioritized)

### P0 — Make production truthful (this week)

| # | Work | Why | Effort |
|---|---|---|---|
| P0.1 | **Env unification on `seo-dashboard-work` only** — copy/verify `DASHBOARD_AUTH_*`, `DASHBOARD_API_KEY`, provider keys, `FRONTEND_URL`, Google OAuth as needed from secrets-run / shadow project | Live providers currently dead | 1–2h |
| P0.2 | Confirm Vercel production env **Target=Production + Preview if needed**; redeploy; verify `/api/status` shows configured providers | Prove keys load | 30m |
| P0.3 | **Single production project policy:** keep domain on work; archive/rename shadow project or remove prod aliases; document in runbook | Stops monitor/deploy chaos | 1h |
| P0.4 | Supabase source of truth lock: only **`sunrupuwvpalipiuebcv`** in live env; never wtp | Wrong schema already bites | 15m |
| P0.5 | After keys: smoke 3 domains (nyg/galoz/amir-peleg) on Keywords + Backlinks + Vitals; attach evidence of HTTP + payload shape | Verifies paid AOPs work | 2h |

### P1 — Durable data, not theatre (next 1–2 weeks)

| # | Work | Why |
|---|---|---|
| P1.1 | Nightly/hourly **snapshot job** writing Ahrefs/SEMrush/DataForSEO slices into `seo_snapshots` | RT tables empty today |
| P1.2 | Persist rule findings into `seo_alerts` with idempotent keys | Today alerts are ephemeral synthetic |
| P1.3 | Task creation from alerts with short Hebrew briefs + acceptance criteria | Aligns to agency ops |
| P1.4 | Project card healthScore from **real snapshot derivation**, not static summary heuristics | Trust |
| P1.5 | “Last synced” + Sync Now per domain/module | Ops reality |

### P2 — Portfolio ops UX (next sprint)

| # | Feature | Notes |
|---|---|---|
| P2.1 | **Command-center home** (replace empty-ish dashboard narrative) | KPIs: domains at risk, open critical alerts, stale syncs, provider outages |
| P2.2 | Proper **Clients** CRUD (not alias of projects) | still 1 client bucket only |
| P2.3 | Filters: market, priority, health band, has open critical, missing provider data | Power use for 39+ portfolio |
| P2.4 | Bulk actions: enqueue snapshot, export portfolio CSV, mark paused/archived | Agency scale |
| P2.5 | Domain compare view (2–3 sites rank/link delta) | Sales + strategy |
| P2.6 | Alive screenshot refresh from Browserless/Thorbit when keys exist | Listing polish |

### P3 — Integrations with the rest of Maximo stack

| # | Integration | Benefit |
|---|---|---|
| P3.1 | Bridge `seo_domains` ↔ Agentic OS `sites` / `seo_sites` (same UUID where possible) | One roster |
| P3.2 | Push critical alerts → to-do-tasks / Asana | Already have Asana + todo stack |
| P3.3 | Pull GSC / GA via service Google OAuth already used elsewhere | Organic trend without only paid SEO APIs |
| P3.4 | WP health from saved webs-clients credentials (read-only) into project overview | “Can we log into WP?” signal |
| P3.5 | SEO Audit Pro report links attach to domain | Audit railroad |

### P4 — Security / multi-user (not blocking soft launch)

| # | Item |
|---|---|
| P4.1 | Rotate dashboard password that was typed in Telegram into a password manager + Vercel env; don’t keep only chat history |  
| P4.2 | Machine token `DASHBOARD_API_KEY` for agent cron (no shared interactive password) |  
| P4.3 | If multi-human staff: either A) unique dashboard SOCK users, or B) real Supabase Auth + `seo_client_members` |  
| P4.4 | Treat SPA rewrite collisions carefully for `/api/auth/*` missing cookie paths |  

---

## 6) Suggested roadmap (calendar)

### Phase A — Foundation fix (days 1–3)
1. Env backfill on `seo-dashboard-work`
2. Redeploy + `/api/status` green for Ahrefs/SEMrush/DataForSEO/PageSpeed minimum
3. Domain + project ownership runbook (this doc)
4. Smoke 5 client domains

### Phase B — Snapshot spine (days 4–10)
1. Snapshot writer cron (local Hermes cron **only if user unpauses**; otherwise Vercel cron / GitHub Action)
2. Persist alerts + minimal tasks
3. UI: last-synced + try-again everywhere (PageStates already started)

### Phase C — Agency workflow (days 11–20)
1. Command-center overview
2. To-do / Asana bridge for critical
3. Client grouping + archive
4. Export + weekly Hebrew portfolio digest email to `tomer@webs.co.il`

### Phase D — Platform merge (month 2)
1. Agentic OS roster unification
2. GSC/GA + WP access signals
3. Multi-user staff roles

---

## 7) Concrete feature proposals (product language)

1. **“סטטוס תיק לקוח”** — one screen: health score, top 3 risks, next 3 tasks, last sync of each provider  
2. **“מנוע הפרות”** — rules: traffic crash, lost DR backlinks, CWV red, index bloat; auto open alert  
3. **“תור סוכנים”** — task states: queued → working → blocked → verified with who/what evidence  
4. **“קרדיטים API”** — daily budget gauges (Ahrefs rows left etc.) before batch pull  
5. **“דו"ח שבועי אוטומטי”** — PDF/HTML/live URL (agency report standard) per portfolio or per client  
6. **“השוואת תחרות”** — SERP overlap from DataForSEO  
7. **“חיבור ל-CRM העסקי”** — Asana project per domain or section “SEO Ops”  
8. **“מפת אתרים מאוחדת”** — toggle viewing the domain in SEO Dashboard / Agentic OS / WP monitor  

---

## 8) Immediate recommended actions (when you say go)

1. Copy missing env keys onto **`seo-dashboard-work` Production** from tested secrets (not from memory of chat password alone for long term)  
2. Redeploy work project  
3. Re-check `/api/status` until providers ≠ `Not configured`  
4. Optionally mark/archive non-domain Vercel twin to avoid alias confusion  
5. Seed first real snapshots for top 5 priority domains  
6. Do **not** write to wtp Supabase for this product  

---

## 9) Evidence recap (raw facts)

- Live login with provided credentials: **OK**  
- Projects returned after login: **39**, `source=supabase`  
- Supabase domain count content-range: `0-38/39` on **sunru**  
- Live provider status: **all not configured**  
- Vercel work env key count (API): **2** (Supabase only)  
- Vercel shadow env key count: **16** (full stack)  
- Code HEAD on origin main: `78531de`  
- Local path: `/root/seo-dashboard`  

---

## 10) Out of scope / don’t do

- Don’t “fix UI mock data” further while API keys are dead — dress-up without truth  
- Don’t create another parallel domains table outside sunru without a merge plan  
- Don’t assume `seo-dashboard` Vercel project is production because of the name  
- Don’t run background cron automation unless user explicitly re-enables (crons paused policy)

---

**End state target:** an agent-readable, console-operable portfolio OS where every card is backed by a snapshot row, every red item has a task, and providers are ticks-not-fiction on `/api/status`.
