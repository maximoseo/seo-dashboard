# PLAN — seo-dashboard (SEO Pro Dashboard)

- **URL:** https://seo-dashboard.maximo-seo.ai
- **GitHub:** maximoseo/seo-dashboard · Vercel project: seo-dashboard-work
- **Category:** SEO
- **Status:** live · HTTP 200 "SEO Pro Dashboard" (~1.2KB shell)
- **Purpose:** Unified SEO suite — rank tracking, technical audits, client onboarding, reporting, monitoring, GA, Search Console.

## 1. Snapshot
The flagship SEO product surface. Thin shell today; the plan is to make it the single pane where rankings, audits, and traffic tie to revenue/leads — not vanity charts.

## 2. Code Improvements
- **Data connectors as jobs**: GA4, Search Console, SE Ranking/DataForSEO pulled on schedule into Supabase (single source, cached, rate-limited via Doppler tokens).
- **Audit engine**: crawl → issues → severity, stored with historical diffs (regressions vs fixes).
- **Add `/api/health`** + connector-status endpoint (which client feeds are stale/broken).
- **Multi-tenant RLS** so each client's SEO data is isolated.
- Contract tests for each connector's response mapping.

## 3. Design Improvements
- Client switcher → Overview (rank, traffic, conversions) → Audits → Reports.
- Rank table with SERP feature flags, intent, and Δ vs last period.
- Audit view grouped by severity with "fixed since last crawl" deltas.
- White-label report builder (logo, sections, export PDF).

## 4. Real Results (not filler)
- **Rankings tied to clicks/impressions** from Search Console (not just position).
- **Traffic → conversions/leads** via GA4 (business outcome, not sessions alone).
- **Audit fix impact**: correlate resolved technical issues with ranking/traffic movement.
- **Share of voice** vs tracked competitors per keyword group.

## 5. Tool Integrations
- **Google Search Console + GA4** (gws CLI available).
- **SE Ranking + DataForSEO** (MCPs configured) for rank + SERP.
- **GTmetrix / Lighthouse** for CWV in audits.
- **Supabase** store + RLS, **n8n** schedulers, **Telegram/email** report delivery.

## 6. New Features
- **Automated weekly client reports** (branded PDF) emailed on schedule.
- **Anomaly alerts**: sudden ranking/traffic drops → Telegram.
- **Opportunity finder**: keywords ranking 4–15 (striking-distance) with effort estimate.
- **Content brief generator** from target keyword + SERP analysis.

## 7. Priority Order
1. GA4 + Search Console + one rank source wired into Supabase + `/api/health`.
2. Audit engine with historical diffs.
3. Outcome metrics (clicks, conversions, fix-impact).
4. Automated branded reports + anomaly alerts.
5. Striking-distance finder + brief generator.
