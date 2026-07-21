# seo-dashboard — Features 5–9 Implementation Report
**Date:** 2026-07-21 · **Project:** seo-dashboard-work (Vercel) · **Repo:** maximoseo/seo-dashboard (main)

Production: https://seo-dashboard.maximo-seo.ai

---

## Feature 5 — Share of Voice ✅ (verified live earlier)
- CTR-weighted visibility share vs competitors, per domain
- Live: nyg.co.il **3.5%** (visibility 329) vs madlan 38.3% / ynet 36.4% / yad2 21.7%

## Feature 6 — Anomaly alerts ✅
- MAD-based z-score on snapshot metrics + keyword position series (no GSC/GA integration — statistical on existing snapshots)
- Server: `server/alerts/anomaly.ts` + endpoint `/api/alerts/aggregated` (returns `anomalies[]`); UI section in AlertsPage
- Live: alerts 2, anomalies 0 (legit — history still short; will populate as snapshots accumulate)

## Feature 7 — White-label scheduled reports ✅
- JSONB-backed schedules in `seo_snapshots` (provider=report_schedules) — no DDL (Management API blocked 1010)
- White-label render: brandName + brandColor header/footer; Resend email (verified maximo-seo.com)
- CRUD + send-now endpoints; hourly cron `/api/cron/report-schedules` (+ piggyback on nightly-sync); ReportsPage schedule manager UI
- **Verified delivered:** from `Maximo SEO <reports@maximo-seo.com>` → service@maximo-seo.com, `last_event: delivered`
- Resend key set on seo-dashboard-work + Doppler cloud (agents/prd) + local file

## Feature 8 — SERP feature tracking ✅
- Adapter populates `serpFeatures` from DataForSEO `serp_item_types` (ai_overview, local_pack, map, google_reviews, knowledge_graph, video, short_videos, images, people_also_ask/search…)
- `computeSerpFeatureStats` with snapshot-delta; KeywordsPage features card + per-keyword badges
- Live: **15 features, 37.9% coverage** (50/132 keywords)

## Feature 9 — Cannibalization detector ✅
- **Critical fix:** detector ran on merged rows (mergeKeywordRows keeps 1 URL/keyword → could never fire). Now runs on pre-merge source rows
- Severity: high (2+ URLs page 1 / 3+ page 2), medium, low; per-URL positions in tab
- Live: **3 real clusters** — "herzliya pituach" (high, 2 URLs), "park bavli tel aviv" (high), "herzliya pituach israel" (medium)

---

## Infrastructure fixes shipped with this batch
- **Routing:** Vercel FS routing in this project matches ONLY single-segment paths → moved `:id` to request body (`schedules-update/delete/send`, `share?id=`) and added nested catch-alls. Also fixed pre-existing `/api/reports/share/:id` 404.
- **Share persistence:** shares moved from in-memory Map → Supabase `seo_snapshots` (provider=report_share, TTL 7d) — survive cold starts/deploys.
- **Project correction:** production = **seo-dashboard-work** (auto-deploys from git push). Manual API deployments to `seo-dashboard` were redundant.
- Temp env-check diagnostic removed.

## Verification summary (all live on production)
| Feature | Status | Evidence |
|---|---|---|
| 5 SOV | ✅ | ourSov 3.5%, 4 competitor rows |
| 6 Anomaly | ✅ | endpoint + UI; 0 anomalies (short history) |
| 7 Reports | ✅ | Resend delivered ×2 (both keys) |
| 8 SERP feat | ✅ | 15 features, 37.9% coverage |
| 9 Cannibal | ✅ | 3 clusters, severity + per-URL pos |
