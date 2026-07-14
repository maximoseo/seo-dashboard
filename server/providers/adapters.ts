/**
 * Provider → canonical model adapters (server-side).
 * UI should prefer these normalized structures over raw bags.
 */

export type KeywordRow = {
  keyword: string
  position: number | null
  previousPosition: number | null
  volume: number | null
  difficulty: number | null
  traffic: number | null
  url: string | null
  cpc: number | null
  trend: 'up' | 'down' | 'stable' | 'new' | 'lost' | null
  source: string
  /** Best known rank per provider (for multi-tool compare UI). */
  sourcePositions?: Record<string, number | null>
  /** Search volume estimates per provider when available. */
  volumeBySource?: Record<string, number | null>
  intent?: string | null
  serpFeatures?: string[]
}

export type CompetitorRow = {
  domain: string
  commonKeywords: number | null
  traffic: number | null
  competitionLevel: number | null
  relevance: number | null
  topCountry: string | null
  source: string
}

export type BacklinkStat = {
  backlinks: number | null
  refDomains: number | null
  domainRating: number | null
  dofollow: number | null
  nofollow: number | null
  source: string
}

export type OverviewMetrics = {
  organicTraffic: number | null
  organicKeywords: number | null
  backlinks: number | null
  refDomains: number | null
  domainRating: number | null
  sources: string[]
}

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/[,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

const str = (v: unknown): string | null => {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

export function keywordsFromSemrush(rows: Record<string, string>[] | null | undefined): KeywordRow[] {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => {
    const position = num(row.Position ?? row.Po)
    const previous = num(row.PreviousPosition ?? row.Pp)
    let trend: KeywordRow['trend'] = null
    if (position != null && previous != null) {
      if (previous === 0 && position > 0) trend = 'new'
      else if (position < previous) trend = 'up'
      else if (position > previous) trend = 'down'
      else trend = 'stable'
    }
    const volume = num(row['Search Volume'] ?? row.Nq)
    return {
      keyword: str(row.Keyword ?? row.Ph) || '',
      position,
      previousPosition: previous,
      volume,
      difficulty: num(row['Keyword Difficulty'] ?? row.Kd),
      traffic: num(row.Traffic ?? row.Tr),
      url: str(row.URL ?? row.Ur),
      cpc: num(row.CPC ?? row.Cp),
      trend,
      source: 'semrush',
      sourcePositions: { semrush: position },
      volumeBySource: volume != null ? { semrush: volume } : undefined,
      intent: null,
      serpFeatures: [],
    }
  }).filter((r) => r.keyword)
}

export function keywordsFromAhrefs(payload: any): KeywordRow[] {
  const list = payload?.keywords || payload?.data?.keywords || payload?.data || []
  if (!Array.isArray(list)) return []
  return list.map((item: any) => {
    const position = num(item.best_position ?? item.position ?? item.rank)
    const change = num(item.position_change ?? item.position_trend ?? item.best_position_diff)
    let trend: KeywordRow['trend'] = null
    if (change != null) {
      // Ahrefs: positive change often means improved (moved up) depending on endpoint;
      // best_position_diff: negative = improved in some versions — keep sign of rank delta:
      if (change > 0) trend = 'down'
      else if (change < 0) trend = 'up'
      else trend = 'stable'
    }
    const volume = num(item.volume ?? item.search_volume)
    return {
      keyword: str(item.keyword) || '',
      position,
      previousPosition: position != null && change != null ? position - change : null,
      volume,
      difficulty: num(item.difficulty ?? item.keyword_difficulty ?? item.kd),
      traffic: num(item.traffic ?? item.sum_traffic),
      url: str(item.best_position_url ?? item.url ?? item.landing_page),
      cpc: num(item.cpc),
      trend,
      source: 'ahrefs',
      sourcePositions: { ahrefs: position },
      volumeBySource: volume != null ? { ahrefs: volume } : undefined,
      intent: null,
      serpFeatures: [],
    }
  }).filter((r: KeywordRow) => r.keyword)
}

export function keywordsFromDataForSEO(payload: any): KeywordRow[] {
  const tasks = payload?.tasks
  if (!Array.isArray(tasks)) return []
  const out: KeywordRow[] = []
  for (const task of tasks) {
    const results = task?.result
    if (!Array.isArray(results)) continue
    for (const result of results) {
      const items = result?.items
      if (!Array.isArray(items)) continue
      for (const item of items) {
        const kw = item?.keyword_data?.keyword || item?.keyword || item?.key
        const metrics = item?.keyword_data?.keyword_info || item
        const ranked = item?.ranked_serp_element?.serp_item || item
        const position = num(ranked?.rank_group ?? ranked?.rank_absolute ?? item?.rank ?? item?.position)
        const volume = num(metrics?.search_volume ?? item?.search_volume ?? item?.volume)
        const kdRaw = num(item?.keyword_data?.keyword_properties?.keyword_difficulty
          ?? metrics?.competition
          ?? item?.competition
          ?? item?.difficulty)
        // DataForSEO competition is often 0-1; convert to 0-100 when needed
        const difficulty = kdRaw != null && kdRaw <= 1 ? Math.round(kdRaw * 100) : kdRaw
        out.push({
          keyword: str(kw) || '',
          position,
          previousPosition: null,
          volume,
          difficulty,
          traffic: num(item?.etv ?? ranked?.etv),
          url: str(ranked?.url ?? item?.url),
          cpc: num(metrics?.cpc ?? item?.cpc),
          trend: null,
          source: 'dataforseo',
          sourcePositions: { dataforseo: position },
          volumeBySource: volume != null ? { dataforseo: volume } : undefined,
          intent: null,
          serpFeatures: [],
        })
      }
    }
  }
  return out.filter((r) => r.keyword)
}

/** Serpstat domain keywords / v4 result payload */
export function keywordsFromSerpstat(payload: any): KeywordRow[] {
  const data = payload?.result?.data || payload?.data || payload
  const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
  if (!Array.isArray(list)) return []
  return list.map((item: any) => {
    const position = num(item.position ?? item.pos ?? item.rank)
    const volume = num(item.region_queries_count ?? item.volume ?? item.search_volume ?? item.region_queries_count_wide)
    return {
      keyword: str(item.keyword || item.kw || item.query) || '',
      position,
      previousPosition: num(item.previous_position ?? item.prev_pos),
      volume,
      difficulty: num(item.difficulty ?? item.concurrency ?? item.competition),
      traffic: num(item.traff ?? item.traffic),
      url: str(item.url),
      cpc: num(item.cost ?? item.cpc),
      trend: null,
      source: 'serpstat',
      sourcePositions: { serpstat: position },
      volumeBySource: volume != null ? { serpstat: volume } : undefined,
      intent: null,
      serpFeatures: [],
    }
  }).filter((r: KeywordRow) => r.keyword)
}

/** Keywords Everywhere get_keyword_data response */
export function keywordsFromKeywordsEverywhere(payload: any): KeywordRow[] {
  const list = payload?.data || payload
  if (!Array.isArray(list)) return []
  return list.map((item: any) => {
    const volume = num(item.vol ?? item.volume ?? item.search_volume)
    const cpc = num(typeof item.cpc === 'object' ? item.cpc?.value : item.cpc)
    const competition = num(item.competition ?? item.comp)
    return {
      keyword: str(item.keyword || item.kw) || '',
      position: null,
      previousPosition: null,
      volume,
      difficulty: competition != null && competition <= 1 ? Math.round(competition * 100) : competition,
      traffic: null,
      url: null,
      cpc,
      trend: null,
      source: 'keywords_everywhere',
      sourcePositions: {},
      volumeBySource: volume != null ? { keywords_everywhere: volume } : undefined,
      intent: null,
      serpFeatures: [],
    }
  }).filter((r: KeywordRow) => r.keyword)
}

/** Optional organic results from SerpAPI (title used only as weak keyword signal when needed) */
export function keywordsFromSerpApi(payload: any): KeywordRow[] {
  const list = payload?.organic_results || []
  if (!Array.isArray(list)) return []
  return list.map((item: any) => ({
    keyword: str(item.title) || '',
    position: num(item.position ?? item.rank),
    previousPosition: null,
    volume: null,
    difficulty: null,
    traffic: null,
    url: str(item.link ?? item.url),
    cpc: null,
    trend: null,
    source: 'serpapi',
  })).filter((r: KeywordRow) => r.keyword || r.url)
}

export function competitorsFromSerpstat(payload: any): CompetitorRow[] {
  const data = payload?.result?.data || payload?.data || payload
  const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
  if (!Array.isArray(list)) return []
  return list.map((item: any) => ({
    domain: str(item.domain || item.Dn || item.url) || '',
    commonKeywords: num(item.common_keywords ?? item.intersections ?? item.keywords),
    traffic: num(item.traff ?? item.traffic ?? item.organic_traffic),
    competitionLevel: num(item.relevance ?? item.competition),
    relevance: num(item.relevance ?? item.competition),
    topCountry: null,
    source: 'serpstat',
  })).filter((r: CompetitorRow) => r.domain)
}

export function backlinksFromSerpstat(payload: any): BacklinkStat {
  const data = payload?.result?.data || payload?.result || payload?.data || payload || {}
  const row = Array.isArray(data) ? data[0] : data
  return {
    backlinks: num(row?.backlinks ?? row?.total_backlinks ?? row?.backlinks_count),
    refDomains: num(row?.refdomains ?? row?.referring_domains ?? row?.domains),
    domainRating: num(row?.domain_rank ?? row?.dr ?? row?.trust_score),
    dofollow: num(row?.dofollow ?? row?.follow),
    nofollow: num(row?.nofollow),
    source: 'serpstat',
  }
}

/** Merge multi-source keywords; prefer richest fields + keep per-provider ranks/volumes. */
export function mergeKeywordRows(
  groups: KeywordRow[][],
  preferredSources: string[] = ['semrush', 'ahrefs', 'dataforseo', 'serpstat', 'keywords_everywhere', 'serpapi'],
): KeywordRow[] {
  const map = new Map<string, KeywordRow>()
  const order = new Map(preferredSources.map((s, i) => [s, i]))
  const sortedGroups = [...groups].sort((a, b) => {
    const sa = a[0]?.source || ''
    const sb = b[0]?.source || ''
    return (order.get(sa) ?? 99) - (order.get(sb) ?? 99)
  })
  const betterPos = (a: number | null | undefined, b: number | null | undefined) => {
    if (a == null) return b ?? null
    if (b == null) return a
    return Math.min(a, b)
  }
  const betterNum = (a: number | null | undefined, b: number | null | undefined) => {
    if (a == null) return b ?? null
    if (b == null) return a
    return Math.max(a, b)
  }
  for (const group of sortedGroups) {
    for (const row of group) {
      const key = row.keyword.toLowerCase()
      const existing = map.get(key)
      if (!existing) {
        map.set(key, {
          ...row,
          sourcePositions: { ...(row.sourcePositions || {}), [row.source.split('+')[0]]: row.position },
          volumeBySource: { ...(row.volumeBySource || {}), ...(row.volume != null ? { [row.source.split('+')[0]]: row.volume } : {}) },
        })
        continue
      }
      const sourceKey = (row.source || 'unknown').split('+')[0]
      const sourcePositions = {
        ...(existing.sourcePositions || {}),
        ...(row.sourcePositions || {}),
        [sourceKey]: row.position ?? existing.sourcePositions?.[sourceKey] ?? null,
      }
      const volumeBySource = {
        ...(existing.volumeBySource || {}),
        ...(row.volumeBySource || {}),
        ...(row.volume != null ? { [sourceKey]: row.volume } : {}),
      }
      // Prefer known ranking position over volume-only KE rows when merging primary position
      const position = betterPos(existing.position, row.position)
      const volume = betterNum(existing.volume, row.volume)
      map.set(key, {
        keyword: existing.keyword || row.keyword,
        position,
        previousPosition: existing.previousPosition ?? row.previousPosition,
        volume,
        difficulty: betterNum(existing.difficulty, row.difficulty),
        traffic: betterNum(existing.traffic, row.traffic),
        url: existing.url || row.url,
        cpc: betterNum(existing.cpc, row.cpc),
        trend: existing.trend ?? row.trend,
        source: existing.source.includes(sourceKey) ? existing.source : `${existing.source}+${sourceKey}`,
        sourcePositions,
        volumeBySource,
        intent: existing.intent ?? row.intent ?? null,
        serpFeatures: Array.from(new Set([...(existing.serpFeatures || []), ...(row.serpFeatures || [])])),
      })
    }
  }
  return [...map.values()].sort((a, b) => {
    const pos = (a.position ?? 999) - (b.position ?? 999)
    if (pos !== 0) return pos
    return (b.volume ?? 0) - (a.volume ?? 0)
  })
}

export function competitorsFromSemrush(rows: any): CompetitorRow[] {
  if (!Array.isArray(rows)) return []
  // Either object rows (-parseSemrushCSV) or raw string[] rows
  return rows.map((row: any) => {
    if (Array.isArray(row)) {
      return {
        domain: str(row[0]) || '',
        competitionLevel: num(row[1]),
        commonKeywords: num(row[2]),
        traffic: num(row[3]),
        relevance: num(row[1]),
        topCountry: null,
        source: 'semrush',
      }
    }
    return {
      domain: str(row.Domain ?? row.Dn ?? row.domain) || '',
      competitionLevel: num(row.Competition ?? row.Cr),
      commonKeywords: num(row['Common Keywords'] ?? row.Np ?? row.common_keywords),
      traffic: num(row['Organic Traffic'] ?? row.Ot ?? row.traffic),
      relevance: num(row.Competition ?? row.Cr),
      topCountry: null,
      source: 'semrush',
    }
  }).filter((r: CompetitorRow) => r.domain)
}

export function competitorsFromDataForSEO(payload: any): CompetitorRow[] {
  const items = payload?.tasks?.[0]?.result?.[0]?.items
  if (!Array.isArray(items)) return []
  return items.map((item: any) => ({
    domain: str(item.domain) || '',
    commonKeywords: num(item.intersections ?? item.full_domain_metrics?.organic?.count),
    traffic: num(item.full_domain_metrics?.organic?.etv),
    competitionLevel: num(item.avg_position),
    relevance: num(item.avg_position),
    topCountry: str(item.full_domain_metrics?.organic?.top_country),
    source: 'dataforseo',
  })).filter((r: CompetitorRow) => r.domain)
}

function hostFromUrl(url?: string): string {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : ''
  } catch {
    return ''
  }
}

