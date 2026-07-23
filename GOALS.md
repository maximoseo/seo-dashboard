# GOALS — SEO Dashboard Improvement Loop

Ordered by the roadmap. Each goal has a checkbox, a one-line description, a **Verify** method Claude can actually run/show, and constraints. Do not check a box without passing evidence. Security-sensitive DB changes require explicit owner approval before running.

Global exit condition (`/goal`): every box checked · `npm run build` exits 0 · `npm run lint` clean · every protected page/API route returns 401 or redirects to `/login` for unauthenticated requests.

---

## Phase A — Unblock & Secure (highest priority)

- [x] **A1. Fix the broken production build.** Quarantine misplaced Next.js alert files from the Vite tsc.
  - **Verify:** `npm run build:frontend` exits 0 AND `npm run build` exits 0. → **DONE (PR #6, b5fe395):** both exit 0; 46 tests pass.
  - **Constraint:** no runtime behavior change; no file deletion.

- [ ] **A2. Merge PR #6 and confirm a green Vercel prod deploy.**
  - **Verify:** Vercel latest `main` deployment `state = READY`; `curl -sI https://seo-dashboard.maximo-seo.ai/login` → 200.
  - **Constraint:** owner merges (deploys to prod).

- [ ] **A3. Enable RLS on the 19 exposed tables (owner-approved SQL).**
  - **Verify:** Supabase `get_advisors(security)` returns **0** `rls_disabled_in_public` findings; `list_tables` shows `rls_enabled:true` for all 19.
  - **Constraint:** DO NOT run without owner approval and a policy per table (enabling RLS with no policy blocks access). Confirm scope first (seo-dashboard tables only vs whole shared DB — Open Q #2).

- [ ] **A4. Replace `rls_policy_always_true` policies (29) with scoped conditions.**
  - **Verify:** `get_advisors(security)` returns 0 `rls_policy_always_true`; a direct anon-key read of a protected table returns 0 rows / permission denied.
  - **Constraint:** owner-approved; server (service_role) access must keep working — re-run `npm test` + live 200 on an authed API call.

- [ ] **A5. Lock down SECURITY DEFINER functions + set function search_path.**
  - **Verify:** `get_advisors(security)` shows 0 `anon_security_definer_function_executable` and 0 `function_search_path_mutable`.
  - **Constraint:** owner-approved SQL.

- [ ] **A6. Merge/verify security PRs #3–#5 (CSRF, SSRF, login rate-limit, headers, redaction, report XSS).**
  - **Verify:** `npm test` passes with those suites; unauth `curl` to a mutating `/api/*` route without CSRF/session → 401/403; login endpoint 9th attempt in a minute → 429.
  - **Constraint:** re-verify against current `main` before merge.

- [ ] **A7. Confirm session cookie flags.**
  - **Verify:** `curl -sI` a login response shows `Set-Cookie: maximo_dashboard_session=...; HttpOnly; Secure; SameSite=Lax`.
  - **Constraint:** no change to the auth model, only flags/TTL.

---

## Phase B — Design Upgrade (priority #1)

- [ ] **B1. Design tokens + Tailwind theme (colors, type scale, spacing) at WCAG AA.**
  - **Verify:** build 0; a contrast check on body/muted text ≥ 4.5:1 (screenshot + computed values); tokens referenced (no hard-coded hex in components changed).
  - **Constraint:** no data-fetch/logic changes.

- [ ] **B2. Fix the SEO Health "0 = Excellent" bug.**
  - **Verify:** unit test: `score 0 → "Poor"/"—"`, `85 → "Excellent"`; screenshot of the card with a 0 score not labeled Excellent.
  - **Constraint:** logic-only fix in `SEOHealthScore.tsx`.

- [ ] **B3. Empty / loading / error states on every dashboard data surface.**
  - **Verify:** screenshots of one surface in each state (skeleton, empty, error, populated).
  - **Constraint:** no change to the data-sync logic.

- [ ] **B4. Bind the date-range picker to real data (remove hard-coded 2024).**
  - **Verify:** screenshot showing a live/default range; no literal "2024" strings left in the dashboard components (`grep`).

- [ ] **B5. Dashboard redesign — density + above-the-fold (Health, Traffic trend, Top movers, Alerts, Vitals).**
  - **Verify:** before/after screenshots; build 0; Lighthouse (desktop) accessibility ≥ 90.
  - **Constraint:** reuse existing API endpoints; no new data contracts without a note.

- [ ] **B6. Screen-by-screen pass (Keywords, Backlinks, Vitals, Alerts, Reports, Settings).** *(needs authed screenshots — Open Q #1)*
  - **Verify:** per-screen before/after screenshots; build 0.

---

## Phase C — Quality & Performance

- [ ] **C1. Lint to zero + wire into CI.**
  - **Verify:** `npm run lint` → 0 errors/0 warnings; `npm run build` 0; `npm test` passes.

- [ ] **C2. Route-level code-splitting (lazy pages, manualChunks).**
  - **Verify:** `npm run build` shows initial `index` chunk materially smaller (target < 250 KB gzipped-adjacent); no route regressions (smoke screenshots).

- [ ] **C3. Split `server/index.ts` (~5,000 lines) into the existing `server/*` routers.**
  - **Verify:** `npm run build` 0; `npm test` passes; `server/routes.contract.test.ts` still green (all routes registered).
  - **Constraint:** pure refactor — no behavior change; route list identical.

- [ ] **C4. Make the repo private.**
  - **Verify:** `gh repo view maximoseo/seo-dashboard --json visibility` → `PRIVATE`. *(owner action)*

---

## Phase D — Features (after A–C)

- [ ] **D1. Ranking/traffic-drop alerts** — **Verify:** seeded drop triggers an alert row + notification; test passes.
- [ ] **D2. Scheduled email reports** (extend existing report layer) — **Verify:** a scheduled run produces an email/log entry in a dry-run.
- [ ] **D3. Google Search Console integration** — **Verify:** GSC data appears for one property (or a clear "connect GSC" state). *(needs GSC OAuth)*
- [ ] **D4. Client-facing share views** (extend `/api/reports/share`) — **Verify:** a share token renders a read-only view; no auth bypass to the app.
- [ ] **D5. Date-range comparison** (period vs previous) — **Verify:** screenshot of deltas; unit test on the delta math.

---

### Notes / constraints (global)
- No committed secrets (keep env in Vercel/Supabase only).
- Every DB/RLS change is **owner-approved** and re-verified via Supabase advisors.
- Every code change: branch → `npm run build` 0 → `npm run lint` clean → `npm test` pass → PR (no self-merge to `main`).
