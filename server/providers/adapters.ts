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
        // SERP feature types present on this keyword's SERP (minus 'organic')
        const rawTypes = item?.keyword_data?.serp_info?.serp_item_types
          ?? item?.ranked_serp_element?.serp_item_types
          ?? []
        const serpFeatures = (Array.isArray(rawTypes) ? rawTypes : [])
          .map((t: any) => str(t))
          .filter((t: string | null): t is string => Boolean(t) && t !== 'organic')
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
          serpFeatures,
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
  realMissingCount?: number | null
}> {
  const ourSet = new Set(ourKeywords.map((k) => k.keyword.toLowerCase()))
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
        ? `Shared-keyword retailer estimate vs our ${ourSet.size} tracked keywords — matrix rows (if present) come from live competitor ranked keywords.`
        : 'Pin competitors + refresh keywords to estimate gaps.',
    }))
}

export type KeywordGapRow = {
  keyword: string
  volume: number | null
  difficulty: number | null
  cpc: number | null
  competitor: string
  competitorPosition: number | null
  competitorTraffic: number | null
  ourPosition: number | null
  opportunityScore: number
  kind: 'missing' | 'outranked' | 'shared'
  competitorUrl: string | null
  ourUrl: string | null
}

/**
 * Real keyword gap / intersection table from competitor ranked keywords vs ours.
 * missing = they rank, we don't; outranked = both rank but they are better; shared = both with us better/equal.
 */
export function buildKeywordGapMatrix(
  ourKeywords: KeywordRow[],
  competitorKeywordSets: Array<{ competitor: string; keywords: KeywordRow[] }>,
): {
  rows: KeywordGapRow[]
  summary: {
    competitorsCompared: number
    missing: number
    outranked: number
    shared: number
    totalCompetitorKeywords: number
  }
} {
  const ourMap = new Map<string, KeywordRow>()
  for (const row of ourKeywords || []) {
    const key = String(row.keyword || '').toLowerCase().trim()
    if (!key) continue
    const prev = ourMap.get(key)
    if (!prev) ourMap.set(key, row)
    else {
      // Keep best (lowest) rank / highest volume
      const betterPos =
        prev.position != null && row.position != null
          ? Number(row.position) < Number(prev.position)
          : row.position != null && prev.position == null
      ourMap.set(key, betterPos ? row : prev)
    }
  }

  const rows: KeywordGapRow[] = []
  let missing = 0
  let outranked = 0
  let shared = 0
  let totalCompetitorKeywords = 0

  for (const set of competitorKeywordSets || []) {
    const competitor = canonicalizeLike(set.competitor)
    if (!competitor) continue
    for (const ck of set.keywords || []) {
      const key = String(ck.keyword || '').toLowerCase().trim()
      if (!key) continue
      totalCompetitorKeywords += 1
      const ours = ourMap.get(key)
      const ourPos = ours?.position != null && Number(ours.position) > 0 ? Number(ours.position) : null
      const theirPos = ck.position != null && Number(ck.position) > 0 ? Number(ck.position) : null
      const volume = ck.volume ?? ours?.volume ?? null
      const difficulty = ck.difficulty ?? ours?.difficulty ?? null
      const cpc = ck.cpc ?? ours?.cpc ?? null
      const theirTraffic = ck.traffic ?? null

      let kind: KeywordGapRow['kind']
      if (ourPos == null) {
        kind = 'missing'
        missing += 1
      } else if (theirPos != null && ourPos > theirPos) {
        kind = 'outranked'
        outranked += 1
      } else {
        kind = 'shared'
        shared += 1
      }

      // Score prioritizes missing high-volume terms and outranked commercial terms
      const vol = Number(volume) || 0
      const cpcN = Number(cpc) || 0
      const posFactor = theirPos != null ? 1 / Math.max(theirPos, 1) : 0.05
      const kindBoost = kind === 'missing' ? 3 : kind === 'outranked' ? 2 : 0.4
      const opportunityScore = Math.round((vol * Math.max(cpcN, 0.15) * posFactor + (Number(theirTraffic) || 0)) * kindBoost)

      rows.push({
        keyword: ck.keyword || ours?.keyword || key,
        volume,
        difficulty,
        cpc,
        competitor,
        competitorPosition: theirPos,
        competitorTraffic: theirTraffic,
        ourPosition: ourPos,
        opportunityScore,
        kind,
        competitorUrl: ck.url || null,
        ourUrl: ours?.url || null,
      })
    }
  }

  rows.sort((a, b) => b.opportunityScore - a.opportunityScore || (b.volume || 0) - (a.volume || 0))

  return {
    rows: rows.slice(0, 200),
    summary: {
      competitorsCompared: (competitorKeywordSets || []).filter((s) => (s.keywords || []).length).length,
      missing,
      outranked,
      shared,
      totalCompetitorKeywords,
    },
  }
}