export function competitorsFromExa(results: any): CompetitorRow[] {
  if (!Array.isArray(results)) return []
  return results.map((item: any) => ({
    domain: hostFromUrl(item.url),
    commonKeywords: null,
    traffic: null,
    competitionLevel: null,
    relevance: num(item.score),
    topCountry: null,
    source: 'exa',
  })).filter((r: CompetitorRow) => r.domain)
}

export function mergeCompetitors(groups: CompetitorRow[][]): CompetitorRow[] {
  const map = new Map<string, CompetitorRow>()
  for (const group of groups) {
    for (const row of group) {
      const key = row.domain.toLowerCase()
      const existing = map.get(key)
      if (!existing) {
        map.set(key, { ...row })
        continue
      }
      map.set(key, {
        domain: existing.domain,
        commonKeywords: existing.commonKeywords ?? row.commonKeywords,
        traffic: existing.traffic ?? row.traffic,
        competitionLevel: existing.competitionLevel ?? row.competitionLevel,
        relevance: existing.relevance ?? row.relevance,
        topCountry: existing.topCountry ?? row.topCountry,
        source: existing.source.includes(row.source) ? existing.source : `${existing.source}+${row.source}`,
      })
    }
  }
  return [...map.values()].sort((a, b) => (b.traffic ?? 0) - (a.traffic ?? 0) || (b.commonKeywords ?? 0) - (a.commonKeywords ?? 0))
}

