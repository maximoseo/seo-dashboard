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
  commonKeywords: number | null
  competitorTraffic: number | null
  relevance: number | null
}> {
  const ourSet = new Set(ourKeywords.map((k) => k.keyword.toLowerCase()))
  // Prefer competitors with real overlap signals; exclude undifferentiable giant placeholders already filtered upstream.
  return competitors
    .slice()
    .sort((a, b) => (b.commonKeywords ?? 0) - (a.commonKeywords ?? 0) || (b.traffic ?? 0) - (a.traffic ?? 0))
    .slice(0, 12)
    .map((c) => ({
      competitor: c.domain,
      commonKeywords: c.commonKeywords,
      competitorTraffic: c.traffic,
      relevance: c.relevance ?? c.competitionLevel,
      ourMissingEstimate: c.commonKeywords != null ? Math.max(0, Math.round(c.commonKeywords * 0.35)) : null,
      note: ourSet.size
        ? `Shared-keyword retailer estimate vs our ${ourSet.size} tracked keywords — full gap table needs SERP overlap API pull.`
        : 'Pin competitors + refresh keywords to estimate gaps.',
    }))
}

export type RankBucket = {
  key: string
  label: string
  min: number
  max: number
  count: number
  volume: number
  traffic: number
  share: number
}

export type KeywordOpportunity = {
  keyword: string
  position: number
  previousPosition: number | null
  volume: number | null
  traffic: number | null
  difficulty: number | null
  cpc: number | null
  url: string | null
  source: string
  score: number
  kind: 'striking_distance' | 'quick_win' | 'value_upside' | 'decay'
  reason: string
}

export type CannibalCluster = {
  keyword: string
  urls: string[]
  bestPosition: number | null
  volume: number | null
  sources: string[]
}

export type PageCluster = {
  url: string
  keywords: number
  top3: number
  top10: number
  volume: number
  traffic: number
  bestPosition: number | null
  sampleKeywords: string[]
}

/**
 * Ahrefs/SEMrush-style keyword intel derived only from rows we already have.
 * Never invent volumes/ranks — empty buckets when no position evidence.
 */