/** Position → estimated organic CTR curve (blended industry estimates). */
export function estimatedCtr(position: number | null | undefined): number {
  if (position == null || !(position > 0)) return 0
  const p = Math.round(position)
  if (p === 1) return 0.3
  if (p === 2) return 0.15
  if (p === 3) return 0.09
  if (p === 4) return 0.06
  if (p === 5) return 0.045
  if (p === 6) return 0.03
  if (p === 7) return 0.022
  if (p === 8) return 0.017
  if (p === 9) return 0.013
  if (p === 10) return 0.01
  if (p <= 20) return 0.005
  return 0.001
}

export type ShareOfVoiceRow = {
  domain: string
  visibility: number
  sov: number
  keywordsWithVolume: number
  keywordsTotal: number
  top3Count: number
  isOurs: boolean
}

export type ShareOfVoiceResult = {
  method: 'ctr-weighted'
  ourSov: number | null
  ourVisibility: number
  totalVisibility: number
  rows: ShareOfVoiceRow[]
  keywordsCompared: number
  keywordsSkippedNoVolume: number
  note: string
}

/**
 * Share-of-Voice: CTR-weighted visibility share across us + competitors.
 * visibility(domain) = Σ volume(keyword) × CTR(position) over volume-backed keywords.
 * sov(domain) = visibility(domain) / totalVisibility × 100.
 */
