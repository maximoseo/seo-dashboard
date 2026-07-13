import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useKeywords } from '../api/client'
import { useSEO } from '@/contexts/SEOContext'
import { useProject } from '@/contexts/ProjectContext'
import DataStateBadge from '@/components/DataStateBadge'
import { normalizeSemrushKeywords, normalizeAhrefsKeywords, normalizeDataForSEOKeywords, formatMetric } from '../api/normalize'
import { exportToCSV, ExportCSVButton } from '@/lib/csvExport'

type SortDir = 'asc' | 'desc'
type SortKey = 'keyword' | 'volume' | 'position' | 'difficulty' | 'cpc' | 'traffic'

interface Keyword {
  keyword: string
  volume: number
  position: number
  change: number
  url: string
  difficulty: number
  cpc: number
  serpFeatures: string[]
  intent: string
  trend: number[]
  traffic: number
}

// Mock data removed — now fetching from API via useKeywords hook

const ITEMS_PER_PAGE = 10

function getDifficultyColor(d: number) {
  if (d < 30) return '#22C55E'
  if (d < 50) return '#4ADE80'
  if (d < 60) return '#F59E0B'
  if (d < 70) return '#F97316'
  return '#EF4444'
}


const serpFeatureLabels: Record<string, string> = {
  snippet: 'Featured Snippet',
  video: 'Video',
  question: 'PAA',
  ai_overview: 'AI Overview',
  shopping: 'Shopping',
  local_pack: 'Local Pack',
  image: 'Images',
}