export function computeKeywordIntel(rows: KeywordRow[]): {
  positionDistribution: RankBucket[]
  opportunities: KeywordOpportunity[]
  cannibalization: CannibalCluster[]
  pageClusters: PageCluster[]
  kpis: {
    tracked: number
    ranked: number
    top3: number
    top10: number
    top20: number
    strikingDistance: number
    cannibalized: number
    totalVolume: number
    totalTraffic: number
  }
} {
  const list = Array.isArray(rows) ? rows : []
  const ranked = list.filter((r) => r.position != null && Number(r.position) > 0)
  const bucketsDef: Array<Omit<RankBucket, 'count' | 'volume' | 'traffic' | 'share'>> = [
    { key: '1-3', label: 'Top 3', min: 1, max: 3 },
    { key: '4-10', label: '4–10', min: 4, max: 10 },
    { key: '11-20', label: '11–20', min: 11, max: 20 },
    { key: '21-50', label: '21–50', min: 21, max: 50 },
    { key: '51-100', label: '51–100', min: 51, max: 100 },
  ]
  const positionDistribution: RankBucket[] = bucketsDef.map((b) => {
    const inBucket = ranked.filter((r) => {
      const p = Number(r.position)
      return p >= b.min && p <= b.max
    })
    const volume = inBucket.reduce((s, r) => s + (Number(r.volume) || 0), 0)
    const traffic = inBucket.reduce((s, r) => s + (Number(r.traffic) || 0), 0)
    return {
      ...b,
      count: inBucket.length,
      volume,
      traffic,
      share: ranked.length ? inBucket.length / ranked.length : 0,
    }
  })

  const opportunities: KeywordOpportunity[] = []
  for (const row of ranked) {
    const pos = Number(row.position)
    const prev = row.previousPosition != null ? Number(row.previousPosition) : null
    const vol = row.volume != null ? Number(row.volume) : 0
    const traffic = row.traffic != null ? Number(row.traffic) : 0
    const cpc = row.cpc != null ? Number(row.cpc) : 0
    const diff = row.difficulty != null ? Number(row.difficulty) : null

    // Striking distance: page 2 ranks with meaningful demand (classic ops list)
    if (pos >= 11 && pos <= 20 && (vol >= 20 || traffic > 0)) {
      const score = Math.round(vol * (1 / pos) * 10 + traffic * 2 + cpc * 5)
      opportunities.push({
        keyword: row.keyword,
        position: pos,
        previousPosition: prev,
        volume: row.volume,
        traffic: row.traffic,
        difficulty: row.difficulty,
        cpc: row.cpc,
        url: row.url,
        source: row.source,
        score,
        kind: 'striking_distance',
        reason: `Pos #${pos} with demand — one content/internal-link push can enter top 10.`,
      })
      continue
    }

    // Quick wins: already top 10 with low difficulty / solid volume
    if (pos >= 4 && pos <= 10 && vol >= 50 && (diff == null || diff <= 40)) {
      const score = Math.round(vol * (1 / pos) * 12 + cpc * 8)
      opportunities.push({
        keyword: row.keyword,
        position: pos,
        previousPosition: prev,
        volume: row.volume,
        traffic: row.traffic,
        difficulty: row.difficulty,
        cpc: row.cpc,
        url: row.url,
        source: row.source,
        score,
        kind: 'quick_win',
        reason: `Pos #${pos}${diff != null ? ` · KD ${diff}` : ''} — optimize title/FAQ for a top-3 push.`,
      })
      continue
    }

    // Value upside: high CPC × volume still outside top 10
    if (pos > 10 && pos <= 50 && cpc >= 1 && vol >= 30) {
      const score = Math.round(vol * cpc * (1 / Math.max(pos, 1)) * 20)
      opportunities.push({
        keyword: row.keyword,
        position: pos,
        previousPosition: prev,
        volume: row.volume,
        traffic: row.traffic,
        difficulty: row.difficulty,
        cpc: row.cpc,
        url: row.url,
        source: row.source,
        score,
        kind: 'value_upside',
        reason: `High commercial intent (CPC $${cpc.toFixed(2)}) at #${pos}.`,
      })
      continue
    }

    // Decay: lost ground vs previous measured rank
    if (prev != null && pos > prev && prev > 0 && pos - prev >= 3 && (vol >= 30 || traffic > 0)) {
      const score = Math.round((pos - prev) * Math.max(vol, traffic * 10, 1))
      opportunities.push({
        keyword: row.keyword,
        position: pos,
        previousPosition: prev,
        volume: row.volume,
        traffic: row.traffic,
        difficulty: row.difficulty,
        cpc: row.cpc,
        url: row.url,
        source: row.source,
        score,
        kind: 'decay',
        reason: `Dropped ${prev} → ${pos}. Investigate SERP change / page health.`,
      })
    }
  }
  opportunities.sort((a, b) => b.score - a.score)

  // Cannibalization heuristic: same keyword appearing with multiple destination URLs across sources/rows.
  const byKw = new Map<string, KeywordRow[]>()
  for (const row of list) {
    const key = String(row.keyword || '').toLowerCase().trim()
    if (!key) continue
    const arr = byKw.get(key) || []
    arr.push(row)
    byKw.set(key, arr)
  }
  const cannibalization: CannibalCluster[] = []
  for (const [keyword, group] of byKw) {
    const urls = [...new Set(group.map((g) => String(g.url || '').split('?')[0].replace(/\/$/, '')).filter(Boolean))]
    if (urls.length < 2) continue
    const best = group
      .map((g) => (g.position != null && Number(g.position) > 0 ? Number(g.position) : null))
      .filter((p): p is number => p != null)
      .sort((a, b) => a - b)[0] ?? null
    const volume = group.reduce((s, g) => Math.max(s, Number(g.volume) || 0), 0) || null
    cannibalization.push({
      keyword: group[0].keyword,
      urls: urls.slice(0, 6),
      bestPosition: best,
      volume,
      sources: [...new Set(group.map((g) => g.source).filter(Boolean))],
    })
  }
  cannibalization.sort((a, b) => (b.volume || 0) - (a.volume || 0) || (a.bestPosition || 999) - (b.bestPosition || 999))

  // Landing page clusters — "Pages by keywords" view (Ahrefs Top pages analog)
  const byUrl = new Map<string, KeywordRow[]>()
  for (const row of ranked) {
    const url = String(row.url || '').trim()
    if (!url) continue
    const key = url.split('?')[0].replace(/\/$/, '')
    const arr = byUrl.get(key) || []
    arr.push(row)
    byUrl.set(key, arr)
  }
  const pageClusters: PageCluster[] = [...byUrl.entries()]
    .map(([url, group]) => {
      const positions = group.map((g) => Number(g.position)).filter((p) => p > 0)
      return {
        url,
        keywords: group.length,
        top3: positions.filter((p) => p <= 3).length,
        top10: positions.filter((p) => p <= 10).length,
        volume: group.reduce((s, g) => s + (Number(g.volume) || 0), 0),
        traffic: group.reduce((s, g) => s + (Number(g.traffic) || 0), 0),
        bestPosition: positions.length ? Math.min(...positions) : null,
        sampleKeywords: group
          .slice()
          .sort((a, b) => (Number(a.position) || 999) - (Number(b.position) || 999))
          .slice(0, 4)
          .map((g) => g.keyword),
      }
    })
    .sort((a, b) => b.keywords - a.keywords || b.traffic - a.traffic || b.volume - a.volume)
    .slice(0, 40)

  return {
    positionDistribution,
    opportunities: opportunities.slice(0, 40),
    cannibalization: cannibalization.slice(0, 25),
    pageClusters,
    kpis: {
      tracked: list.length,
      ranked: ranked.length,
      top3: ranked.filter((r) => Number(r.position) <= 3).length,
      top10: ranked.filter((r) => Number(r.position) <= 10).length,
      top20: ranked.filter((r) => Number(r.position) <= 20).length,
      strikingDistance: opportunities.filter((o) => o.kind === 'striking_distance').length,
      cannibalized: cannibalization.length,
      totalVolume: list.reduce((s, r) => s + (Number(r.volume) || 0), 0),
      totalTraffic: list.reduce((s, r) => s + (Number(r.traffic) || 0), 0),
    },
  }
}