export function computeShareOfVoice(
  ourDomain: string,
  ourKeywords: KeywordRow[],
  competitorKeywordSets: Array<{ competitor: string; keywords: KeywordRow[] }>,
): ShareOfVoiceResult {
  const volumeByKeyword = new Map<string, number>()
  const seenNoVolume = new Set<string>()
  const ourPos = new Map<string, number | null>()
  const compPos = new Map<string, Map<string, number | null>>()

  const trackVolume = (kw: string, vol: number | null): string => {
    const key = kw.toLowerCase().trim()
    if (!key) return ''
    const v = Number(vol) || 0
    if (v > 0) {
      const prev = volumeByKeyword.get(key) || 0
      if (v > prev) volumeByKeyword.set(key, v)
    } else if (!volumeByKeyword.has(key)) {
      seenNoVolume.add(key)
    }
    return key
  }

  const bestPos = (m: Map<string, number | null>, key: string, pos: number | null) => {
    const prev = m.get(key)
    if (prev === undefined || (pos != null && (prev == null || pos < prev))) m.set(key, pos)
  }

  for (const row of ourKeywords || []) {
    const key = trackVolume(String(row.keyword || ''), row.volume)
    if (!key) continue
    const pos = row.position != null && Number(row.position) > 0 ? Number(row.position) : null
    bestPos(ourPos, key, pos)
  }

  for (const set of competitorKeywordSets || []) {
    const competitor = canonicalizeLike(set.competitor)
    if (!competitor) continue
    let m = compPos.get(competitor)
    if (!m) {
      m = new Map()
      compPos.set(competitor, m)
    }
    for (const ck of set.keywords || []) {
      const key = trackVolume(String(ck.keyword || ''), ck.volume)
      if (!key) continue
      const pos = ck.position != null && Number(ck.position) > 0 ? Number(ck.position) : null
      bestPos(m, key, pos)
    }
  }

  // Compare only keywords with a volume estimate.
  const compared = [...volumeByKeyword.keys()]
  const keywordsSkippedNoVolume = [...seenNoVolume].filter((k) => !volumeByKeyword.has(k)).length

  const top3Of = (posMap: Map<string, number | null>): number => {
    let n = 0
    for (const [, pos] of posMap) if (pos != null && pos <= 3) n += 1
    return n
  }

  const visibilityOf = (posMap: Map<string, number | null>): number => {
    let v = 0
    for (const key of compared) {
      const ctr = estimatedCtr(posMap.get(key))
      if (ctr > 0) v += (volumeByKeyword.get(key) || 0) * ctr
    }
    return Math.round(v)
  }

  const withVolumeCount = (posMap: Map<string, number | null>): number => {
    let n = 0
    for (const key of posMap.keys()) if (volumeByKeyword.has(key)) n += 1
    return n
  }

  const ourVisibility = visibilityOf(ourPos)
  let totalVisibility = ourVisibility

  const rows: ShareOfVoiceRow[] = []
  for (const [domain, m] of compPos.entries()) {
    const visibility = visibilityOf(m)
    totalVisibility += visibility
    rows.push({
      domain,
      visibility,
      sov: 0,
      keywordsWithVolume: withVolumeCount(m),
      keywordsTotal: m.size,
      top3Count: top3Of(m),
      isOurs: false,
    })
  }
  rows.push({
    domain: canonicalizeLike(ourDomain) || 'you',
    visibility: ourVisibility,
    sov: 0,
    keywordsWithVolume: withVolumeCount(ourPos),
    keywordsTotal: ourPos.size,
    top3Count: top3Of(ourPos),
    isOurs: true,
  })

  for (const row of rows) {
    row.sov = totalVisibility > 0 ? Math.round((row.visibility / totalVisibility) * 1000) / 10 : 0
  }
  rows.sort((a, b) => b.visibility - a.visibility || b.top3Count - a.top3Count)

  const ourSov = totalVisibility > 0 ? Math.round((ourVisibility / totalVisibility) * 1000) / 10 : null

  return {
    method: 'ctr-weighted',
    ourSov,
    ourVisibility,
    totalVisibility,
    rows,
    keywordsCompared: compared.length,
    keywordsSkippedNoVolume,
    note: compared.length
      ? `CTR-weighted visibility across ${compared.length} volume-backed keywords (positions from tracked sets).`
      : 'No volume-backed keywords yet — refresh keywords to compute Share-of-Voice.',
  }
}

function canonicalizeLike(input?: string | null): string {
  if (!input) return ''
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
}

export type LinkOpportunity = {
  domain: string
  rank: number
  backlinks: number
  dofollow: number | null
  quality: string
  kind: 'strengthen' | 'reclaim_nofollow' | 'cleanup_spam' | 'locale_authority'
  reason: string
  score: number
  firstSeen?: string
  source?: string
}

