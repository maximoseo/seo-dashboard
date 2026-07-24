# SEO Dashboard — Audit & Improvement Plan

**Live:** https://seo-dashboard.maximo-seo.ai · **Repo:** maximoseo/seo-dashboard (`main`) · **Host:** Vercel project `seo-dashboard-work` · **DB:** Supabase `sunrupuwvpalipiuebcv`
**Audited:** 2026-07-23 · Evidence: code (local clone), live HTTP probes, Vercel API, Supabase advisors + `list_tables`, in-repo screenshots.

---

## 1. Executive Summary

The dashboard is a **Vite + React + TypeScript (Tailwind) SPA** with an **Express API** (deployed as Vercel serverless functions) on a **Supabase** Postgres backend, wired to 8 SEO providers (Ahrefs, Semrush, DataForSEO, SE Ranking, Exa, Browserless, GTmetrix, PageSpeed).

**Top findings, highest impact first:**

1. **🔴 P0 — Production deploys were broken (FIXED, PR #6).** `main` @ `40abf08` failed `npm run build:frontend` (a Next.js file `src/pages/api/alert.ts` + server-only `src/lib/telegram-alert.ts` dropped into a Vite app). Every prod deploy since errored; the live site was frozen on an older build. Quarantined the dead files from the frontend tsc — build now exits 0. **Merge PR #6 to restore deploys.**
2. **🔴 P1 — Database is exposed below the app auth.** The Express API correctly returns **401 on all 68 data routes** unauthenticated (strong). But the **Supabase anon key is public in the frontend bundle**, and the DB has **19 tables with RLS disabled** (incl. `admin_users`, `aiv_login_attempts`, `seo_findings`, `dashboard_suggestions` = 1,222 rows) plus **29 `rls_policy_always_true` policies**. Supabase's own advisor: *"anyone with the anon key can read or modify every row."* This lets an attacker bypass the login entirely and query Postgres directly. **This is the #1 real security hole.**
3. **🟠 P2 — The design reads as empty and unfinished.** The dashboard shows a huge dark void with only 2 faded cards, a **correctness bug (SEO Health "0/100" labeled "Excellent")**, stale hard-coded 2024 dates, low text contrast, and no populated charts/tables. It needs a proper design system, data density, and empty/loading/error states.
4. **🟡 P3 — Code & delivery hygiene.** `server/index.ts` is a ~5,000-line monolith; `npm run lint` has 20 pre-existing errors; large JS bundles (`index` 390 KB, `BacklinksPage` 356 KB, no route-level code-split); repo is **public**.

Good news: **no secrets are committed** (env.example is blank), auth is cookie-based and enforced at the API, and the seo-dashboard's own tables (`seo_*`, `dashboard_auth_*`) do have RLS enabled.

---

## 2. Access Check Results

| Item | Status | Notes |
|---|---|---|
| Vercel | ✅ | Domain served by project **`seo-dashboard-work`** (not `seo-dashboard`). Token works; deployments/logs/settings visible. **Last prod deploy = ERROR** (build). |
| GitHub | ✅ | `maximoseo/seo-dashboard`, default branch `main`, **PUBLIC**. Read confirmed. |
| Stack | ✅ | Vite + React 19 + TS + Tailwind; Express 4; Vitest + Playwright. 27 prod / 10 dev deps. |
| Supabase | ✅ | Project `sunrupuwvpalipiuebcv`; schema, RLS state, and security advisor all readable via management token. (Shared "central" DB — ~140 tables across several apps.) |
| Live login (browse authed screens) | 🔴 **Missing** | No credentials provided. Design audit below is based on the **7 screenshots already in the repo** + the live dashboard capture. Provide a login (or temp read-only user) to screenshot every authed screen for pixel-level redesign. |

---

## 3. Current State

**Architecture**
- **Frontend:** `src/` — React SPA, pages in `src/pages/*Page.tsx` (Dashboard, Keywords, Backlinks, Pages, Vitals, Alerts, Competitors, Content, Reports, Settings, LocalSEO, GeoAI, SiteAudit, Tasks, CommandCenter, Clients + per-project workspace). Dark theme, sidebar nav, brand "SEOPro".
- **API:** `server/` (Express, modularized: providers, projects, reports, tasks, alerts, integrations, markets) compiled and exposed through `api/` Vercel serverless wrappers (`api/[...path].ts` catch-all).
- **Auth:** cookie session `maximo_dashboard_session`; `requireAuth` returns 401 without a session; `dashboard_auth_users` table (bcrypt) + `dashboard_auth_audit`. `AUTH_DISABLED` exists but is **local-dev only** and confirmed **off in prod** (live probes return 401).
- **Data:** Supabase (`seo_clients` 42, `seo_domains` 39, `seo_snapshots` 1,046, `seo_alerts`, `seo_tasks` …) + provider APIs; nightly cron sync (`/api/cron/nightly-sync`), snapshot job in `scripts/`.

**What already works well**
- API authorization is consistent (401 everywhere, one shared guard).
- Provider layer degrades softly when a key is missing (503 with clear message).
- Clean env hygiene (no committed secrets), typed provider adapters, real tests + Playwright e2e, white-label report templates (EN/HE, RTL-aware).

---

## 4. Design Upgrade Plan (Priority #1)

### Evidence (current problems)
From the live dashboard capture + repo screenshots:
- **Empty-state failure:** ~80% of the dashboard is blank dark space; only "SEO Health" + "Organic Traffic" render. No graceful empty/skeleton state — it looks broken, not "no data yet".
- **Correctness bug in a headline metric:** Health score shows **`0 /100` with the label "Excellent"** (`src/components/SEOHealthScore.tsx`). A zero/undefined score must not read "Excellent".
- **Stale/hard-coded data:** date range "May 1 – Oct 31, 2024"; "+7 points vs Apr 2024" — looks like placeholder/demo data on a live screen.
- **Low contrast & weak hierarchy:** faded card text on near-black; ghosted sparklines barely visible; headline numbers and labels compete.
- **Low data density:** a professional SEO dashboard should surface rankings, traffic trend, top movers, alerts, and vitals above the fold — currently 2 tiles.
- **No visible loading/error states**, unclear mobile behavior, unknown a11y (contrast/keyboard) — to be verified per screen once login is provided.

### Recommended direction (1 of 3, recommended)
**Direction A — "Refined dark analytics" (recommended).** Keep the dark theme (fits an ops/SEO tool), but fix contrast, spacing, and density with a real token system. Pros: least disruption, on-brand, fast. Cons: still dark (some clients prefer light for reports).
**Direction B — Light "report-grade" theme** with a dark toggle. Pros: better for client-facing/printed reports, higher legibility. Cons: larger effort.
**Direction C — Dual-theme design system from day one.** Pros: future-proof, client + operator modes. Cons: most effort.
→ **Recommend A now, structured so B/C are a token flip later.**

### Concrete system
- **Tokens (CSS variables + Tailwind theme):** define `--bg`, `--surface`, `--surface-2`, `--border`, `--fg`, `--fg-muted`, accent, and 5 semantic status colors (critical/error/warning/info/success — already implied by the alert module). Fix all contrast to WCAG AA (≥4.5:1 body, ≥3:1 large).
- **Typography:** one scale (e.g. 12/14/16/20/24/32), one sans (Inter is fine) — enforce via `theme-factory`/`typography-scale`. Kill the faded low-contrast muted text.
- **Spacing:** 4px base grid; consistent card padding; a responsive 12-col dashboard grid instead of two floating tiles.
- **Components (Tailwind + shadcn/ui):** standard `Card`, `StatTile` (value + delta + sparkline), `DataTable` (sortable, sticky header), `Chart` wrapper (consistent axis/tooltip/colors), `EmptyState`, `Skeleton`, `ErrorState`, `Badge`.
- **Charts:** one library, one style — muted grid, single accent series, readable axes, tooltips; no ghost lines.
- **States:** every data surface must implement loading (skeleton) → empty ("connect a project / no data for range") → error (retry) → populated.
- **Layout:** dashboard above-the-fold = Health, Traffic trend, Top movers (up/down keywords), Open alerts, Core Web Vitals summary. Real date-range picker bound to data (no hard-coded 2024).
- **RTL/Hebrew:** the report layer is already RTL-aware; extend `dir` support to the app shell for Hebrew clients.

### Screen-by-screen (high level; refine after authed screenshots)
Dashboard (density + states + health bug), Keywords (sortable table + trend), Backlinks (split the 356 KB page, table + referring-domains chart), Vitals (LCP/INP/CLS gauges with thresholds), Alerts (severity-grouped list), Reports (already strong — align styling), Settings/Clients (form design pass).

---

## 5. Authentication Hardening Plan (Priority #2)

### Coverage test results (evidence)
- **Pages:** `/`, `/dashboard`, `/keywords`, `/backlinks`, `/alerts`, `/vitals`, `/settings`, `/reports` → all `200` (SPA shell). **Acceptable** because they contain no data — all data is fetched from the API.
- **API:** **all 68 `/api/*` data routes → `401`** unauthenticated. Only intentional public endpoints respond: `/api/health` (status only), `/api/auth/login` (serves the SPA), `/api/reports/share` (token-gated share links, 404 without a valid token). **No exposed data route found at the API layer.** ✅

### The real gap — database layer
Security must not rely on the app. Supabase security advisor (20 ERROR / 55 WARN / 41 INFO):
- **19 tables with RLS disabled** in `public` — fully readable/writable by the **anon** role: `admin_users`, `aiv_login_attempts`, `alert_history`, `seo_findings`, `crawl_pages`, `dashboard_suggestions` (1,222 rows), `audit_jobs`, `report_archive`, `aiv_engines`, `aiv_seo_context`, `sync_metrics`, `si_monitors`, `si_monitor_checks`, `si_monitor_alerts`, `repo_collections`, `repo_collection_items`, `uptime_daily`, `checks`, `incidents`.
- **29 `rls_policy_always_true`** policies — RLS on but `USING (true)` = effectively public.
- **41 `rls_enabled_no_policy`**, **15 `function_search_path_mutable`**, **10 SECURITY DEFINER functions executable by anon/authenticated**.
- The **anon key + Supabase URL are shipped in the frontend bundle** (normal for Supabase), so anyone can hit these directly, bypassing the Express login.

### Hardening steps (prioritized)
1. **Enable RLS on the 19 exposed tables** and add correct policies (owner/workspace-scoped, or "service_role only" for server-owned tables). *Do not blind-enable* — enabling without a policy blocks access; each table needs the right policy. SQL is staged in GOALS; **you approve/run**.
2. **Replace `always_true` policies** with scoped conditions (`auth.uid()` / workspace membership / service-role-only).
3. **Lock down SECURITY DEFINER functions**: `REVOKE EXECUTE ... FROM anon, authenticated` where not needed; set `search_path`.
4. **Merge the already-open hardening PRs** #3–#5 (CSRF guard, SSRF guard, login rate-limit by account+IP, security headers, structured-log redaction, report XSS lock) — currently unmerged on `main`.
5. **Session hardening:** confirm the session cookie is `HttpOnly; Secure; SameSite=Lax`, short TTL + refresh, logout invalidation.
6. **Login endpoint:** rate-limit + generic error messages (no user-enumeration); confirm password reset flow exists (none found — add or document).
7. **Make the repo private** (or verify nothing sensitive is inferable); rotate the Supabase anon key if it was ever paired with permissive policies.

---

## 6. Other Findings & Recommendations

| # | Finding | Why it matters | Fix | Effort | Priority |
|---|---|---|---|---|---|
| 1 | Prod build broken on `main` | No deploys ship | PR #6 (done) — **merge** | S | **High** |
| 2 | 19 RLS-off tables + 29 always-true policies | DB bypass of app auth | Enable RLS + policies (§5) | M | **High** |
| 3 | Health score "0 = Excellent" | Wrong headline metric erodes trust | Fix rating bands in `SEOHealthScore.tsx` | S | High |
| 4 | Empty/placeholder dashboard, stale 2024 dates | Looks broken to clients | Empty/loading states + bind date range to data | M | High |
| 5 | Design system absent (contrast, density, tokens) | Core of priority #1 | §4 | L | High |
| 6 | Unmerged security PRs #3–#5 | Hardening already written, not live | Merge after re-verify | S | High |
| 7 | `npm run lint`: 20 errors (`no-undef` ×11, `no-unused-vars` ×9, `no-control-regex` ×6…) | CI/quality, hides real bugs | Clean lint, add to CI gate | M | Med |
| 8 | `server/index.ts` ~5,000 lines | Hard to maintain/review | Split by domain (routers already exist under `server/`) | L | Med |
| 9 | Bundles: `index` 390 KB, `BacklinksPage` 356 KB | Slow first load | Route-level `lazy()` + manualChunks | M | Med |
| 10 | Repo is public | Exposure of internal logic | Make private | S | Med |
| 11 | No password-reset flow found | Account recovery/lockout | Add reset or SSO | M | Med |
| 12 | Data freshness/timezone unverified | Correct SEO metrics | Show "last synced" + tz-aware ranges | M | Med |
| 13 | Features: ranking/traffic-drop alerts, scheduled email reports, GSC integration, client share views, date-range compare | Product value | Prioritize after P0–P2 (alerts + share views partly exist) | L | Low→Med |

---

## 7. Roadmap (phased)

- **Phase A — Unblock & secure (now):** merge PR #6 (deploys) → enable RLS + fix always-true policies (§5.1–5.3, user-approved SQL) → merge security PRs #3–#5.
- **Phase B — Design upgrade:** design tokens + component primitives → dashboard redesign (states, density, health-bug, live date range) → screen-by-screen pass (needs authed screenshots).
- **Phase C — Quality & perf:** lint to zero + CI gate → route code-split → split `server/index.ts` → make repo private.
- **Phase D — Features:** drop alerts, scheduled email reports, GSC, share views, date-range compare.

---

## 8. Open Questions

1. **Login credentials** for the live app (or a temp read-only user) — needed to screenshot every authed screen for the redesign.
2. The Supabase project is **shared** across several dashboards (`yt_*`, `aiv_*`, `si_*`, `ao_*`, `repo_*`, `content_pages` …). For the RLS fixes — do you want me to scope **only** seo-dashboard-related tables, or harden the whole shared DB?
3. Design direction — confirm **A (refined dark)** vs B/C.
4. Make the repo **private**? (recommended)
5. Password reset — add in-app, or rely on SSO / manual admin reset?
