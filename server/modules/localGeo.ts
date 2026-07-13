import { resolveMarket } from '../markets/resolveMarket.js'

export type ModuleCheck = {
  name: string
  status: 'live' | 'partial' | 'planned' | 'unavailable'
  detail: string
  evidence?: string[]
  score?: number | null
}

function domainLooksLocal(domain: string): boolean {
  const d = domain.toLowerCase()
  return (
    d.endsWith('.co.il') ||
    d.endsWith('.org.il') ||
    d.includes('clinic') ||
    d.includes('lawyer') ||
    d.includes('law') ||
    d.includes('dentist') ||
    d.includes('dental') ||
    d.includes('hotel') ||
    d.includes('plumb') ||
    d.includes('lock') ||
    d.includes('hovalot') ||
    d.includes('trips') ||
    d.includes('clinic') ||
    d.includes('adv')
  )
}

function hasHebrewTldOrLabel(domain: string, market?: string | null): boolean {
  const pack = resolveMarket({ domain, market })
  return pack.code === 'il'
}

export function buildLocalSeoOverview(input: {
  domain: string
  market?: string | null
  snapshotMeta?: {
    keywordsCount?: number
    competitorsCount?: number
    rankingLocalFeatures?: number
    lastFetchedAt?: string | null
    softDegraded?: string[]
  }
}) {
  const domain = String(input.domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
  const pack = resolveMarket({ domain, market: input.market })
  const local = domainLooksLocal(domain) || pack.code === 'il'
  const kw = input.snapshotMeta?.keywordsCount || 0
  const localFeatures = input.snapshotMeta?.rankingLocalFeatures || 0
  const soft = input.snapshotMeta?.softDegraded || []
  const last = input.snapshotMeta?.lastFetchedAt || null

  const checks: ModuleCheck[] = [
    {
      name: 'Market local intent',
      status: local ? 'live' : 'partial',
      detail: local
        ? `Domain/market resolved as local-relevant (${pack.label} / ${pack.code}). Prioritize GBP + NAP + review response SLA.`
        : `Market=${pack.label}. Not strongly local-coded — keep light local monitoring only.`,
      score: local ? 80 : 40,
      evidence: [`market:${pack.code}`, `tld-local:${domainLooksLocal(domain)}`],
    },
    {
      name: 'GBP health',
      status: local ? 'partial' : 'planned',
      detail: local
        ? 'Wire Google Business Profile API / Local Falcon avatar scans for completeness (categories, photos, services, hours).'
        : 'GBP module reserved for local-service clients.',
      evidence: last ? [`lastSpine:${last}`] : [],
    },
    {
      name: 'Reviews velocity',
      status: 'planned',
      detail: 'Track new reviews / week, rating delta, response SLA. Ready for Local Falcon or GBP reviews feed.',
    },
    {
      name: 'Local rank grid',
      status: localFeatures > 0 ? 'partial' : local ? 'partial' : 'planned',
      detail:
        localFeatures > 0
          ? `Detected ${localFeatures} keyword rows with local SERP features (local pack / maps). Expand to geo-grid when Local Falcon key is present.`
          : 'No local-pack SERP features in keyword snapshot yet. Sync keywords or hook Local Falcon grid.',
      score: localFeatures > 0 ? Math.min(90, 40 + localFeatures * 5) : null,
      evidence: [`keywordRows:${kw}`, `localFeatures:${localFeatures}`],
    },
    {
      name: 'NAP consistency',
      status: 'planned',
      detail: 'Compare Name/Address/Phone across core citations (business listings). Automate via provider crawl later.',
    },
  ]

  if (soft.length) {
    checks.push({
      name: 'Provider soft-degrade',
      status: 'partial',
      detail: `Some local-adjacent providers degraded: ${soft.join(', ')}. Results may be incomplete.`,
      evidence: soft,
    })
  }

  const liveCount = checks.filter((c) => c.status === 'live' || c.status === 'partial').length
  return {
    domain,
    market: { code: pack.code, label: pack.label },
    source: liveCount > 0 ? 'spine+heuristics' : 'planned-module',
    dataState: liveCount > 0 ? 'partial' : 'planned',
    readinessScore: Math.round((liveCount / checks.length) * 100),
    checks,
    fetchedAt: new Date().toISOString(),
  }
}

export function buildGeoAiOverview(input: {
  domain: string
  market?: string | null
  snapshotMeta?: {
    keywordsCount?: number
    aiOverviewCount?: number
    lastFetchedAt?: string | null
    softDegraded?: string[]
    topKeywords?: Array<{ keyword: string; position: number | null }>
  }
}) {
  const domain = String(input.domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
  const pack = resolveMarket({ domain, market: input.market })
  const aiCount = input.snapshotMeta?.aiOverviewCount || 0
  const kw = input.snapshotMeta?.keywordsCount || 0
  const soft = input.snapshotMeta?.softDegraded || []
  const top = input.snapshotMeta?.topKeywords || []

  const checks: ModuleCheck[] = [
    {
      name: 'AI Overview visibility',
      status: aiCount > 0 ? 'live' : kw > 0 ? 'partial' : 'planned',
      detail:
        aiCount > 0
          ? `${aiCount} tracked keywords show AI Overview SERP features. Prioritize Atomic Answer blocks (40–60 words) for citation.`
          : kw > 0
            ? `${kw} keywords tracked but no AI Overview flags in snapshot yet — re-scan SERP features or expand keyword set.`
            : 'No keyword spine yet. Sync keywords_agg to evaluate AI Overview exposure.',
      score: aiCount > 0 ? Math.min(95, 50 + aiCount * 5) : kw > 0 ? 35 : null,
      evidence: [`aiOverviewKeywords:${aiCount}`, `trackedKeywords:${kw}`],
    },
    {
      name: 'Entity completeness',
      status: hasHebrewTldOrLabel(domain, input.market) ? 'partial' : 'planned',
      detail:
        'Ensure Organization/LocalBusiness schema, author bios, service pages, and consistent entity names across site + knowledge panels.',
      evidence: [`market:${pack.code}`],
    },
    {
      name: 'Citation opportunities',
      status: top.length ? 'partial' : 'planned',
      detail: top.length
        ? `Seed prompts from top tracked keywords: ${top
            .slice(0, 5)
            .map((k) => k.keyword)
            .join(' · ')}. Build quotable facts, stats and unique data tables.`
        : 'Need keyword spine to seed non-branded prompts for ChatGPT/Perplexity/AIO checks.',
      evidence: top.slice(0, 5).map((k) => k.keyword),
    },
    {
      name: 'Prompt snapshots',
      status: 'planned',
      detail: 'Schedule branded + non-branded prompt guards (manual/Browserless/Exa) with evidence history — not yet automated.',
    },
    {
      name: 'llms.txt expectation',
      status: 'live',
      detail:
        'Google has not confirmed ranking gain from llms.txt. Treat as optional discoversability aid — do not block readiness score on its absence.',
      score: 100,
      evidence: ['policy:optional-not-required'],
    },
  ]

  if (soft.length) {
    checks.push({
      name: 'Provider soft-degrade',
      status: 'partial',
      detail: `Degraded providers may hide SERP-feature truth: ${soft.join(', ')}.`,
      evidence: soft,
    })
  }

  const liveCount = checks.filter((c) => c.status === 'live' || c.status === 'partial').length
  return {
    domain,
    market: { code: pack.code, label: pack.label },
    source: liveCount > 0 ? 'spine+heuristics' : 'planned-module',
    dataState: liveCount > 0 ? 'partial' : 'planned',
    readinessScore: Math.round((liveCount / checks.length) * 100),
    checks,
    fetchedAt: new Date().toISOString(),
  }
}

/** Extract cheap SERP-feature counts from keyword snapshot payloads without re-hitting providers. */
export function summarizeKeywordSerpSignals(normalized: any[]): {
  keywordsCount: number
  aiOverviewCount: number
  rankingLocalFeatures: number
  topKeywords: Array<{ keyword: string; position: number | null }>
} {
  const rows = Array.isArray(normalized) ? normalized : []
  let aiOverviewCount = 0
  let rankingLocalFeatures = 0
  for (const row of rows) {
    const features = Array.isArray(row?.serpFeatures)
      ? row.serpFeatures.map((f: any) => String(f).toLowerCase())
      : []
    if (features.some((f: string) => f.includes('ai_overview') || f.includes('ai overview') || f === 'aio')) {
      aiOverviewCount += 1
    }
    if (features.some((f: string) => f.includes('local') || f.includes('map') || f.includes('pack'))) {
      rankingLocalFeatures += 1
    }
  }
  const topKeywords = [...rows]
    .filter((r) => r?.keyword)
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
    .slice(0, 8)
    .map((r) => ({ keyword: String(r.keyword), position: r.position ?? null }))

  return {
    keywordsCount: rows.length,
    aiOverviewCount,
    rankingLocalFeatures,
    topKeywords,
  }
}