/** Operator link list from our own backlink inventory (no invented competitor intersections). */
export function computeLinkIntel(input: {
  normalizedLinks?: any[]
  refdomains?: any[]
  domain?: string
}): {
  opportunities: LinkOpportunity[]
  topRelevant: Array<{ domain: string; rank: number; backlinks: number; quality: string; source?: string }>
  summary: { relevant: number; risky: number; spam: number; strengthen: number; cleanup: number }
} {
  let refs = Array.isArray(input.refdomains) ? [...input.refdomains] : []
  const links = Array.isArray(input.normalizedLinks) ? input.normalizedLinks : []

  // If RD list empty, derive coarse domains from link sample so operators still get opportunities.
  if (!refs.length && links.length) {
    const map = new Map<string, any>()
    for (const link of links) {
      const domain = String(link.domain_from || '')
        .replace(/^www\./, '')
        .toLowerCase()
      if (!domain) continue
      const prev = map.get(domain)
      const rank = Number(link.rank || 0) || 0
      const quality = String(link.quality || 'relevant')
      if (!prev) {
        map.set(domain, {
          domain,
          rank,
          backlinks: 1,
          dofollow: link.dofollow ? 1 : 0,
          quality,
          first_seen: link.first_seen || '',
          source: link.source,
        })
      } else {
        prev.backlinks += 1
        prev.rank = Math.max(prev.rank, rank)
        if (link.dofollow) prev.dofollow = Number(prev.dofollow || 0) + 1
        if (quality === 'spam') prev.quality = 'spam'
        else if (quality === 'risky' && prev.quality !== 'spam') prev.quality = 'risky'
      }
    }
    refs = Array.from(map.values())
  }

  const opportunities: LinkOpportunity[] = []
  let relevant = 0
  let risky = 0
  let spam = 0

  for (const r of refs) {
    const domain = String(r.domain || '').toLowerCase()
    if (!domain) continue
    const quality = String(r.quality || 'relevant')
    const rank = Number(r.rank || 0) || 0
    const backlinks = Number(r.backlinks || 0) || 0
    const dofollow = r.dofollow == null ? null : Number(r.dofollow)
    if (quality === 'spam') {
      spam += 1
      opportunities.push({
        domain,
        rank,
        backlinks,
        dofollow,
        quality,
        kind: 'cleanup_spam',
        reason: 'Spam-pattern host in inventory — disavow / remove if still live.',
        score: 40 + Math.min(rank, 30),
        firstSeen: r.first_seen,
        source: r.source,
      })
      continue
    }
    if (quality === 'risky') {
      risky += 1
      continue
    }
    relevant += 1
    if (domain.endsWith('.co.il') || domain.endsWith('.org.il') || domain.endsWith('.gov.il') || domain.endsWith('.ac.il')) {
      opportunities.push({
        domain,
        rank,
        backlinks,
        dofollow,
        quality,
        kind: 'locale_authority',
        reason: 'Local IL authority domain already linking — expand with regional content / partner mentions.',
        score: 70 + Math.min(rank, 50) + Math.min(backlinks, 10),
        firstSeen: r.first_seen,
        source: r.source,
      })
    } else if (rank >= 30 && backlinks <= 2) {
      opportunities.push({
        domain,
        rank,
        backlinks,
        dofollow,
        quality,
        kind: 'strengthen',
        reason: `High-rank domain (${rank}) with only ${backlinks} link(s) — pursue additional relevant URLs.`,
        score: 50 + rank + (dofollow ? 10 : 0),
        firstSeen: r.first_seen,
        source: r.source,
      })
    }
  }

  // Nofollow reclaim from raw link rows
  for (const link of links) {
    if (link.dofollow === true) continue
    if (String(link.quality || '') === 'spam') continue
    const domain = String(link.domain_from || '').toLowerCase()
    if (!domain) continue
    const rank = Number(link.rank || 0) || 0
    if (rank < 25) continue
    if (opportunities.some((o) => o.domain === domain && o.kind === 'reclaim_nofollow')) continue
    opportunities.push({
      domain,
      rank,
      backlinks: 1,
      dofollow: 0,
      quality: String(link.quality || 'relevant'),
      kind: 'reclaim_nofollow',
      reason: 'Nofollow from meaningful rank domain — worth a link-type request if relationship exists.',
      score: 35 + Math.min(rank, 40),
      source: link.source,
    })
  }

  opportunities.sort((a, b) => b.score - a.score)
  const topRelevant = refs
    .filter((r) => String(r.quality || 'relevant') === 'relevant')
    .slice()
    .sort((a, b) => (Number(b.rank) || 0) - (Number(a.rank) || 0))
    .slice(0, 20)
    .map((r) => ({
      domain: String(r.domain || ''),
      rank: Number(r.rank || 0) || 0,
      backlinks: Number(r.backlinks || 0) || 0,
      quality: String(r.quality || 'relevant'),
      source: r.source,
    }))

  return {
    opportunities: opportunities.slice(0, 40),
    topRelevant,
    summary: {
      relevant,
      risky,
      spam,
      strengthen: opportunities.filter((o) => o.kind === 'strengthen' || o.kind === 'locale_authority').length,
      cleanup: opportunities.filter((o) => o.kind === 'cleanup_spam').length,
    },
  }
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
  severity?: 'high' | 'medium' | 'low'
  /** Position per landing URL (best-effort, from source rows). */
  positions?: Record<string, number | null>
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
 * Cannibalization detector — run on PRE-MERGE rows (each source row keeps its own URL).
 * Fires when one keyword maps to >= 2 distinct landing URLs across all rows.
 * Severity: high = 2+ URLs on page 1 (pos<=10) or 3+ URLs with pos<=20;
 *           medium = 2 URLs with at least one pos<=20; low = everything else.
 */
export function computeCannibalization(rows: KeywordRow[]): CannibalCluster[] {
  const byKw = new Map<string, KeywordRow[]>()
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row.keyword || '').toLowerCase().trim()
    if (!key) continue
    const arr = byKw.get(key) || []
    arr.push(row)
    byKw.set(key, arr)
  }

  const clusters: CannibalCluster[] = []
  for (const group of byKw.values()) {
    const normUrl = (u: string | null | undefined) =>
      String(u || '').split('?')[0].replace(/\/+$/, '')
    const urlSet = new Map<string, { positions: number[] }>()
    for (const row of group) {
      const u = normUrl(row.url)
      if (!u) continue
      const entry = urlSet.get(u) || { positions: [] }
      if (row.position != null && Number(row.position) > 0) entry.positions.push(Number(row.position))
      urlSet.set(u, entry)
    }
    if (urlSet.size < 2) continue

    const allPositions = group
      .map((g) => (g.position != null && Number(g.position) > 0 ? Number(g.position) : null))
      .filter((p): p is number => p != null)
    const best = allPositions.length ? Math.min(...allPositions) : null
    const page1Urls = [...urlSet.values()].filter((e) => e.positions.some((p) => p <= 10)).length
    const page2Urls = [...urlSet.values()].filter((e) => e.positions.some((p) => p <= 20)).length

    let severity: CannibalCluster['severity'] = 'low'
    if (page1Urls >= 2 || page2Urls >= 3) severity = 'high'
    else if (page2Urls >= 2) severity = 'medium'

    const positions: Record<string, number | null> = {}
    for (const [u, e] of urlSet) positions[u] = e.positions.length ? Math.min(...e.positions) : null

    clusters.push({
      keyword: group[0].keyword,
      urls: [...urlSet.keys()].slice(0, 6),
      bestPosition: best,
      volume: group.reduce((s, g) => Math.max(s, Number(g.volume) || 0), 0) || null,
      sources: [...new Set(group.map((g) => g.source).filter(Boolean))],
      severity,
      positions,
    })
  }

  const sevRank = { high: 0, medium: 1, low: 2 }
  clusters.sort(
    (a, b) =>
      sevRank[a.severity || 'low'] - sevRank[b.severity || 'low'] ||
      (b.volume || 0) - (a.volume || 0) ||
      (a.bestPosition || 999) - (b.bestPosition || 999),
  )
  return clusters.slice(0, 25)
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

