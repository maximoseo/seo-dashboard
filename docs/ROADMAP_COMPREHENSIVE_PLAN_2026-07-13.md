# SEO Dashboard — Comprehensive Upgrade Plan (Plan Only)

**Date:** 2026-07-13  
**Live:** https://seo-dashboard.maximo-seo.ai  
**Status:** PLAN ONLY — no implementation until approved  
**Audit method:** Live authenticated smoke + code map + competitor feature mediums

---

## 1. Current health (verified live)

| Check | Result |
|---|---|
| Login | ✅ 200 with stored operator credentials |
| Provider keys (status) | ✅ Ahrefs, SEMrush, DataForSEO, PageSpeed, GTmetrix, SE Ranking, Exa, Browserless configured |
| Spine | ✅ Supabase anon + service role, Todo bridge, Asana bridge |
| Portfolio | ✅ 39 active projects, avg health 84, synced 39, stale 0 |
| Command Center KPIs | ✅ openAlerts 97 · openTasks 199 |
| Multi-source modules (nyg.co.il) | ✅ Overview / Keywords / Competitors return real SEMrush + Ahrefs (+ DFS) data |
| SE Ranking deep competitors | ⚠️ Key present; endpoint returns HTTP 403 on research competitors |
| Thorbit | ❌ Not configured |
| Modules `local-seo` + `geo-ai` | Marked **planned** (UI skeletons only) |
| Reports preview body | Strict schema (`sections[]` required); UI has own path |

### Module spine (project `nyg.co.il`)

| Module | State | Notes |
|---|---|---|
| overview | live | Multi-provider bag (Ahrefs + SEMrush + DFS + …) |
| keywords | cached/live | Real SEMrush organic keywords returning |
| backlinks | cached | Multi-provider |
| pages | cached | Strong demo fallback risk in UI |
| vitals | cached | PSI + Browserless |
| alerts | live | Rules-engine + durable spine |
| competitors | cached/live | SEMrush competitors returning; DFS/Exa optional |
| content | cached | Exa + optional Thorbit |
| **local-seo** | **planned** | Gap |
| **geo-ai** | **planned** | Gap |
| tasks | live | Rules → task briefs + Asana/Todo bridges |
| reports | live | Markdown/export surface |
| settings | live | Provider status |

---

## 2. What works well today (keep)

1. **Operator Command Center** — portfolio health, worst sites, hottest alerts, sync + export.
2. **Durable Supabase spine** — domains, snapshots, alerts, tasks (not purely client-only).
3. **Multi-provider aggregation pattern** — Ahrefs / SEMrush / DataForSEO / SE Ranking / Exa / PSI.
4. **Auth + portfolio roster** — 39 live Webs clients in active spine.
5. **Task generation from alerts** + soft bridges to To-Do / Asana.
6. **Ops runbook** already present (`docs/OPS_RUNBOOK.md`).

This is already stronger than a pure Looker Studio template stack for an internal agency OS.

---

## 3. Competitor benchmark (2026 agency reporting mediums)

### Primary competitors / mediums

| Product | Role | Differentiator vs Maximo SEO Dashboard |
|---|---|---|
| **AgencyAnalytics** | All-in-one agency reporting | White-label, client logins, automated monthly PDF email, 80+ natively-normalized widgets, native rank tracking |
| **DashThis / Whatagraph** | Pretty multi-channel reports | Fast branded decks; weaker SEO depth / less operator workflow |
| **SE Ranking / SEMrush / Ahrefs native reports** | Research + light reporting | Deep SEO, not multi-client operator OS |
| **Looker Studio templates** (DataBloo etc.) | Free/custom BI | Flexible but fragile connectors; no agent/tasks OS |
| **WorkDuo / GEO tools** | AI Overview / LLM visibility | Emerging GEO reporting competitors lack |
| **Raven Tools** | Classic white-label SEO suite | Mature rank + audit + PDF; dated UX |

### Feature themes competitors win on (and we don't fully have yet)

