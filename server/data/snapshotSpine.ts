import type { DataState } from '../projects/projectSummary.js'
import type { SeoAlert } from '../alerts/rules.js'
import { generateAlerts } from '../alerts/rules.js'

export type SnapshotRow = {
  id?: string
  domain_id: string
  provider: string
  snapshot_date: string
  data: Record<string, unknown> | null
  fetched_at: string
}

export type ProjectOverlay = {
  healthScore: number | null
  alertCount: number
  taskCount: number
  lastFetchedAt: string | null
  connectedSources: string[]
  dataState: DataState
  metrics?: {
    organicTraffic?: number | null
    organicKeywords?: number | null
    domainRating?: number | null
    previousOrganicTraffic?: number | null
  }
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

export function extractProviderMetrics(provider: string, data: Record<string, unknown> | null | undefined) {
  if (!data) return {} as Record<string, number | null>
  const out: Record<string, number | null> = {}

  if (provider === 'overview') {
    const sources = (data.sources || {}) as Record<string, any>
    const ahrefs = sources.ahrefs || {}
    const metrics = ahrefs.metrics?.metrics || ahrefs.metrics || {}
    out.organicTraffic = num(metrics.org_traffic)
    out.organicKeywords = num(metrics.org_keywords)
    out.domainRating = num(ahrefs.domainRating?.domain_rating ?? ahrefs.domain_rating?.domain_rating)
    const sm = sources.semrush || {}
    if (out.organicTraffic == null) out.organicTraffic = num(sm['Organic Traffic'] || sm.Ot)
    if (out.organicKeywords == null) out.organicKeywords = num(sm['Organic Keywords'] || sm.Or)
  }

  if (provider === 'ahrefs') {
    const metrics = (data as any).metrics?.metrics || (data as any).metrics || {}
    out.organicTraffic = num(metrics.org_traffic)
    out.organicKeywords = num(metrics.org_keywords)
    out.domainRating = num((data as any).domainRating?.domain_rating ?? (data as any).domain_rating?.domain_rating)
  }

  if (provider === 'ahrefs-dr') {
    out.domainRating = num((data as any).domain_rating?.domain_rating ?? (data as any).domain_rating)
  }

  if (provider === 'semrush') {
    out.organicTraffic = num((data as any)['Organic Traffic'] || (data as any).Ot)
    out.organicKeywords = num((data as any)['Organic Keywords'] || (data as any).Or)
  }

  if (provider === 'alerts') {
    const alerts = Array.isArray((data as any).alerts) ? (data as any).alerts : []
    out.alertCount = alerts.length
    out.criticalAlerts = alerts.filter((a: any) => a.severity === 'critical').length
    out.warningAlerts = alerts.filter((a: any) => a.severity === 'warning').length
  }

  return out
}

export function deriveHealthScore(input: {
  status?: string
  priority?: string
  organicTraffic?: number | null
  organicKeywords?: number | null
  domainRating?: number | null
  criticalAlerts?: number
  warningAlerts?: number
  hasSnapshot?: boolean
}): number | null {
  if (!input.hasSnapshot && input.organicTraffic == null && input.domainRating == null) {
    // Still give a soft baseline when project is active but unscanned.
    const base = input.status === 'active' ? 58 : input.status === 'ready' ? 50 : 40
    return base
  }

  let score = 70
  const dr = input.domainRating
  if (dr != null) score += Math.max(-10, Math.min(18, Math.round((dr - 20) / 3)))
  const kws = input.organicKeywords
  if (kws != null) {
    if (kws === 0) score -= 18
    else if (kws < 20) score -= 8
    else if (kws > 200) score += 8
    else score += 3
  }
  const traffic = input.organicTraffic
  if (traffic != null) {
    if (traffic === 0) score -= 12
    else if (traffic < 50) score -= 4
    else if (traffic > 1000) score += 6
  }
  score -= (input.criticalAlerts || 0) * 12
  score -= (input.warningAlerts || 0) * 5
  if (input.priority === 'primary') score += 3
  if (input.status === 'paused' || input.status === 'archived') score -= 15
  return Math.max(5, Math.min(98, Math.round(score)))
}

export function buildSnapshotOverlayMap(
  snapshots: SnapshotRow[],
  openAlertCounts: Map<string, number>,
  openTaskCounts: Map<string, number>,
  domainMeta: Map<string, { domain: string; status?: string; priority?: string }>,
): Map<string, ProjectOverlay> {
  const byDomain = new Map<string, SnapshotRow[]>()
  for (const row of snapshots) {
    if (!row.domain_id) continue
    const list = byDomain.get(row.domain_id) || []
    list.push(row)
    byDomain.set(row.domain_id, list)
  }

  const overlays = new Map<string, ProjectOverlay>()
  for (const [domainId, rows] of byDomain) {
    const sorted = [...rows].sort((a, b) => String(b.fetched_at).localeCompare(String(a.fetched_at)))
    const latestByProvider = new Map<string, SnapshotRow>()
    for (const row of sorted) {
      if (!latestByProvider.has(row.provider)) latestByProvider.set(row.provider, row)
    }

    const metrics: ProjectOverlay['metrics'] = {}
    const sources = new Set<string>()
    let criticalAlerts = 0
    let warningAlerts = 0
    let alertSnapshotCount = 0

    for (const [provider, row] of latestByProvider) {
      sources.add(provider)
      const m = extractProviderMetrics(provider, row.data as Record<string, unknown>)
      if (m.organicTraffic != null && metrics.organicTraffic == null) metrics.organicTraffic = m.organicTraffic
      if (m.organicKeywords != null && metrics.organicKeywords == null) metrics.organicKeywords = m.organicKeywords
      if (m.domainRating != null && metrics.domainRating == null) metrics.domainRating = m.domainRating
      if (provider === 'alerts') {
        alertSnapshotCount = m.alertCount || 0
        criticalAlerts = m.criticalAlerts || 0
        warningAlerts = m.warningAlerts || 0
      }
    }

    // Prefer durable open alerts/tasks from tables; do NOT invent task totals from alerts.
    const alertCount = openAlertCounts.get(domainId) ?? alertSnapshotCount
    const taskCount = openTaskCounts.get(domainId) ?? 0
    const lastFetchedAt = sorted[0]?.fetched_at || null
    const meta = domainMeta.get(domainId)

    overlays.set(domainId, {
      healthScore: deriveHealthScore({
        status: meta?.status,
        priority: meta?.priority,
        organicTraffic: metrics.organicTraffic,
        organicKeywords: metrics.organicKeywords,
        domainRating: metrics.domainRating,
        criticalAlerts,
        warningAlerts,
        hasSnapshot: true,
      }),
      alertCount,
      taskCount,
      lastFetchedAt,
      connectedSources: Array.from(sources).map((p) => {
        if (p === 'overview') return 'Overview'
        if (p === 'ahrefs' || p === 'ahrefs-dr') return 'Ahrefs'
        if (p === 'semrush') return 'SEMrush'
        if (p === 'dataforseo') return 'DataForSEO'
        if (p === 'alerts') return 'Rules Engine'
        return p
      }).filter((v, i, arr) => arr.indexOf(v) === i),
      dataState: 'live',
      metrics,
    })
  }

  // Domains with alerts/tasks but no snapshots yet
  for (const [domainId, count] of openAlertCounts) {
    if (overlays.has(domainId)) continue
    const meta = domainMeta.get(domainId)
    overlays.set(domainId, {
      healthScore: deriveHealthScore({ status: meta?.status, priority: meta?.priority, criticalAlerts: count, hasSnapshot: false }),
      alertCount: count,
      taskCount: openTaskCounts.get(domainId) || 0,
      lastFetchedAt: null,
      connectedSources: ['Rules Engine'],
      dataState: 'unavailable',
    })
  }

  return overlays
}

export function alertsFromSnapshotRows(domain: string, rows: SnapshotRow[]): SeoAlert[] {
  const latest = new Map<string, SnapshotRow>()
  const sorted = [...rows].sort((a, b) => String(b.fetched_at).localeCompare(String(a.fetched_at)))
  for (const row of sorted) {
    if (!latest.has(row.provider)) latest.set(row.provider, row)
  }

  let organicTraffic: number | null = null
  let previousOrganicTraffic: number | null = null
  let top10Keywords: number | null = null
  let performanceScore: number | null = null
  const providerErrors: Array<{ provider: string; errorClass: string }> = []

  // previous overview if available (second-most recent overview)
  const overviewHistory = sorted.filter((r) => r.provider === 'overview')
  if (overviewHistory[0]) {
    const cur = extractProviderMetrics('overview', overviewHistory[0].data as Record<string, any>)
    organicTraffic = cur.organicTraffic ?? null
    top10Keywords = cur.organicKeywords ?? null
  }
  if (overviewHistory[1]) {
    const prev = extractProviderMetrics('overview', overviewHistory[1].data as Record<string, any>)
    previousOrganicTraffic = prev.organicTraffic ?? null
  }

  for (const [provider, row] of latest) {
    if (provider === 'alerts') continue
    const d = row.data as any
    if (d?.error || d?.status === 'error') {
      providerErrors.push({ provider, errorClass: String(d.errorClass || d.error || 'error').slice(0, 40) })
    }
  }

  // pagespeed nested in overview sources if present
  const ov = latest.get('overview')?.data as any
  const perf = ov?.sources?.pagespeed?.lighthouseResult?.categories?.performance?.score
  if (typeof perf === 'number') performanceScore = Math.round(perf * 100)

  return generateAlerts({
    domain,
    organicTraffic,
    previousOrganicTraffic,
    top10Keywords,
    performanceScore,
    providerErrors,
  })
}