export type SerpFeatureStat = {
  feature: string
  label: string
  count: number
  ourTop10: number
  ourTop3: number
  totalVolume: number
  delta: number | null
}

export type SerpFeatureStatsResult = {
  features: SerpFeatureStat[]
  keywordsWithFeatures: number
  keywordsTotal: number
  coveragePct: number
}

const SERP_FEATURE_LABELS: Record<string, string> = {
  ai_overview: 'AI Overview',
  featured_snippet: 'Featured Snippet',
  local_pack: 'Local Pack',
  map: 'Map',
  google_reviews: 'Google Reviews',
  knowledge_graph: 'Knowledge Graph',
  video: 'Video',
  short_videos: 'Short Videos',
  images: 'Images',
  people_also_ask: 'People Also Ask',
  people_also_search: 'People Also Search',
  shopping: 'Shopping',
  news: 'News',
  related_searches: 'Related Searches',
  jobs: 'Jobs',
  events: 'Events',
  recipes: 'Recipes',
  tweets: 'Tweets',
  scholarly_articles: 'Scholarly Articles',
}

const SERP_FEATURE_PRIORITY = [
  'ai_overview',
  'featured_snippet',
  'local_pack',
  'map',
  'google_reviews',
  'knowledge_graph',
  'video',
  'short_videos',
  'images',
  'people_also_ask',
  'people_also_search',
  'shopping',
  'news',
  'related_searches',
]