function MiniSparkline({ data, up }: { data: number[]; up: boolean }) {
  const safeData = data.length >= 2 ? data : [0, 0]
  const max = Math.max(...safeData)
  const min = Math.min(...safeData)
  const range = max - min || 1
  const h = 20
  const w = 60
  const points = safeData.map((v, i) => {
    const x = (i / (safeData.length - 1)) * w
    const y = ((v - min) / range) * (h - 4) + 2
    return `${x},${y}`
  }).join(' ')
  const color = up ? '#22C55E' : '#EF4444'
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="inline-block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function KeywordsPage() {
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('all')
  const [intentFilter, setIntentFilter] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>('position')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)

  const { domain } = useSEO()
  const { activeProject } = useProject()
  const projectMarket = activeProject?.market || null
  const { data: apiData, isLoading, error } = useKeywords(domain, projectMarket)

  // Normalize API data from multiple sources
  const keywords: Keyword[] = useMemo(() => {
    // Prefer server-normalized rows when present (deduped + trend)
    if (Array.isArray(apiData?.normalized) && apiData.normalized.length) {
      return apiData.normalized.map((k: any) => ({
        keyword: k.keyword || '',
        volume: k.volume ?? 0,
        position: k.position ?? 0,
        change: k.previousPosition != null && k.position != null ? (k.previousPosition - k.position) : 0,
        url: k.url ?? '',
        difficulty: k.difficulty ?? 0,
        cpc: k.cpc ?? 0,
        serpFeatures: k.serpFeatures || [],
        intent: k.intent || 'informational',
        trend: [],
        traffic: k.traffic ?? 0,
      }))
    }

    if (!apiData?.sources) return []
    const result: Keyword[] = []
    
    // SEMrush keywords
    if (apiData.sources.semrush) {
      const semrushKw = normalizeSemrushKeywords(apiData.sources.semrush)
      semrushKw.forEach(k => {
        result.push({
          keyword: k.keyword,
          volume: k.volume ?? 0,
          position: k.position ?? 0,
          change: 0,
          url: k.url ?? '',
          difficulty: k.difficulty ?? 0,
          cpc: 0,
          serpFeatures: k.serpFeatures,
          intent: 'informational',
          trend: [],
          traffic: 0,
        })
      })
    }
    
    // Ahrefs keywords
    if (apiData.sources.ahrefs?.keywords) {
      const ahrefsKw = normalizeAhrefsKeywords(apiData.sources.ahrefs)
      ahrefsKw.forEach(k => {
        result.push({
          keyword: k.keyword,
          volume: k.volume ?? 0,
          position: k.position ?? 0,
          change: 0,
          url: k.url ?? '',
          difficulty: k.difficulty ?? 0,
          cpc: 0,
          serpFeatures: k.serpFeatures,
          intent: 'informational',
          trend: [],
          traffic: 0,
        })
      })
    }
    
    // DataForSEO keywords
    if (apiData.sources.dataforseo) {
      const dfsKw = normalizeDataForSEOKeywords(apiData.sources.dataforseo)
      dfsKw.forEach(k => {
        result.push({
          keyword: k.keyword,
          volume: k.volume ?? 0,
          position: k.position ?? 0,
          change: 0,
          url: k.url ?? '',
          difficulty: k.difficulty ?? 0,
          cpc: 0,
          serpFeatures: k.serpFeatures,
          intent: 'informational',
          trend: [],
          traffic: 0,
        })
      })
    }
    
    return result
  }, [apiData])

  const movements = apiData?.movements || null
  const softDegraded = Array.isArray(apiData?.softDegraded) ? apiData.softDegraded : []
  const marketLabel = apiData?.market?.label || null

  const filtered = useMemo(() => {
    let data = [...keywords]
    if (search) data = data.filter(k => k.keyword.toLowerCase().includes(search.toLowerCase()))
    if (posFilter !== 'all') {
      const ranges: Record<string, [number, number]> = { top3: [1,3], top10: [1,10], top50: [1,50], '51-100': [51,100] }
      const [lo, hi] = ranges[posFilter] || [1, 100]
      data = data.filter(k => k.position >= lo && k.position <= hi)
    }
    if (intentFilter !== 'all') data = data.filter(k => k.intent === intentFilter)
    data.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'string' && typeof bv === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
    return data
  }, [search, posFilter, intentFilter, sortKey, sortDir, keywords])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const handleExport = () => {
    const headers = ['Keyword', 'Volume', 'Position', 'Change', 'Difficulty', 'CPC', 'Intent', 'URL']
    const rows = filtered.map(k => [k.keyword, k.volume, k.position, k.change, k.difficulty, k.cpc, k.intent, k.url])
    exportToCSV(headers, rows, `keywords-${domain}-${new Date().toISOString().slice(0,10)}`)
  }

  const SortIcon = ({ col }: { col: SortKey }) => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`inline ml-1 ${sortKey === col ? 'text-accent' : 'text-fg-dim'}`}>
      <path d={sortDir === 'asc' && sortKey === col ? 'M2 6l3-3 3 3' : 'M2 4l3 3 3-3'} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )

  const summaryCards = [
    { label: 'Total Keywords', value: formatMetric(keywords.length), change: '—', color: 'text-blue' },
    { label: 'Top 3', value: keywords.filter(k => k.position <= 3).length.toString(), change: '—', color: 'text-green' },
    { label: 'Top 10', value: keywords.filter(k => k.position <= 10).length.toString(), change: '—', color: 'text-green' },
    { label: 'Top 50', value: keywords.filter(k => k.position <= 50).length.toString(), change: '—', color: 'text-green' },
  ]

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Header with source badges */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Keyword Rankings</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">Track keyword positions across multiple data sources</p>
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          <ExportCSVButton onClick={handleExport} />
          <DataStateBadge state={error ? 'unavailable' : keywords.length > 0 ? 'live' : isLoading ? 'cached' : 'unavailable'} source={domain} />
          {marketLabel && (
            <span className="text-[10px] md:text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 md:px-2 py-0.5 md:py-1 rounded touch-target-reset">Market: {marketLabel}</span>
          )}
          {softDegraded.map((src: string) => (
            <span key={`soft-${src}`} className="text-[10px] md:text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 md:px-2 py-0.5 md:py-1 rounded touch-target-reset">{src} soft</span>
          ))}
          <span className="text-[10px] md:text-xs bg-orange-500/20 text-orange-300 border border-orange-500/30 px-1.5 md:px-2 py-0.5 md:py-1 rounded touch-target-reset">Ahrefs</span>
          <span className="text-[10px] md:text-xs bg-orange-400/20 text-orange-200 border border-orange-400/30 px-1.5 md:px-2 py-0.5 md:py-1 rounded touch-target-reset">SEMrush</span>
          <span className="text-[10px] md:text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 md:px-2 py-0.5 md:py-1 rounded touch-target-reset">DataForSEO</span>
          <span className="text-[10px] md:text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-1.5 md:px-2 py-0.5 md:py-1 rounded touch-target-reset">SE Ranking</span>
        </div>
      </div>

      {/* Keyword movements from normalized server rows */}
      {movements && (movements.improved?.length || movements.declined?.length || movements.newEntries?.length || movements.lost?.length) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { key: 'improved', label: 'Improved', color: 'text-green', rows: movements.improved || [] },
            { key: 'declined', label: 'Declined', color: 'text-red', rows: movements.declined || [] },
            { key: 'newEntries', label: 'New', color: 'text-accent-light', rows: movements.newEntries || [] },
            { key: 'lost', label: 'Lost', color: 'text-amber-300', rows: movements.lost || [] },
          ].map((bucket) => (
            <div key={bucket.key} className="bg-bg-card border border-border rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-2">
                <p className={`text-xs font-semibold uppercase tracking-wider ${bucket.color}`}>{bucket.label}</p>
                <span className="text-xs text-fg-dim">{bucket.rows.length}</span>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-auto">
                {bucket.rows.slice(0, 6).map((row: any) => (
                  <div key={`${bucket.key}-${row.keyword}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-fg">{row.keyword}</span>
                    <span className="text-fg-muted shrink-0">#{row.position ?? '—'}</span>
                  </div>
                ))}
                {!bucket.rows.length && <p className="text-xs text-fg-dim">No rows</p>}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {summaryCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            className="bg-bg-card border border-border rounded-xl p-3.5 md:p-5 hover:border-border-light transition-all card-glow"
          >
            <p className="text-[10px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">{card.label}</p>
            <p className="text-2xl md:text-3xl font-bold text-fg mt-1">{card.value}</p>
            <p className={`text-xs md:text-sm font-medium mt-1 ${card.color}`}>{'\u2191'} {card.change}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="bg-bg-card border border-border rounded-xl p-3 md:p-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
          <div className="relative flex-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-dim">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search keywords..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={posFilter}
              onChange={e => { setPosFilter(e.target.value); setPage(1) }}
              className="flex-1 sm:flex-none px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent transition-colors"
            >
              <option value="all">All Positions</option>
              <option value="top3">Top 3</option>
              <option value="top10">Top 10</option>
              <option value="top50">Top 50</option>
              <option value="51-100">51-100</option>
            </select>
            <select
              value={intentFilter}
              onChange={e => { setIntentFilter(e.target.value); setPage(1) }}
              className="flex-1 sm:flex-none px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent transition-colors"
            >
            <option value="all">All Intents</option>
            <option value="informational">Informational</option>
            <option value="commercial">Commercial</option>
            <option value="transactional">Transactional</option>
            <option value="navigational">Navigational</option>
          </select>
          </div>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="bg-bg-card border border-border rounded-xl overflow-hidden"
      >
        {/* Mobile card view */}
        <div className="md:hidden divide-y divide-border">
          {paginated.map((kw) => (
            <div key={kw.keyword} className="p-3.5 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-sm font-medium text-fg">{kw.keyword}</span>
                  <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    kw.intent === 'informational' ? 'bg-blue-500/15 text-blue-400' :
                    kw.intent === 'commercial' ? 'bg-purple-500/15 text-purple-400' :
                    kw.intent === 'transactional' ? 'bg-green-500/15 text-green-400' :
                    'bg-orange-500/15 text-orange-400'
                  }`}>{kw.intent.charAt(0).toUpperCase()}</span>
                </div>
                <div className="text-right">
                  <span className="text-base font-bold text-fg">#{kw.position}</span>
                  {kw.change !== 0 && (
                    <span className={`ml-1 text-xs font-medium ${kw.change > 0 ? 'text-green' : 'text-red'}`}>
                      {kw.change > 0 ? '\u2191' : '\u2193'}{Math.abs(kw.change)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-fg-muted">
                <span>Vol: {kw.volume.toLocaleString()}</span>
                <span>CPC: ${kw.cpc.toFixed(2)}</span>
                <span className="flex items-center gap-1">
                  KD:
                  <span className="font-medium" style={{ color: getDifficultyColor(kw.difficulty) }}>{kw.difficulty}</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {kw.serpFeatures.slice(0, 3).map(f => (
                    <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent-light font-medium touch-target-reset">
                      {serpFeatureLabels[f] || f}
                    </span>
                  ))}
                </div>
                <MiniSparkline data={kw.trend} up={kw.change >= 0} />
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table view */}
        <div className="hidden md:block overflow-x-auto table-scroll">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-xs font-semibold tracking-wider uppercase text-fg-dim border-b border-border">
                <th className="text-left py-3 px-5 cursor-pointer hover:text-fg transition-colors" onClick={() => handleSort('keyword')}>Keyword <SortIcon col="keyword" /></th>
                <th className="text-right py-3 px-3 cursor-pointer hover:text-fg transition-colors" onClick={() => handleSort('volume')}>Volume <SortIcon col="volume" /></th>
                <th className="text-right py-3 px-3 cursor-pointer hover:text-fg transition-colors" onClick={() => handleSort('position')}>Position <SortIcon col="position" /></th>
                <th className="text-left py-3 px-3">URL</th>
                <th className="text-right py-3 px-3 cursor-pointer hover:text-fg transition-colors" onClick={() => handleSort('difficulty')}>Difficulty <SortIcon col="difficulty" /></th>
                <th className="text-right py-3 px-3 cursor-pointer hover:text-fg transition-colors" onClick={() => handleSort('cpc')}>CPC <SortIcon col="cpc" /></th>
                <th className="text-left py-3 px-3">SERP Features</th>
                <th className="text-right py-3 px-3">Trend</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((kw) => (
                <tr key={kw.keyword} className="border-t border-border hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-5">
                    <span className="text-fg font-medium">{kw.keyword}</span>
                    <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      kw.intent === 'informational' ? 'bg-blue-500/15 text-blue-400' :
                      kw.intent === 'commercial' ? 'bg-purple-500/15 text-purple-400' :
                      kw.intent === 'transactional' ? 'bg-green-500/15 text-green-400' :
                      'bg-orange-500/15 text-orange-400'
                    }`}>{kw.intent.charAt(0).toUpperCase()}</span>
                  </td>
                  <td className="py-3 px-3 text-right text-fg-muted">{kw.volume.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right">
                    <span className="text-fg font-medium">{kw.position}</span>
                    {kw.change !== 0 && (
                      <span className={`ml-1.5 text-xs font-medium ${kw.change > 0 ? 'text-green' : 'text-red'}`}>
                        {kw.change > 0 ? '↑' : '↓'}{Math.abs(kw.change)}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-fg-muted text-xs truncate max-w-[160px]">{kw.url}</td>
                  <td className="py-3 px-3">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${kw.difficulty}%`, backgroundColor: getDifficultyColor(kw.difficulty) }} />
                      </div>
                      <span className="text-xs font-medium w-6 text-right" style={{ color: getDifficultyColor(kw.difficulty) }}>{kw.difficulty}</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right text-fg-muted">${kw.cpc.toFixed(2)}</td>
                  <td className="py-3 px-3">
                    <div className="flex flex-wrap gap-1">
                      {kw.serpFeatures.slice(0, 3).map(f => (
                        <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent-light font-medium">
                          {serpFeatureLabels[f] || f}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <MiniSparkline data={kw.trend} up={kw.change >= 0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!isLoading && filtered.length === 0 && (
          <div className="border-t border-border px-5 py-10 text-center">
            <p className="text-sm font-medium text-fg">No keyword rows available yet</p>
            <p className="mt-1 text-xs text-fg-muted">
              Connect a provider, run a sync, or check Settings. The dashboard no longer shows fake keyword rows as live data.
            </p>
            {error && <p className="mt-2 text-xs text-red-300">{error instanceof Error ? error.message : 'Keyword API unavailable'}</p>}
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 md:px-5 py-3 border-t border-border">
          <p className="text-[11px] md:text-xs text-fg-dim">
            {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-0.5 md:gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 md:px-2.5 py-1.5 rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors touch-target-reset"
            >
              {'\u2190'}
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors touch-target-reset ${
                  page === p ? 'bg-accent text-white' : 'text-fg-muted hover:text-fg hover:bg-white/[0.04]'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 md:px-2.5 py-1.5 rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors touch-target-reset"
            >
              {'\u2192'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
