import { useState, useMemo, useEffect, Fragment, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { useKeywords, refreshKeywords } from '../api/client'
import { useSEO } from '@/contexts/SEOContext'
import { useProject } from '@/contexts/ProjectContext'
import DataStateBadge from '@/components/DataStateBadge'
import DomainIntegrityBar from '@/components/DomainIntegrityBar'
import PageSizeSelect from '@/components/PageSizeSelect'
import SyncButton from '@/components/SyncButton'
import { usePageSize } from '@/hooks/usePageSize'
import { normalizeSemrushKeywords, normalizeAhrefsKeywords, normalizeDataForSEOKeywords, formatMetric } from '../api/normalize'
import { exportToCSV, ExportCSVButton } from '@/lib/csvExport'
import { canonicalizeDomain } from '@/lib/domain'
import { filterKeywordRowsForDomain } from '@/lib/dataIntegrity'
import { useDomainSwitchCleanup } from '@/lib/useDomainQuery'

type SortDir = 'asc' | 'desc'
type SortKey = 'keyword' | 'volume' | 'position' | 'difficulty' | 'cpc' | 'traffic' | 'value'

const FEATURE_SHORT: Record<string, string> = {
  ai_overview: 'AI',
  featured_snippet: 'FS',
  local_pack: 'LP',
  map: 'Map',
  google_reviews: 'GR',
  knowledge_graph: 'KG',
  video: 'Vid',
  short_videos: 'SVid',
  images: 'Img',
  people_also_ask: 'PAA',
  people_also_search: 'PAS',
  shopping: 'Shop',
  news: 'News',
  related_searches: 'Rel',
}

function featureShort(feature: string): string {
  return FEATURE_SHORT[feature.toLowerCase()] || feature.slice(0, 5)
}

type ProviderKey = 'semrush' | 'ahrefs' | 'dataforseo' | 'serpstat' | 'keywords_everywhere'

interface Keyword {
  keyword: string
  volume: number
  position: number
  previousPosition: number | null
  change: number
  url: string
  difficulty: number
  cpc: number
  serpFeatures: string[]
  intent: string
  traffic: number
  source: string
  sourcePositions: Partial<Record<ProviderKey, number | null>>
  volumeBySource: Partial<Record<ProviderKey, number | null>>
  trend: 'up' | 'down' | 'stable' | 'new' | 'lost' | null
  estimatedValue: number
}

const PROVIDER_META: Record<ProviderKey, { label: string; short: string; tone: string }> = {
  semrush: { label: 'SEMrush', short: 'SM', tone: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  ahrefs: { label: 'Ahrefs', short: 'AH', tone: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  dataforseo: { label: 'DataForSEO', short: 'DF', tone: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  serpstat: { label: 'Serpstat', short: 'SS', tone: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  keywords_everywhere: { label: 'Keywords Everywhere', short: 'KE', tone: 'bg-pink-500/15 text-pink-300 border-pink-500/30' },
}

const PROVIDER_KEYS: ProviderKey[] = ['semrush', 'ahrefs', 'dataforseo', 'serpstat', 'keywords_everywhere']

function getDifficultyColor(d: number) {
  if (d < 30) return '#22C55E'
  if (d < 50) return '#4ADE80'
  if (d < 60) return '#F59E0B'
  if (d < 70) return '#F97316'
  return '#EF4444'
}

function intentTone(intent: string) {
  if (intent === 'commercial') return 'bg-purple-500/15 text-purple-300 border-purple-500/30'
  if (intent === 'transactional') return 'bg-green-500/15 text-green-300 border-green-500/30'
  if (intent === 'navigational') return 'bg-orange-500/15 text-orange-300 border-orange-500/30'
  return 'bg-blue-500/15 text-blue-300 border-blue-500/30'
}

function guessIntent(keyword: string, cpc: number, volume: number): string {
  const k = keyword.toLowerCase()
  if (/(^|\s)(brand|שם|official|רשמי)/i.test(k) || k.split(' ').length === 1 && volume > 5000) return 'navigational'
  if (/(buy|price|cost|coupon|order|זול|מחיר|לקנות|הזמנה|מבצע|מימון)/i.test(k) || cpc >= 2.5) return 'transactional'
  if (/(best|vs|review|compare|top|השוואה|מומלץ|ביקורת|שירות)/i.test(k) || cpc >= 1) return 'commercial'
  return 'informational'
}

function rankBucket(pos: number) {
  if (!pos || pos <= 0) return { label: '—', tone: 'text-fg-dim' }
  if (pos <= 3) return { label: 'Top 3', tone: 'text-emerald-300' }
  if (pos <= 10) return { label: 'Page 1', tone: 'text-green' }
  if (pos <= 20) return { label: 'Page 2', tone: 'text-lime-300' }
  if (pos <= 50) return { label: 'Page 3-5', tone: 'text-amber-300' }
  return { label: '50+', tone: 'text-fg-muted' }
}

function PositionChip({ value, label }: { value: number | null | undefined; label?: string }) {
  if (value == null || value <= 0) {
    return (
      <span className="inline-flex min-w-[2rem] items-center justify-center rounded-md border border-border bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-fg-dim">
        —
      </span>
    )
  }
  const tone =
    value <= 3 ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
    value <= 10 ? 'bg-green-500/15 text-green-300 border-green-500/30' :
    value <= 20 ? 'bg-lime-500/15 text-lime-300 border-lime-500/30' :
    value <= 50 ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
    'bg-white/[0.04] text-fg-muted border-border'
  return (
    <span
      title={label ? `${label}: #${value}` : `#${value}`}
      className={`inline-flex min-w-[2rem] items-center justify-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}
    >
      #{value}
    </span>
  )
}

function SourceBadge({ source }: { source: string }) {
  const parts = source.split('+').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return (
    <div className="flex flex-wrap gap-1">
      {parts.map((p) => {
        const meta = PROVIDER_META[p as ProviderKey]
        return (
          <span
            key={p}
            className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${meta?.tone || 'bg-accent/10 text-accent-light border-accent/20'}`}
            title={meta?.label || p}
          >
            {meta?.short || p.slice(0, 2).toUpperCase()}
          </span>
        )
      })}
    </div>
  )
}

function VolumeCell({ volume, bySource }: { volume: number; bySource: Partial<Record<ProviderKey, number | null>> }) {
  const entries = PROVIDER_KEYS
    .map((k) => ({ k, v: bySource[k] }))
    .filter((x) => x.v != null && x.v! > 0) as Array<{ k: ProviderKey; v: number }>
  return (
    <div className="text-right">
      <p className="text-sm font-semibold tabular-nums text-fg">{volume > 0 ? volume.toLocaleString() : '—'}</p>
      {entries.length > 0 && (
        <p className="mt-0.5 text-[10px] text-fg-dim leading-snug">
          {entries.slice(0, 3).map((e) => `${PROVIDER_META[e.k].short} ${e.v.toLocaleString()}`).join(' · ')}
        </p>
      )}
    </div>
  )
}

function MultiRankRow({ positions }: { positions: Partial<Record<ProviderKey, number | null>> }) {
  const present = PROVIDER_KEYS.filter((k) => positions[k] != null && Number(positions[k]) > 0)
  if (!present.length) {
    return <span className="text-xs text-fg-dim">No provider ranks</span>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {present.map((k) => (
        <div key={k} className="flex items-center gap-1">
          <span className={`text-[9px] font-semibold px-1 py-0.5 rounded border ${PROVIDER_META[k].tone}`}>
            {PROVIDER_META[k].short}
          </span>
          <PositionChip value={positions[k]} label={PROVIDER_META[k].label} />
        </div>
      ))}
    </div>
  )
}

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const apply = () => setDesktop(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return desktop
}

function normalizeProviderKey(raw?: string | null): ProviderKey | null {
  const s = String(raw || '').toLowerCase().replace(/\s+/g, '_')
  if (s.includes('semrush')) return 'semrush'
  if (s.includes('ahrefs')) return 'ahrefs'
  if (s.includes('dataforseo') || s === 'dfs') return 'dataforseo'
  if (s.includes('serpstat')) return 'serpstat'
  if (s.includes('keywords_everywhere') || s.includes('everywhere')) return 'keywords_everywhere'
  return null
}

export default function KeywordsPage() {
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('all')
  const [intentFilter, setIntentFilter] = useState('all')
  const [volumeFilter, setVolumeFilter] = useState<'all' | 'has' | '1k' | '100'>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | ProviderKey>('all')
  const [sortKey, setSortKey] = useState<SortKey>('position')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [syncing, setSyncing] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [oppFilter, setOppFilter] = useState<'all' | 'striking_distance' | 'quick_win' | 'value_upside' | 'decay'>('all')
  const [intelTab, setIntelTab] = useState<'opportunities' | 'pages' | 'cannibalization'>('opportunities')
  const { pageSize, setPageSize } = usePageSize('keywords')
  const qc = useQueryClient()
  const isDesktop = useIsDesktop()

  const { domain } = useSEO()
  const { activeProject } = useProject()
  useDomainSwitchCleanup(domain)
  const projectMarket = activeProject?.market || null
  const { data: apiData, isLoading, error, dataUpdatedAt, isFetching } = useKeywords(domain, projectMarket)

  const handleForceSync = async () => {
    if (!domain) return
    setSyncing(true)
    try {
      const fresh = await refreshKeywords(domain, projectMarket)
      qc.setQueryData(['keywords', canonicalizeDomain(domain), projectMarket?.trim() || ''], fresh)
    } catch {
      // keep existing cache on network fail
    } finally {
      setSyncing(false)
    }
  }

  const keywords: Keyword[] = useMemo(() => {
    const mapRow = (k: any): Keyword => {
      const volume = Number(k.volume ?? 0) || 0
      const position = Number(k.position ?? 0) || 0
      const previousPosition = k.previousPosition != null ? Number(k.previousPosition) : null
      const cpc = Number(k.cpc ?? 0) || 0
      const traffic = Number(k.traffic ?? 0) || 0
      const sourcePositions: Partial<Record<ProviderKey, number | null>> = { ...(k.sourcePositions || {}) }
      const volumeBySource: Partial<Record<ProviderKey, number | null>> = { ...(k.volumeBySource || {}) }
      // ensure primary source appears in maps
      const tens = String(k.source || '').split('+')
      for (const s of tens) {
        const pk = normalizeProviderKey(s)
        if (!pk) continue
        if (sourcePositions[pk] == null && position > 0 && tens.length === 1) sourcePositions[pk] = position
        if (volumeBySource[pk] == null && volume > 0 && tens.length === 1) volumeBySource[pk] = volume
      }
      const change =
        previousPosition != null && position > 0
          ? previousPosition - position
          : k.change != null
            ? Number(k.change) || 0
            : k.trend === 'up'
              ? 1
              : k.trend === 'down'
                ? -1
                : 0
      const intent = k.intent || guessIntent(String(k.keyword || ''), cpc, volume)
      return {
        keyword: k.keyword || '',
        volume,
        position,
        previousPosition,
        change,
        url: k.url ?? '',
        difficulty: Number(k.difficulty ?? 0) || 0,
        cpc,
        serpFeatures: Array.isArray(k.serpFeatures) ? k.serpFeatures : [],
        intent,
        traffic,
        source: k.source || 'merged',
        sourcePositions,
        volumeBySource,
        trend: k.trend ?? null,
        estimatedValue: Math.round((traffic || volume * 0.1) * Math.max(cpc, 0.2)),
      }
    }

    if (Array.isArray(apiData?.normalized) && apiData.normalized.length) {
      return apiData.normalized.map(mapRow).filter((k: Keyword) => k.keyword)
    }

    if (!apiData?.sources) return []
    const result: Keyword[] = []
    if (apiData.sources.semrush) {
      normalizeSemrushKeywords(apiData.sources.semrush).forEach((k) => {
        result.push(mapRow({ ...k, source: 'semrush', sourcePositions: { semrush: k.position }, volumeBySource: { semrush: k.volume } }))
      })
    }
    if (apiData.sources.ahrefs) {
      normalizeAhrefsKeywords(apiData.sources.ahrefs).forEach((k) => {
        result.push(mapRow({ ...k, source: 'ahrefs', sourcePositions: { ahrefs: k.position }, volumeBySource: { ahrefs: k.volume } }))
      })
    }
    if (apiData.sources.dataforseo) {
      normalizeDataForSEOKeywords(apiData.sources.dataforseo).forEach((k) => {
        result.push(mapRow({ ...k, source: 'dataforseo', sourcePositions: { dataforseo: k.position }, volumeBySource: { dataforseo: k.volume } }))
      })
    }
    return result
  }, [apiData])

  const keywordsIntegrity = useMemo(() => filterKeywordRowsForDomain(keywords, domain || ''), [keywords, domain])
  const safeKeywords = keywordsIntegrity.rows

  const movements = apiData?.movements || null
  const intel = (apiData as any)?.intel || null
  const serpFeatureStats = (apiData as any)?.serpFeatureStats || null
  const activeSources: string[] = Array.isArray(apiData?.activeSources) ? apiData.activeSources : []
  const softDegraded = Array.isArray(apiData?.softDegraded) ? apiData.softDegraded : []
  const marketLabel = apiData?.market?.label || null
  const lastFetchedLabel = apiData?.fetchedAt
    ? new Date(apiData.fetchedAt).toLocaleString()
    : dataUpdatedAt
      ? new Date(dataUpdatedAt).toLocaleString()
      : null

  // Client fallback intel if older cache lacks server intel payload
  const clientIntel = useMemo(() => {
    if (intel?.positionDistribution) return intel
    const rows = safeKeywords.map((k) => ({
      keyword: k.keyword,
      position: k.position || null,
      previousPosition: k.previousPosition,
      volume: k.volume || null,
      difficulty: k.difficulty || null,
      traffic: k.traffic || null,
      url: k.url || null,
      cpc: k.cpc || null,
      trend: k.trend,
      source: k.source,
    }))
    // minimal local derivation for distribution only
    const ranked = rows.filter((r) => r.position && r.position > 0)
    const buckets = [
      { key: '1-3', label: 'Top 3', min: 1, max: 3 },
      { key: '4-10', label: '4–10', min: 4, max: 10 },
      { key: '11-20', label: '11–20', min: 11, max: 20 },
      { key: '21-50', label: '21–50', min: 21, max: 50 },
      { key: '51-100', label: '51–100', min: 51, max: 100 },
    ].map((b) => {
      const inBucket = ranked.filter((r) => Number(r.position) >= b.min && Number(r.position) <= b.max)
      return {
        ...b,
        count: inBucket.length,
        volume: inBucket.reduce((s, r) => s + (Number(r.volume) || 0), 0),
        traffic: inBucket.reduce((s, r) => s + (Number(r.traffic) || 0), 0),
        share: ranked.length ? inBucket.length / ranked.length : 0,
      }
    })
    return {
      positionDistribution: buckets,
      opportunities: ranked
        .filter((r) => Number(r.position) >= 11 && Number(r.position) <= 20 && (Number(r.volume) || 0) >= 20)
        .slice(0, 20)
        .map((r) => ({
          keyword: r.keyword,
          position: Number(r.position),
          previousPosition: r.previousPosition,
          volume: r.volume,
          traffic: r.traffic,
          difficulty: r.difficulty,
          cpc: r.cpc,
          url: r.url,
          source: r.source,
          score: Number(r.volume) || 0,
          kind: 'striking_distance' as const,
          reason: `Pos #${r.position} — striking distance (client fallback)`,
        })),
      cannibalization: [],
      pageClusters: [],
      kpis: {
        tracked: rows.length,
        ranked: ranked.length,
        top3: ranked.filter((r) => Number(r.position) <= 3).length,
        top10: ranked.filter((r) => Number(r.position) <= 10).length,
        top20: ranked.filter((r) => Number(r.position) <= 20).length,
        strikingDistance: ranked.filter((r) => Number(r.position) >= 11 && Number(r.position) <= 20).length,
        cannibalized: 0,
        totalVolume: rows.reduce((s, r) => s + (Number(r.volume) || 0), 0),
        totalTraffic: rows.reduce((s, r) => s + (Number(r.traffic) || 0), 0),
      },
    }
  }, [intel, safeKeywords])

  const filteredOpps = useMemo(() => {
    const rows = clientIntel?.opportunities || []
    if (oppFilter === 'all') return rows
    return rows.filter((o: any) => o.kind === oppFilter)
  }, [clientIntel, oppFilter])

  const availableSources = useMemo(() => {
    const set = new Set<ProviderKey>()
    for (const k of safeKeywords) {
      for (const p of PROVIDER_KEYS) {
        if (k.sourcePositions[p] != null || k.volumeBySource[p] != null || k.source.includes(p)) set.add(p)
      }
    }
    return PROVIDER_KEYS.filter((p) => set.has(p) || activeSources.some((s) => normalizeProviderKey(s) === p))
  }, [safeKeywords, activeSources])

  const filtered = useMemo(() => {
    let data = [...safeKeywords]
    if (search) {
      const q = search.toLowerCase()
      data = data.filter((k) =>
        k.keyword.toLowerCase().includes(q) ||
        k.url.toLowerCase().includes(q) ||
        k.source.toLowerCase().includes(q),
      )
    }
    if (posFilter !== 'all') {
      const ranges: Record<string, [number, number]> = { top3: [1, 3], top10: [1, 10], top20: [1, 20], top50: [1, 50], '51-100': [51, 100] }
      const [lo, hi] = ranges[posFilter] || [1, 100]
      data = data.filter((k) => k.position >= lo && k.position <= hi)
    }
    if (intentFilter !== 'all') data = data.filter((k) => k.intent === intentFilter)
    if (volumeFilter === 'has') data = data.filter((k) => k.volume > 0)
    if (volumeFilter === '100') data = data.filter((k) => k.volume >= 100)
    if (volumeFilter === '1k') data = data.filter((k) => k.volume >= 1000)
    if (sourceFilter !== 'all') {
      data = data.filter((k) =>
        k.sourcePositions[sourceFilter] != null ||
        k.volumeBySource[sourceFilter] != null ||
        k.source.includes(sourceFilter),
      )
    }
    data.sort((a, b) => {
      const pick = (row: Keyword) => {
        if (sortKey === 'value') return row.estimatedValue
        return row[sortKey]
      }
      const av = pick(a)
      const bv = pick(b)
      if (typeof av === 'string' && typeof bv === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      // empty ranks sink when ascending positions
      if (sortKey === 'position') {
        const ap = a.position > 0 ? a.position : sortDir === 'asc' ? 9999 : -1
        const bp = b.position > 0 ? b.position : sortDir === 'asc' ? 9999 : -1
        return sortDir === 'asc' ? ap - bp : bp - ap
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
    return data
  }, [search, posFilter, intentFilter, volumeFilter, sourceFilter, sortKey, sortDir, safeKeywords])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageSafe = Math.min(page, totalPages)
  const paginated = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize)

  useEffect(() => {
    setPage(1)
    setExpanded(null)
  }, [domain])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'keyword' ? 'asc' : key === 'position' ? 'asc' : 'desc')
    }
  }

  const handleExport = () => {
    const headers = [
      'Keyword', 'Best Position', 'SEMrush #', 'Ahrefs #', 'DataForSEO #', 'Serpstat #',
      'Search Volume', 'Vol SEMrush', 'Vol Ahrefs', 'Vol DataForSEO', 'Vol KE',
      'Traffic', 'Difficulty', 'CPC', 'Est. Value', 'Intent', 'URL', 'Sources', 'Domain',
    ]
    const rows = filtered.map((k) => [
      k.keyword,
      k.position || '',
      k.sourcePositions.semrush ?? '',
      k.sourcePositions.ahrefs ?? '',
      k.sourcePositions.dataforseo ?? '',
      k.sourcePositions.serpstat ?? '',
      k.volume || '',
      k.volumeBySource.semrush ?? '',
      k.volumeBySource.ahrefs ?? '',
      k.volumeBySource.dataforseo ?? '',
      k.volumeBySource.keywords_everywhere ?? '',
      k.traffic || '',
      k.difficulty || '',
      k.cpc || '',
      k.estimatedValue || '',
      k.intent,
      k.url,
      k.source,
      domain || '',
    ])
    exportToCSV(headers, rows, `keywords-${domain}-${new Date().toISOString().slice(0, 10)}`)
  }

  const SortBtn = ({ col, children, align = 'left' }: { col: SortKey; children: ReactNode; align?: 'left' | 'right' }) => (
    <button
      type="button"
      onClick={() => handleSort(col)}
      className={`group inline-flex items-center gap-1 text-xs font-semibold tracking-wider uppercase text-fg-dim hover:text-fg transition-colors ${align === 'right' ? 'ml-auto' : ''}`}
    >
      {children}
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={sortKey === col ? 'text-accent' : 'text-fg-dim opacity-50'}>
        <path d={sortDir === 'asc' && sortKey === col ? 'M2 6l3-3 3 3' : 'M2 4l3 3 3-3'} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )

  const withVolume = safeKeywords.filter((k) => k.volume > 0).length
  const totalVolume = safeKeywords.reduce((s, k) => s + (k.volume || 0), 0)
  const totalTraffic = safeKeywords.reduce((s, k) => s + (k.traffic || 0), 0)
  const avgCpc = (() => {
    const priced = safeKeywords.filter((k) => k.cpc > 0)
    if (!priced.length) return 0
    return priced.reduce((s, k) => s + k.cpc, 0) / priced.length
  })()
  const multiTracked = safeKeywords.filter((k) => Object.values(k.sourcePositions).filter((v) => v != null).length >= 2).length

  const summaryCards = [
    { label: 'Tracked keywords', value: formatMetric(safeKeywords.length), hint: `${filtered.length} after filters`, color: 'text-fg' },
    { label: 'With search volume', value: formatMetric(withVolume), hint: totalVolume ? `${totalVolume.toLocaleString()} SV sum` : 'Enrich via force refresh', color: 'text-sky-300' },
    { label: 'Top 10 ranks', value: safeKeywords.filter((k) => k.position > 0 && k.position <= 10).length.toString(), hint: `${safeKeywords.filter((k) => k.position > 0 && k.position <= 3).length} in top 3`, color: 'text-green' },
    { label: 'Est. organic traffic', value: formatMetric(Math.round(totalTraffic)), hint: avgCpc ? `Avg CPC $${avgCpc.toFixed(2)}` : 'Traffic from providers', color: 'text-accent-light' },
    { label: 'Multi-tool overlap', value: multiTracked.toString(), hint: 'Ranked in 2+ tools', color: 'text-violet-300' },
  ]

  const dataState = error
    ? 'unavailable'
    : isLoading
      ? 'loading'
      : safeKeywords.length
        ? apiData?.dataState === 'cached'
          ? 'cached'
          : 'live'
        : 'unavailable'

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-base md:text-lg font-semibold text-fg">Keyword intelligence</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">
            Deep rank + search volume for <span className="font-medium text-fg">{domain || '—'}</span>
            {activeProject?.name ? ` · ${activeProject.name}` : ''}
            {marketLabel ? ` · ${marketLabel}` : ''}
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          <ExportCSVButton onClick={handleExport} />
          <SyncButton onClick={handleForceSync} loading={syncing || isFetching} label="Deep refresh" loadingLabel="Pulling ranks…" />
          <DataStateBadge
            state={dataState as any}
            source={activeSources.join(', ') || domain}
            fetchedAt={apiData?.fetchedAt || (dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : null)}
          />
          {activeSources.map((src: string) => (
            <span key={`src-${src}`} className="text-[10px] md:text-xs bg-accent/10 text-accent-light border border-accent/20 px-1.5 md:px-2 py-0.5 md:py-1 rounded">
              {src}
            </span>
          ))}
          {softDegraded.map((src: string) => (
            <span key={`soft-${src}`} className="text-[10px] md:text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 md:px-2 py-0.5 md:py-1 rounded">
              {src} soft-degraded
            </span>
          ))}
        </div>
      </div>

      <DomainIntegrityBar
        activeDomain={domain}
        payloadDomain={apiData?.canonicalDomain || apiData?.domain || domain}
        dataState={apiData?.dataState}
        fetchedAt={apiData?.fetchedAt || (dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : null)}
        fromSnapshot={Boolean(apiData?.fromSnapshot)}
        rowCount={safeKeywords.length}
        foreignDropped={keywordsIntegrity.foreignDropped + Number(apiData?.integrity?.foreignRowsDropped || 0)}
        extra={lastFetchedLabel ? `synced ${lastFetchedLabel}` : undefined}
      />

      {softDegraded.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-100">
          <p className="font-semibold">Provider soft-degrade</p>
          <p className="mt-1 text-xs md:text-sm text-amber-100/90">
            {softDegraded.join(', ')} hit auth/quota limits — ranks still shown from remaining live tools.
          </p>
        </div>
      )}

      {movements && (movements.improved?.length || movements.declined?.length || movements.newEntries?.length || movements.lost?.length) ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { key: 'improved', label: 'Improved', color: 'text-green', rows: movements.improved || [] },
            { key: 'declined', label: 'Declined', color: 'text-red', rows: movements.declined || [] },
            { key: 'newEntries', label: 'New', color: 'text-accent-light', rows: movements.newEntries || [] },
            { key: 'lost', label: 'Lost', color: 'text-amber-300', rows: movements.lost || [] },
          ].map((bucket) => (
            <div key={bucket.key} className="bg-bg-card border border-border rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-2">
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${bucket.color}`}>{bucket.label}</p>
                <span className="text-xs text-fg-dim tabular-nums">{bucket.rows.length}</span>
              </div>
              <div className="space-y-1.5 max-h-32 overflow-auto">
                {bucket.rows.slice(0, 5).map((row: any) => (
                  <div key={`${bucket.key}-${row.keyword}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-fg">{row.keyword}</span>
                    <span className="text-fg-muted shrink-0 tabular-nums">#{row.position ?? '—'}</span>
                  </div>
                ))}
                {!bucket.rows.length && <p className="text-xs text-fg-dim">No movement yet</p>}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Rank distribution — Ahrefs/SEMrush style */}
      {clientIntel?.positionDistribution?.length ? (
        <div className="bg-bg-card border border-border rounded-xl p-3.5 md:p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-fg-muted">Position distribution</p>
              <p className="text-[11px] text-fg-dim mt-0.5">
                {clientIntel.kpis?.ranked || 0} ranked · striking distance {clientIntel.kpis?.strikingDistance || 0}
                {clientIntel.kpis?.cannibalized ? ` · cannibal ${clientIntel.kpis.cannibalized}` : ''}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {clientIntel.positionDistribution.map((b: any) => (
              <button
                key={b.key}
                type="button"
                onClick={() => {
                  if (b.key === '1-3') setPosFilter('top3')
                  else if (b.key === '4-10') setPosFilter('top10')
                  else if (b.key === '11-20') setPosFilter('top20')
                  else if (b.key === '21-50') setPosFilter('top50')
                  else setPosFilter('51-100')
                  setPage(1)
                }}
                className="rounded-xl border border-border bg-bg-darkest p-3 text-left hover:border-accent/40 transition-colors"
              >
                <p className="text-[10px] uppercase tracking-wider text-fg-dim">{b.label}</p>
                <p className="text-xl font-bold tabular-nums text-fg mt-1">{b.count}</p>
                <div className="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${Math.max(4, Math.round((b.share || 0) * 100))}%` }} />
                </div>
                <p className="text-[10px] text-fg-dim mt-1.5 tabular-nums">
                  {Math.round((b.share || 0) * 100)}% · SV {formatMetric(Math.round(b.volume || 0))}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* SERP feature tracking — AI Overview, Local Pack, Featured Snippet… with snapshot deltas */}
      {serpFeatureStats?.features?.length ? (
        <div className="bg-bg-card border border-border rounded-xl p-3.5 md:p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-fg-muted">SERP features</p>
              <p className="text-[11px] text-fg-dim mt-0.5">
                {serpFeatureStats.keywordsWithFeatures} of {serpFeatureStats.keywordsTotal} tracked keywords have SERP features · coverage {serpFeatureStats.coveragePct}%
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
            {serpFeatureStats.features.map((f: any) => (
              <div key={f.feature} className="rounded-xl border border-border bg-bg-darkest p-3">
                <div className="flex items-start justify-between gap-1.5">
                  <p className="text-[11px] font-medium text-fg leading-tight">{f.label}</p>
                  {f.delta != null && f.delta !== 0 && (
                    <span className={`text-[10px] font-semibold tabular-nums shrink-0 ${f.delta > 0 ? 'text-green' : 'text-red'}`}>
                      {f.delta > 0 ? '▲' : '▼'}{Math.abs(f.delta)}
                    </span>
                  )}
                </div>
                <p className="text-xl font-bold tabular-nums text-fg mt-1">{f.count}</p>
                <p className="text-[10px] text-fg-dim mt-1 tabular-nums">
                  we rank top10 in {f.ourTop10}{f.ourTop3 > 0 ? ` · top3 in ${f.ourTop3}` : ''}
                </p>
                {f.totalVolume > 0 && (
                  <p className="text-[10px] text-fg-dim tabular-nums">SV {formatMetric(Math.round(f.totalVolume))}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Opportunities / page clusters / cannibalization */}
      {(filteredOpps.length > 0 || clientIntel?.pageClusters?.length || clientIntel?.cannibalization?.length) ? (
        <div className="bg-bg-card border border-border rounded-xl p-3.5 md:p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-fg-muted">Keyword opportunities</p>
              <p className="text-[11px] text-fg-dim mt-0.5">Derived from live ranks only — no invented SERP volumes</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([
                ['opportunities', 'Opportunities'],
                ['pages', 'Landing pages'],
                ['cannibalization', 'Cannibalization'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setIntelTab(id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] border transition-colors ${
                    intelTab === id
                      ? 'border-accent/40 bg-accent/15 text-accent-light'
                      : 'border-border text-fg-muted hover:text-fg'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {intelTab === 'opportunities' && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['all', 'All'],
                  ['striking_distance', 'Striking distance'],
                  ['quick_win', 'Quick wins'],
                  ['value_upside', 'Value upside'],
                  ['decay', 'Decay'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setOppFilter(id)}
                    className={`px-2 py-1 rounded-md text-[10px] border ${
                      oppFilter === id
                        ? 'border-accent/40 bg-accent/10 text-accent-light'
                        : 'border-border text-fg-dim'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="space-y-2 max-h-80 overflow-auto">
                {filteredOpps.slice(0, 15).map((o: any) => (
                  <div key={`${o.kind}-${o.keyword}`} className="rounded-xl border border-border bg-bg-darkest px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-fg truncate">{o.keyword}</p>
                        <p className="text-[11px] text-fg-dim mt-0.5 line-clamp-2">{o.reason}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] uppercase tracking-wider text-fg-dim">{String(o.kind).replace('_', ' ')}</span>
                        <p className="text-sm font-semibold tabular-nums text-fg">#{o.position}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-fg-muted">
                      {o.volume != null && <span>SV {formatMetric(o.volume)}</span>}
                      {o.traffic != null && <span>Traffic {formatMetric(o.traffic)}</span>}
                      {o.cpc != null && Number(o.cpc) > 0 && <span>CPC ${Number(o.cpc).toFixed(2)}</span>}
                      {o.url && (
                        <a href={o.url.startsWith('http') ? o.url : `https://${o.url}`} target="_blank" rel="noopener noreferrer" className="text-accent truncate max-w-[220px]">
                          {String(o.url).replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
                {!filteredOpps.length && <p className="text-xs text-fg-dim py-2">No opportunities in this bucket for the current inventory.</p>}
              </div>
            </>
          )}

          {intelTab === 'pages' && (
            <div className="space-y-2 max-h-80 overflow-auto">
              {(clientIntel?.pageClusters || []).slice(0, 12).map((p: any) => (
                <div key={p.url} className="rounded-xl border border-border bg-bg-darkest px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={p.url.startsWith('http') ? p.url : `https://${p.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-fg truncate hover:text-accent"
                    >
                      {String(p.url).replace(/^https?:\/\//, '')}
                    </a>
                    <span className="text-xs tabular-nums text-fg-muted shrink-0">{p.keywords} KW</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-fg-dim">
                    <span>Best #{p.bestPosition ?? '—'}</span>
                    <span>Top10 {p.top10}</span>
                    <span>SV {formatMetric(p.volume || 0)}</span>
                    <span>Traffic {formatMetric(p.traffic || 0)}</span>
                  </div>
                  {!!p.sampleKeywords?.length && (
                    <p className="mt-1 text-[11px] text-fg-muted truncate">e.g. {p.sampleKeywords.join(' · ')}</p>
                  )}
                </div>
              ))}
              {!clientIntel?.pageClusters?.length && (
                <p className="text-xs text-fg-dim py-2">No landing-page clusters yet — need keywords with target URLs.</p>
              )}
            </div>
          )}

          {intelTab === 'cannibalization' && (
            <div className="space-y-2 max-h-80 overflow-auto">
              {(clientIntel?.cannibalization || []).slice(0, 12).map((c: any) => {
                const sev = c.severity || 'low'
                const sevTone =
                  sev === 'high'
                    ? 'border-red/40 bg-red/10 text-red'
                    : sev === 'medium'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      : 'border-border bg-white/[0.04] text-fg-muted'
                return (
                  <div key={c.keyword} className="rounded-xl border border-border bg-bg-darkest px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-fg">{c.keyword}</p>
                        <p className="text-[11px] text-fg-dim mt-0.5">
                          Best #{c.bestPosition ?? '—'}
                          {c.volume != null ? ` · SV ${formatMetric(c.volume)}` : ''}
                          {c.sources?.length ? ` · ${c.sources.join(', ')}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${sevTone}`}>{sev}</span>
                        <span className="text-xs tabular-nums text-amber-300">{c.urls?.length || 0} URLs</span>
                      </div>
                    </div>
                    <ul className="mt-1.5 space-y-0.5">
                      {(c.urls || []).slice(0, 4).map((u: string) => (
                        <li key={u} className="flex items-center justify-between gap-2 text-[11px] text-fg-muted">
                          <span className="truncate">{u.replace(/^https?:\/\//, '')}</span>
                          {c.positions?.[u] != null && (
                            <span className="tabular-nums text-fg-dim shrink-0">#{c.positions[u]}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
              {!clientIntel?.cannibalization?.length && (
                <p className="text-xs text-fg-dim py-2">
                  No multi-URL cannibalization signals detected in the merged inventory.
                </p>
              )}
            </div>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
        {summaryCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.04 }}
            className="bg-bg-card border border-border rounded-xl p-3.5 md:p-4 card-glow"
          >
            <p className="text-[10px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">{card.label}</p>
            <p className={`text-2xl md:text-3xl font-bold mt-1 tabular-nums ${card.color}`}>{card.value}</p>
            <p className="text-[11px] text-fg-dim mt-1">{card.hint}</p>
          </motion.div>
        ))}
      </div>

      {availableSources.length > 0 && (
        <div className="rounded-xl border border-border bg-bg-card p-3 md:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-dim mb-2">Rank coverage by tool</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {availableSources.map((p) => {
              const counted = safeKeywords.filter((k) => k.sourcePositions[p] != null && Number(k.sourcePositions[p]) > 0).length
              const volHits = safeKeywords.filter((k) => k.volumeBySource[p] != null && Number(k.volumeBySource[p]) > 0).length
              return (
                <div key={p} className="rounded-lg border border-border bg-bg-darkest px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${PROVIDER_META[p].tone}`}>{PROVIDER_META[p].label}</span>
                  </div>
                  <p className="mt-2 text-lg font-bold tabular-nums text-fg">{counted}</p>
                  <p className="text-[11px] text-fg-dim">ranked · {volHits} with volume</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="bg-bg-card border border-border rounded-xl p-3 md:p-4">
        <div className="flex flex-col gap-2.5">
          <div className="relative">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-dim">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search keyword, URL or source…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <select
              value={posFilter}
              onChange={(e) => {
                setPosFilter(e.target.value)
                setPage(1)
              }}
              className="px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent"
            >
              <option value="all">All positions</option>
              <option value="top3">Top 3</option>
              <option value="top10">Top 10 / page 1</option>
              <option value="top20">Top 20</option>
              <option value="top50">Top 50</option>
              <option value="51-100">51–100</option>
            </select>
            <select
              value={volumeFilter}
              onChange={(e) => {
                setVolumeFilter(e.target.value as any)
                setPage(1)
              }}
              className="px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent"
            >
              <option value="all">Any search volume</option>
              <option value="has">Has volume</option>
              <option value="100">Volume ≥ 100</option>
              <option value="1k">Volume ≥ 1,000</option>
            </select>
            <select
              value={intentFilter}
              onChange={(e) => {
                setIntentFilter(e.target.value)
                setPage(1)
              }}
              className="px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent"
            >
              <option value="all">All intents</option>
              <option value="informational">Informational</option>
              <option value="commercial">Commercial</option>
              <option value="transactional">Transactional</option>
              <option value="navigational">Navigational</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value as any)
                setPage(1)
              }}
              className="px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent"
            >
              <option value="all">All tools</option>
              {availableSources.map((p) => (
                <option key={p} value={p}>{PROVIDER_META[p].label}</option>
              ))}
            </select>
            <select
              value={`${sortKey}:${sortDir}`}
              onChange={(e) => {
                const [k, d] = e.target.value.split(':') as [SortKey, SortDir]
                setSortKey(k)
                setSortDir(d)
                setPage(1)
              }}
              className="px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent md:hidden"
            >
              <option value="position:asc">Sort: best rank</option>
              <option value="volume:desc">Sort: volume ↓</option>
              <option value="traffic:desc">Sort: traffic ↓</option>
              <option value="difficulty:asc">Sort: easiest KD</option>
              <option value="cpc:desc">Sort: CPC ↓</option>
              <option value="value:desc">Sort: est. value ↓</option>
              <option value="keyword:asc">Sort: A–Z</option>
            </select>
            <PageSizeSelect
              value={pageSize}
              onChange={(n) => {
                setPageSize(n)
                setPage(1)
              }}
              compact
            />
          </div>
        </div>
      </div>

      <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
        {isLoading && (
          <div className="p-4 space-y-3 animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-white/[0.05]" />
            ))}
          </div>
        )}

        {/* Mobile / tablet cards */}
        <div className={`${isDesktop ? 'md:hidden' : ''} divide-y divide-border`}>
          {!isLoading && paginated.map((kw) => {
            const open = expanded === kw.keyword
            const bucket = rankBucket(kw.position)
            return (
              <div key={kw.keyword} className="p-3.5 sm:p-4">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setExpanded(open ? null : kw.keyword)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-fg leading-snug break-words">{kw.keyword}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${intentTone(kw.intent)}`}>
                          {kw.intent}
                        </span>
                        <SourceBadge source={kw.source} />
                        {kw.serpFeatures.slice(0, 5).map((f) => (
                          <span
                            key={f}
                            title={f.replace(/_/g, ' ')}
                            className="text-[9px] px-1 py-0.5 rounded border border-purple-400/30 bg-purple-500/10 text-purple-300 font-medium"
                          >
                            {featureShort(f)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold tabular-nums text-fg">{kw.position > 0 ? `#${kw.position}` : '—'}</p>
                      <p className={`text-[10px] font-medium ${bucket.tone}`}>{bucket.label}</p>
                      {kw.change !== 0 && (
                        <p className={`text-xs font-medium mt-0.5 ${kw.change > 0 ? 'text-green' : 'text-red'}`}>
                          {kw.change > 0 ? '↑' : '↓'}{Math.abs(kw.change)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border border-border bg-bg-darkest px-2 py-2">
                      <p className="text-[9px] uppercase tracking-wider text-fg-dim">Volume</p>
                      <p className="text-sm font-semibold tabular-nums text-fg">{kw.volume > 0 ? kw.volume.toLocaleString() : '—'}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-bg-darkest px-2 py-2">
                      <p className="text-[9px] uppercase tracking-wider text-fg-dim">Traffic</p>
                      <p className="text-sm font-semibold tabular-nums text-fg">{kw.traffic > 0 ? Math.round(kw.traffic).toLocaleString() : '—'}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-bg-darkest px-2 py-2">
                      <p className="text-[9px] uppercase tracking-wider text-fg-dim">CPC</p>
                      <p className="text-sm font-semibold tabular-nums text-fg">{kw.cpc > 0 ? `$${kw.cpc.toFixed(2)}` : '—'}</p>
                    </div>
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 space-y-3 border-t border-border pt-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-fg-dim mb-1.5">Position by tool</p>
                          <MultiRankRow positions={kw.sourcePositions} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg border border-border bg-bg-darkest p-2.5">
                            <p className="text-[10px] uppercase text-fg-dim">Difficulty</p>
                            <p className="mt-1 font-semibold" style={{ color: getDifficultyColor(kw.difficulty) }}>
                              {kw.difficulty || '—'}
                            </p>
                          </div>
                          <div className="rounded-lg border border-border bg-bg-darkest p-2.5">
                            <p className="text-[10px] uppercase text-fg-dim">Est. value</p>
                            <p className="mt-1 font-semibold text-fg">{kw.estimatedValue > 0 ? `$${kw.estimatedValue.toLocaleString()}` : '—'}</p>
                          </div>
                        </div>
                        <VolumeCell volume={kw.volume} bySource={kw.volumeBySource} />
                        {kw.url ? (
                          <a
                            href={kw.url.startsWith('http') ? kw.url : `https://${kw.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-xs text-accent hover:text-accent-light break-all"
                          >
                            {kw.url}
                          </a>
                        ) : (
                          <p className="text-xs text-fg-dim">No landing URL from providers</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto table-scroll">
          <table className="w-full text-sm min-w-[1080px]">
            <thead>
              <tr className="text-xs font-semibold tracking-wider uppercase text-fg-dim border-b border-border bg-bg-darkest/40">
                <th className="text-left py-3 px-4 sticky left-0 bg-bg-card z-10"><SortBtn col="keyword">Keyword</SortBtn></th>
                <th className="text-right py-3 px-3"><SortBtn col="position" align="right">Best rank</SortBtn></th>
                <th className="text-left py-3 px-3">By tool</th>
                <th className="text-right py-3 px-3"><SortBtn col="volume" align="right">Search vol</SortBtn></th>
                <th className="text-right py-3 px-3"><SortBtn col="traffic" align="right">Traffic</SortBtn></th>
                <th className="text-right py-3 px-3"><SortBtn col="difficulty" align="right">KD</SortBtn></th>
                <th className="text-right py-3 px-3"><SortBtn col="cpc" align="right">CPC</SortBtn></th>
                <th className="text-right py-3 px-3"><SortBtn col="value" align="right">Value</SortBtn></th>
                <th className="text-left py-3 px-3">Landing URL</th>
                <th className="text-left py-3 px-3">Sources</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && paginated.map((kw) => {
                const open = expanded === kw.keyword
                return (
                  <Fragment key={kw.keyword}>
                    <tr
                      className="border-t border-border hover:bg-white/[0.02] transition-colors cursor-pointer"
                      onClick={() => setExpanded(open ? null : kw.keyword)}
                    >
                      <td className="py-3 px-4 sticky left-0 bg-bg-card z-10 max-w-[240px]">
                        <p className="font-medium text-fg leading-snug break-words">{kw.keyword}</p>
                        <span className={`mt-1 inline-flex text-[10px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${intentTone(kw.intent)}`}>
                          {kw.intent}
                        </span>
                        {kw.change !== 0 && (
                          <span className={`ml-1.5 text-[11px] font-medium ${kw.change > 0 ? 'text-green' : 'text-red'}`}>
                            {kw.change > 0 ? '↑' : '↓'}{Math.abs(kw.change)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex flex-col items-end gap-0.5">
                          <PositionChip value={kw.position > 0 ? kw.position : null} />
                          <span className={`text-[10px] ${rankBucket(kw.position).tone}`}>{rankBucket(kw.position).label}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <MultiRankRow positions={kw.sourcePositions} />
                      </td>
                      <td className="py-3 px-3">
                        <VolumeCell volume={kw.volume} bySource={kw.volumeBySource} />
                      </td>
                      <td className="py-3 px-3 text-right text-fg-muted tabular-nums">
                        {kw.traffic > 0 ? Math.round(kw.traffic).toLocaleString() : '—'}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-14 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, kw.difficulty)}%`, backgroundColor: getDifficultyColor(kw.difficulty) }} />
                          </div>
                          <span className="text-xs font-medium w-6 text-right tabular-nums" style={{ color: getDifficultyColor(kw.difficulty) }}>
                            {kw.difficulty || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right text-fg-muted tabular-nums">{kw.cpc > 0 ? `$${kw.cpc.toFixed(2)}` : '—'}</td>
                      <td className="py-3 px-3 text-right text-fg tabular-nums font-medium">{kw.estimatedValue > 0 ? `$${kw.estimatedValue.toLocaleString()}` : '—'}</td>
                      <td className="py-3 px-3 max-w-[180px]">
                        {kw.url ? (
                          <a
                            href={kw.url.startsWith('http') ? kw.url : `https://${kw.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-accent hover:text-accent-light truncate block"
                            title={kw.url}
                          >
                            {kw.url.replace(/^https?:\/\//, '')}
                          </a>
                        ) : (
                          <span className="text-xs text-fg-dim">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <SourceBadge source={kw.source} />
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-t border-border/50 bg-bg-darkest/40">
                        <td colSpan={10} className="px-4 py-3">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
                            <div className="rounded-lg border border-border bg-bg-card p-3">
                              <p className="text-[10px] uppercase tracking-wider text-fg-dim mb-2">Tool ranks</p>
                              <MultiRankRow positions={kw.sourcePositions} />
                            </div>
                            <div className="rounded-lg border border-border bg-bg-card p-3">
                              <p className="text-[10px] uppercase tracking-wider text-fg-dim mb-2">Search volume by tool</p>
                              <VolumeCell volume={kw.volume} bySource={kw.volumeBySource} />
                            </div>
                            <div className="rounded-lg border border-border bg-bg-card p-3 space-y-1.5">
                              <p className="text-[10px] uppercase tracking-wider text-fg-dim">Landing / context</p>
                              <p className="text-fg break-all">{kw.url || 'No URL from providers'}</p>
                              <p className="text-fg-muted">Sources: {kw.source}</p>
                              {kw.previousPosition != null && (
                                <p className="text-fg-muted">Previous: #{kw.previousPosition} · Delta: {kw.change > 0 ? '+' : ''}{kw.change}</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        {!isLoading && filtered.length === 0 && (
          <div className="border-t border-border px-5 py-10 text-center">
            <p className="text-sm font-medium text-fg">
              {safeKeywords.length === 0
                ? `No keyword inventory yet for ${domain || 'this domain'}`
                : 'No keywords match the current filters'}
            </p>
            <p className="mt-1 text-xs text-fg-muted max-w-md mx-auto">
              Use Deep refresh to pull SEMrush, Ahrefs, DataForSEO, Serpstat and Keywords Everywhere ranks + search volume live for this project only.
            </p>
            {error && <p className="mt-2 text-xs text-red-300">{error instanceof Error ? error.message : 'Keyword API unavailable'}</p>}
            <button onClick={handleForceSync} className="mt-3 px-3 py-1.5 rounded-lg border border-accent/30 text-xs text-accent-light">
              Deep refresh now
            </button>
          </div>
        )}

        <div className="flex items-center justify-between px-4 md:px-5 py-3 border-t border-border gap-2 flex-wrap">
          <p className="text-[11px] md:text-xs text-fg-dim">
            {filtered.length === 0
              ? '0 of 0'
              : `${(pageSafe - 1) * pageSize + 1}–${Math.min(pageSafe * pageSize, filtered.length)} of ${filtered.length}`}
            {safeKeywords.length !== filtered.length ? ` · ${safeKeywords.length} total for domain` : ''}
          </p>
          <div className="flex items-center gap-1">
            <PageSizeSelect
              className="hidden sm:inline-flex mr-2"
              value={pageSize}
              onChange={(n) => {
                setPageSize(n)
                setPage(1)
              }}
              compact
            />
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pageSafe === 1}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-white/[0.04] disabled:opacity-30"
            >
              ← Prev
            </button>
            <span className="text-xs text-fg-muted px-2 tabular-nums">{pageSafe}/{totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={pageSafe >= totalPages}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-white/[0.04] disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