function featureLabel(feature: string): string {
  return SERP_FEATURE_LABELS[feature] || feature.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Aggregate SERP feature coverage across tracked keywords.
 * Counts how many keywords have each feature on their SERP, our rank strength there,
 * and (optionally) the count delta vs a previous keyword set (snapshot tracking).
 */
export function computeSerpFeatureStats(
  rows: KeywordRow[],
  opts?: { previous?: KeywordRow[] },
): SerpFeatureStatsResult {
  const list = Array.isArray(rows) ? rows : []
  const prevList = Array.isArray(opts?.previous) ? opts!.previous! : []

  const countFor = (setRows: KeywordRow[], feature: string): number => {
    let n = 0
    for (const row of setRows) {
      const feats = Array.isArray(row.serpFeatures) ? row.serpFeatures.map((f) => String(f).toLowerCase()) : []
      if (feats.includes(feature)) n += 1
    }
    return n
  }

  const acc = new Map<string, { count: number; ourTop10: number; ourTop3: number; totalVolume: number }>()
  let keywordsWithFeatures = 0

  for (const row of list) {
    const feats = Array.isArray(row.serpFeatures)
      ? [...new Set(row.serpFeatures.map((f) => String(f).toLowerCase()).filter(Boolean))]
      : []
    if (!feats.length) continue
    keywordsWithFeatures += 1
    const pos = row.position != null && Number(row.position) > 0 ? Number(row.position) : null
    for (const feature of feats) {
      let entry = acc.get(feature)
      if (!entry) {
        entry = { count: 0, ourTop10: 0, ourTop3: 0, totalVolume: 0 }
        acc.set(feature, entry)
      }
      entry.count += 1
      if (pos != null && pos <= 10) entry.ourTop10 += 1
      if (pos != null && pos <= 3) entry.ourTop3 += 1
      entry.totalVolume += Number(row.volume) || 0
    }
  }

  const features: SerpFeatureStat[] = [...acc.entries()].map(([feature, e]) => ({
    feature,
    label: featureLabel(feature),
    count: e.count,
    ourTop10: e.ourTop10,
    ourTop3: e.ourTop3,
    totalVolume: e.totalVolume,
    delta: prevList.length ? e.count - countFor(prevList, feature) : null,
  }))

  features.sort((a, b) => {
    const ai = SERP_FEATURE_PRIORITY.indexOf(a.feature)
    const bi = SERP_FEATURE_PRIORITY.indexOf(b.feature)
    const ap = ai < 0 ? SERP_FEATURE_PRIORITY.length : ai
    const bp = bi < 0 ? SERP_FEATURE_PRIORITY.length : bi
    return ap - bp || b.count - a.count || b.totalVolume - a.totalVolume
  })

  return {
    features,
    keywordsWithFeatures,
    keywordsTotal: list.length,
    coveragePct: list.length ? Math.round((keywordsWithFeatures / list.length) * 1000) / 10 : 0,
  }
}