export function keywordMovements(rows: KeywordRow[]): {
  improved: KeywordRow[]
  declined: KeywordRow[]
  newEntries: KeywordRow[]
  lost: KeywordRow[]
} {
  const improved: KeywordRow[] = []
  const declined: KeywordRow[] = []
  const newEntries: KeywordRow[] = []
  const lost: KeywordRow[] = []
  for (const row of rows) {
    if (row.trend === 'new') newEntries.push(row)
    else if (row.trend === 'lost') lost.push(row)
    else if (row.trend === 'up') improved.push(row)
    else if (row.trend === 'down') declined.push(row)
  }
  return {
    improved: improved.slice(0, 25),
    declined: declined.slice(0, 25),
    newEntries: newEntries.slice(0, 25),
    lost: lost.slice(0, 25),
  }
}

export function computeCompetitorGaps(ourKeywords: KeywordRow[], competitors: CompetitorRow[]): Array<{
  competitor: string
  ourMissingEstimate: number | null
  note: string
}> {
  const ourSet = new Set(ourKeywords.map((k) => k.keyword.toLowerCase()))
  return competitors.slice(0, 10).map((c) => ({
    competitor: c.domain,
    ourMissingEstimate: c.commonKeywords != null ? Math.max(0, Math.round(c.commonKeywords * 0.35)) : null,
    note: ourSet.size
      ? `Shared-keyword retailer estimate vs our ${ourSet.size} tracked keywords — full gap table needs SERP overlap API pull.`
      : 'Pin competitors + refresh keywords to estimate gaps.',
  }))
}