1. **Client-facing white-label portal** (domain, logo, limited SSO)
2. **Scheduled automated client PDFs/emails**
3. **First-party GSC + GA4 as ground truth** (not only third-party SEMrush/Ahrefs)
4. **Native daily rank tracking** (owned tracker, not only provider pull-on-demand)
5. **Keyword gap / content gap boards** ready for client narratives
6. **Local SEO (GBP / reviews / NAP / geo-grid)**
7. **GEO / AI Overview / LLM citation tracking**
8. **Anomaly detection + narrative AI summaries** in reports
9. **Clean normalized metrics models** (not raw multi-source bags in UI)
10. **Multi-user roles** (owner / operator / client-viewer)

### Where Maximo already differentiates (lean into)

- Agentic OS bridges (tasks → Asana/Todo, future implementation loops)
- Multi-provider truth comparison (Ahrefs vs SEMrush vs DFS) in one pane
- Internal agency portfolio Ops (Command Center) over pure client vanity dashboards
- Hebrew/RTL agency workflow fit + Webs client roster

**Strategic positioning:**  
**Internal Agentic SEO Operating System for the agency** first; optional client portal later.  
Do **not** try to become a full AgencyAnalytics clone in one sprint.

---

## 4. Gap analysis (prioritized)

### P0 — Reliability / data integrity (must before more features)

| Gap | Evidence | Why it matters |
|---|---|---|
| Aggregated endpoints return **raw multi-source bags** | `/api/keywords|backlinks|competitors/aggregated` | UI normalizers are brittle; empty tables when schema drifts |
| Market hardcoded **US / English** in many provider calls | server index (location_code 2840, database `us`) | Israeli clients (`.co.il`) get wrong SERP/volume context |
| SE Ranking research endpoint 403 | live probe | Dead pathname if UI relies on SE Ranking-only strips |
| Module state often **cached/hash-seed** not snapshot-driven | `projectSummary.ts` stableScore/hash fallbacks | Health may look real when not |
| Cache stats near-empty at runtime | `/api/status` cacheStats zeros | Expensive live provider pulls every refresh |
| Provider “ok:true latency:0” may be config-only not live ping | status shape | False confidence until real call |
| Pages / Content still demo-prone paths | `PagesPage` demo array | Operator risk showing fake inventory |

### P1 — Operator value (internal agency OS)

| Add / fix | Outcome |
|---|---|
| Unified metric model + adapters per provider | One Keywords table: keyword, pos, Δ, volume, URL, traffic, source of truth |
| Market selector (IL / US / other) per project | Correct local SERPs + volumes |
| Snapshot history charts (90d traffic, DR, KW count, health) | Trend stories clients need |
| Keyword movements watchlist (↑↓ lost/new) | Weekly ops review |
| Competitor gap matrix (shared KW, content gaps, RD gaps) | Sales + retention narratives |
| Alert→Task SLA board (age, owner, next action) | Less open-task pileup (199 open) |
| Report builder from real spine only (no empty sections) | Client-ready markdown/PDF |
| Data freshness badges everywhere lastFetched + source | Trust |

### P2 — Productization (client-ready)

| Feature | Competitor medium |
|---|---|
| Scheduled client report email (Hebrew RTL PDF) | AgencyAnalytics automation |
| Client viewer role (read-only share link per project) | Client portal |
| GSC + GA4 connectors (OAuth, first-party) | Looker / AgencyAnalytics |
| Local SEO (GBP, reviews velocity, NAP, geo-pack) | Local reporting tools |
| GEO / AI visibility layer (ChatGPT / AI Overviews / Gemini citations) | WorkDuo-class tools |
| AI executive summary (Hebrew) at top of every report | AA AI summaries |
| Anomaly detection (traffic/rank/backlink sudden drops) | AA anomaly |

### P3 — Scale / polish

| Item |
|---|
| Multi-user RBAC (Maximo operator roles) |
| White-label domain for optional client hub |
| Billing usage controls per provider (quota guardrails) |
| Batch nightly portfolio sync cron + digest email to `tomer@webs.co.il` |
| Agentic deep links: create Todo / Asana from any keyword gap row |

---

## 5. Recommended roadmap (phased, no guns blazing)

### Phase A — Data foundation (1–2 sprints, highest ROI)

**Goal:** Reliable, Israel-aware, normalized data — not more empty pages.

1. **Normalized SEO model**
   - `KeywordRow`, `BacklinkStat`, `CompetitorRow`, `VitalSnapshot`, `TrafficSnapshot`
   - Provider adapters → model; UI consumes only model
