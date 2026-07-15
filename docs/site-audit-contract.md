# Site Audit API contract (snapshot)

**Date:** 2026-07-15  
**Route:** `GET /api/site-audit/aggregated`  
**Auth:** Cookie `maximo_dashboard_session` (dashboard operator)

## Query params

| Name | Required | Notes |
|------|----------|-------|
| `domain` | yes | Raw or host — server canonicalizes |
| `market` | no | Project market pack |
| `refresh` | no | `1` / `true` forces live crawl (expensive) |
| `max_pages` | no | Default **20**, clamped **5–50** |

## Response (additive / soft-degrade)

```ts
{
  domain: string
  market?: string
  canonicalDomain?: string
  sources: Record<string, unknown>
  activeSources: string[]
  softDegraded: string[]
  summary: {
    pagesCrawled: number
    issuesTotal: number
    errors: number
    warnings: number
    notices: number
    onpageScore: number | null
    lighthouseSeo: number | null
    performanceMobile: number | null
    brokenBacklinks: number | null
    brokenPages?: number | null
  }
  issues: Array<{
    id: string
    severity: 'error' | 'warning' | 'notice'
    category: string
    title: string
    detail?: string
    url?: string
    source: string
  }>
  pages: Array<{
    url: string
    status: number
    title?: string
    description?: string
    h1?: string
    wordCount?: number
    loadTime?: number
    size?: number
    onpageScore?: number | null
    issues?: string[]
    source?: string
  }>
  dataState: 'live' | 'cached' | 'unavailable'
  fetchedAt: string
  fromSnapshot?: boolean
}
```

## Honesty rules

1. Soft-degraded providers must appear in `softDegraded` — never treat partial as “perfect”.  
2. Health score on the FE is **null** when `pagesCrawled === 0` and both onpage + lighthouse scores are null.  
3. “0 pages crawled ≠ perfect site” is rendered explicitly in the UI.  
4. Snapshot key: `site_audit_agg` via existing `loadSnapshotPayload` / `persistSnapshot`.

## Phase 1 FE (2026-07-15)

- Health score (null-safe)  
- Max-pages control with confirm at 50  
- Status line during crawl  
- Issue Why/Fix/Validate drawer  
- Pages: cards on mobile, table desktop  
- Client CSV export for issues + pages  

**Not in Phase 1:** async task queue, history/compare, create-tasks, schedule.