2. **Market / location per project**
   - default IL for `.co.il`; override in Settings
3. **Persist expensive pulls into `seo_snapshots`**
   - Read-through cache; live pull only on stale or Force Refresh
4. **Fix SE Ranking 403 path** or feature-flag off until key/scope rights work
5. **Kill demo fallbacks** in production for pages/content when API fails (clear empty + CTA)

**Exit criteria:** Any project module either shows real rows + source badges **or** honest empty state — never seeded fake metrics in prod.

### Phase B — Operator intelligence (1–2 sprints)

1. Command Center v2:
   - stale dict vs open tasks aging
   - recommended weekly actions top-10 portfolio
2. Competitor workspace:
   - top 5 competitors pinned per project
   - keyword gap table (they rank 1–10, we rank 11–30 / missing)
3. Movements board:
   - weekly KW gain/loss, traffic delta, new/lost RD
4. Health score formula documented + transparent breakdown (no hash seeds for durable projects)

### Phase C — Client narrative & automation

1. Report templates: Monthly, Rescue, Pitch
2. Hebrew RTL PDF + email to client or to `tomer@webs.co.il` first
3. AI summary (what changed + 3 recommended actions)
4. Shareable read-only project link (token TTL)

### Phase D — Local + GEO expansion

1. **Local SEO** module (exit `planned`): GBP metrics, reviews, categories, posts status if API available; else crawl NAP checks + maps packaging
2. **GEO / AI** module: track branded + non-branded prompt visibility (manual seed → vendor API when productive)
3. Attach GEO findings into reports as a first-class section

### Phase E — Multi-user & white-label (only if needed commercially)

1. Staff roles
2. Optional client login
3. Branding package (logo, colors, domain)

---

## 6. Explicit “do NOT do next” list

- ❌ Mass new UI modules before normalization (adds more brittle pages)
- ❌ Full AgencyAnalytics feature parity sprint
- ❌ Client portal before report quality is stable
- ❌ Live multi-provider hits on every page refresh for 39 domains (quota burn)
- ❌ Swarming Local + GEO simultaneously without adapters ready
- ❌ Demoing seed/hash metrics as if they are live provider data

---

## 7. Immediate quick wins (if/when execution is approved)

Small, safe diffs with high operator value:

1. **Market IL default** for `.co.il` domains in SEMrush/DataForSEO calls
2. **Force-refresh + lastFetched** visible on Keywords / Competitors / Backlinks
3. **Honest empty states** + hide demo arrays when `import.meta.env.PROD`
4. **SE Ranking competitor** soft-degrade banner when 403 instead of silent empty
5. **Reports validation UX** — schema-aligned body (sections) or UI error humanized
6. **Command Center “close/snooze task”** loops to shrink 199 open tasks
7. Nightly cron: `/api/sync` limited batch + digest to tomer@webs.co.il

---

## 8. Success metrics for the program

| Metric | Baseline (2026-07-13) | Target after Phase A–B |
|---|---|---|
| Projects with live multi-source keyword rows | Mixed | ≥ 90% active |
| Stale portfolio sites | 0 synced form | maintain; lastFetched < 7d |
| Open tasks without owner/age | 199 | < 80 actionable or archived |
| Provider product calls / day | high on-demand | −50% via snapshot read-through |
| Operator trust (self-report) | fragile mixed states | clear live/cached/unavailable only |
| Time to produce monthly client packet | manual | < 10 min generative from project |

---

## 9. Execution gates (for when user says “execute”)

1. Confirm which **Phase** to start (recommend **A**).
2. Confirm **Israel-first** market defaults.
3. Confirm safeties: Golden Rule — no production client site edits from this dashboard work.
4. Implement → CI/E2E green → Vercel READY → smoke operator login → document before/after.
5. Only then expand Phase B.

---

## 10. One-line recommendation

**Keep Command Center + multi-provider architecture; next stop is data normalization + IL market correctness + snapshot caching — then competitor gaps and client report automation. Hold `local-seo` / `geo-ai` product depth until the spine feeds them real, durable data.**

---

*Plan only. No code/features shipped in this artifact.*
