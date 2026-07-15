import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataCard } from '@/components/DataCard'
import DataStateBadge from '@/components/DataStateBadge'
import PageSizeSelect from '@/components/PageSizeSelect'
import SyncButton from '@/components/SyncButton'
import { usePageSize } from '@/hooks/usePageSize'
import { useSEO } from '@/contexts/SEOContext'
import { useProject } from '@/contexts/ProjectContext'
import { authFetch } from '@/lib/authToken'
import { refreshCompetitors } from '@/api/client'
import DomainIntegrityBar from '@/components/DomainIntegrityBar'
import { canonicalizeDomain } from '@/lib/domain'
import { filterCompetitorRowsForDomain } from '@/lib/dataIntegrity'
import { useDomainSwitchCleanup } from '@/lib/useDomainQuery'

interface Competitor {
  domain: string
  commonKeywords: number
  traffic: number
  trafficValue: number
  topCountry: string
  relevance: number
  source: string
}

async function fetchCompetitors(domain: string, market?: string | null) {
  const params = new URLSearchParams({ domain })
  if (market?.trim()) params.set('market', market.trim())
  const res = await authFetch(`/api/competitors/aggregated?${params.toString()}`)
  if (!res.ok) throw new Error(`Competitors API failed: ${res.status}`)
  return res.json()
}

function normalizeCompetitors(data: any): Competitor[] {
  // Prefer server-normalized competitors when present
  if (Array.isArray(data?.normalized) && data.normalized.length) {
    return data.normalized.map((row: any) => ({
      domain: row.domain || '',
      commonKeywords: row.commonKeywords ?? 0,
      traffic: row.traffic ?? 0,
      trafficValue: 0,
      topCountry: row.topCountry || '',
      relevance: row.relevance ?? row.competitionLevel ?? 0,
      source: row.source || 'merged',
    }))
  }

  const competitors: Competitor[] = []

  // DataForSEO format
  if (data?.sources?.dataforseo?.tasks?.[0]?.result?.[0]?.items) {
    const items = data.sources.dataforseo.tasks[0].result[0].items
    items.forEach((item: any) => {
      competitors.push({
        domain: item.domain || '',
        commonKeywords: item.full_domain_metrics?.organic?.count || item.intersections || 0,
        traffic: item.full_domain_metrics?.organic?.etv || 0,
        trafficValue: item.full_domain_metrics?.organic?.est_paid_traffic_cost || 0,
        topCountry: item.full_domain_metrics?.organic?.top_country || 'US',
        relevance: item.avg_position || 0,
        source: 'DataForSEO',
      })
    })
  }

  // SEMrush CSV format
  if (data?.sources?.semrush && Array.isArray(data.sources.semrush)) {
    data.sources.semrush.forEach((row: any) => {
      // Accept row-object from parseSemrushCSV or legacy string[]
      if (Array.isArray(row) && row.length >= 4) {
        const existing = competitors.find(c => c.domain === row[0])
        if (!existing) {
          competitors.push({
            domain: row[0] || '',
            commonKeywords: parseInt(row[2]) || 0,
            traffic: parseInt(row[3]) || 0,
            trafficValue: 0,
            topCountry: 'US',
            relevance: parseInt(row[1]) || 0,
            source: 'SEMrush',
          })
        }
      } else if (row && typeof row === 'object') {
        const domain = row.Dn || row.Domain || row.domain || ''
        if (!domain) return
        const existing = competitors.find(c => c.domain === domain)
        if (!existing) {
          competitors.push({
            domain,
            commonKeywords: parseInt(row.Np || row.common || row.Cr || '0', 10) || 0,
            traffic: parseInt(row.Ot || row.Or || row.traffic || '0', 10) || 0,
            trafficValue: 0,
            topCountry: row.topCountry || 'US',
            relevance: parseInt(row.Cr || row.competition || '0', 10) || 0,
            source: 'SEMrush',
          })
        }
      }
    })
  }

  // Exa similar sites
  if (data?.sources?.exa && Array.isArray(data.sources.exa)) {
    data.sources.exa.forEach((item: any) => {
      let domain = ''
      try {
        domain = item.url ? new URL(item.url).hostname : (item.domain || '')
      } catch {
        domain = item.domain || ''
      }
      const existing = competitors.find(c => c.domain === domain)
      if (!existing && domain) {
        competitors.push({
          domain,
          commonKeywords: 0,
          traffic: 0,
          trafficValue: 0,
          topCountry: '',
          relevance: item.score || 0,
          source: 'Exa',
        })
      }
    })
  }

  return competitors
}

export default function CompetitorsPage() {
  const { domain } = useSEO()
  const { activeProject } = useProject()
  useDomainSwitchCleanup(domain)
  const projectMarket = activeProject?.market || null
  const qc = useQueryClient()
  const { pageSize, setPageSize } = usePageSize('competitors')
  const [page, setPage] = useState(1)
  const [syncing, setSyncing] = useState(false)
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['competitors', canonicalizeDomain(domain), projectMarket],
    queryFn: () => fetchCompetitors(canonicalizeDomain(domain), projectMarket),
    enabled: !!canonicalizeDomain(domain),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })

  const competitorsRaw = useMemo(() => normalizeCompetitors(data), [data])
  const competitorsIntegrity = useMemo(
    () => filterCompetitorRowsForDomain(competitorsRaw, domain || ''),
    [competitorsRaw, domain],
  )
  const competitors = competitorsIntegrity.rows
  const activeSources = data?.activeSources || []
  const gaps = Array.isArray(data?.gaps) ? data.gaps : []
  const softDegraded = Array.isArray(data?.softDegraded) ? data.softDegraded : []
  const marketLabel = data?.market?.label || data?.market || null

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<'traffic' | 'commonKeywords' | 'relevance'>('traffic')

  const filtered = useMemo(() => {
    let list = [...competitors]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c => c.domain.toLowerCase().includes(q))
    }
    list.sort((a, b) => b[sortKey] - a[sortKey])
    return list
  }, [competitors, search, sortKey])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  const handleForceSync = async () => {
    if (!domain) return
    setSyncing(true)
    try {
      const fresh = await refreshCompetitors(domain, projectMarket)
      qc.setQueryData(['competitors', canonicalizeDomain(domain), projectMarket], fresh)
    } catch {
      // keep cache
    } finally {
      setSyncing(false)
    }
  }

  const dataState = error ? 'unavailable' : competitors.length > 0 ? (data?.dataState === 'cached' ? 'cached' : 'live') : isLoading ? 'loading' : 'unavailable'

  const summaryCards = [
    { label: 'Competitors', value: competitors.length, color: 'text-fg' },
    { label: 'Data Sources', value: activeSources.length, color: 'text-accent-light' },
    { label: 'Avg Keywords', value: competitors.length ? Math.round(competitors.reduce((s, c) => s + c.commonKeywords, 0) / competitors.length).toLocaleString() : '—', color: 'text-green' },
    { label: 'Top Competitor', value: competitors[0]?.domain || '—', color: 'text-fg' },
  ]

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Competitors</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">Competitor discovery and gap analysis for {domain}</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <SyncButton onClick={handleForceSync} loading={syncing || isFetching} label="Force refresh" loadingLabel="Syncing…" />
          <DataStateBadge state={dataState as any} source={activeSources.join(', ') || 'aggregated'} fetchedAt={data?.fetchedAt || null} />
          <PageSizeSelect value={pageSize} onChange={(n) => { setPageSize(n); setPage(1) }} compact />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {summaryCards.map((card, i) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.05 }} className="bg-bg-card border border-border rounded-xl p-3.5 md:p-5 hover:border-border-light transition-colors card-glow">
            <p className="text-[11px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">{card.label}</p>
            <p className={`text-lg md:text-2xl font-bold mt-1 ${card.color} truncate`}>{card.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Source badges */}
      {(activeSources.length > 0 || softDegraded.length > 0 || marketLabel) && (
        <div className="flex gap-1.5 flex-wrap items-center">
          {marketLabel && (
            <span className="text-[10px] md:text-xs bg-blue-500/15 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded touch-target-reset">Market: {String(marketLabel)}</span>
          )}
          {activeSources.map((src: string) => (
            <span key={src} className="text-[10px] md:text-xs bg-accent/10 text-accent-light border border-accent/20 px-2 py-0.5 rounded touch-target-reset">{src}</span>
          ))}
          {softDegraded.map((src: string) => (
            <span key={`soft-${src}`} className="text-[10px] md:text-xs bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded touch-target-reset">{src} soft-degraded</span>
          ))}
        </div>
      )}

      <DomainIntegrityBar
        activeDomain={domain}
        payloadDomain={data?.canonicalDomain || data?.domain || domain}
        dataState={data?.dataState}
        fetchedAt={data?.fetchedAt}
        fromSnapshot={Boolean(data?.fromSnapshot)}
        rowCount={competitors.length}
        giantsDropped={competitorsIntegrity.giantsDropped + Number(data?.integrity?.giantsDropped || 0)}
        selfDropped={competitorsIntegrity.selfDropped}
      />

      {gaps.length > 0 && (
        <DataCard title="Competitor gap estimates" dataState={dataState as any} fetchedAt={data?.fetchedAt}>
          <div className="space-y-2">
            {gaps.slice(0, 10).map((g: any) => (
              <div key={g.competitor} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-darkest px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{g.competitor}</p>
                  <p className="text-[11px] text-fg-dim mt-0.5 line-clamp-2">{g.note}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-fg-muted">
                    {g.commonKeywords != null && <span>Common KW {Number(g.commonKeywords).toLocaleString()}</span>}
                    {g.competitorTraffic != null && <span>Traffic {Number(g.competitorTraffic).toLocaleString()}</span>}
                    {g.relevance != null && <span>Relevance {Math.round(Number(g.relevance))}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] uppercase tracking-wider text-fg-dim">Missing est.</p>
                  <p className="text-sm font-semibold text-fg">{g.ourMissingEstimate ?? '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </DataCard>
      )}

      {/* Filters */}
      <DataCard title="Competitor Analysis" dataState={dataState} fetchedAt={data ? new Date().toISOString() : undefined}>
        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 mb-4">
          <div className="relative flex-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-dim"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <input type="text" placeholder="Search competitor domain..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent transition-colors" />
          </div>
          <select value={sortKey} onChange={e => setSortKey(e.target.value as any)} className="px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent transition-colors">
            <option value="traffic">Sort by Traffic</option>
            <option value="commonKeywords">Sort by Keywords</option>
            <option value="relevance">Sort by Relevance</option>
          </select>
        </div>

        {isLoading && <div className="animate-pulse space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-white/[0.06] rounded-xl" />)}</div>}
        {error && !competitors.length && (
          <div className="text-center py-8">
            <p className="text-sm text-red-300">Failed to load competitors</p>
            <p className="text-xs text-fg-dim mt-1">{error instanceof Error ? error.message : 'API unavailable'}</p>
            <button onClick={handleForceSync} className="mt-3 px-3 py-1.5 rounded-lg border border-accent/30 text-xs text-accent-light">Retry</button>
          </div>
        )}
        {!isLoading && !error && competitors.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-fg-muted">No competitors found for {domain}</p>
            <p className="text-xs text-fg-dim mt-1">Connect data sources in Settings to discover competitors</p>
          </div>
        )}

        {/* Mobile card view */}
        <div className="md:hidden space-y-3">
          {paginated.map((comp, i) => (
            <div key={comp.domain} className="rounded-xl border border-border bg-bg-darkest p-3.5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-fg">{comp.domain}</p>
                  <p className="text-xs text-fg-dim mt-0.5">{comp.source}</p>
                </div>
                <span className="text-xs text-accent-light">#{(page - 1) * pageSize + i + 1}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div><p className="text-[10px] text-fg-dim">Keywords</p><p className="text-sm font-semibold text-fg">{comp.commonKeywords.toLocaleString()}</p></div>
                <div><p className="text-[10px] text-fg-dim">Traffic</p><p className="text-sm font-semibold text-fg">{comp.traffic.toLocaleString()}</p></div>
                <div><p className="text-[10px] text-fg-dim">Value</p><p className="text-sm font-semibold text-fg">${comp.trafficValue.toLocaleString()}</p></div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table view */}
        <div className="hidden md:block overflow-x-auto table-scroll">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="text-xs font-semibold tracking-wider uppercase text-fg-dim border-b border-border">
                <th className="text-left py-3 px-4">#</th>
                <th className="text-left py-3 px-4">Domain</th>
                <th className="text-right py-3 px-4">Keywords</th>
                <th className="text-right py-3 px-4">Traffic</th>
                <th className="text-right py-3 px-4">Traffic Value</th>
                <th className="text-left py-3 px-4">Source</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((comp, i) => (
                <tr key={comp.domain} className="border-t border-border hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-4 text-fg-dim">{(page - 1) * pageSize + i + 1}</td>
                  <td className="py-3 px-4">
                    <span className="text-fg font-medium">{comp.domain}</span>
                    {comp.topCountry && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-fg-dim">{comp.topCountry}</span>}
                  </td>
                  <td className="py-3 px-4 text-right text-fg-muted">{comp.commonKeywords.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-fg-muted">{comp.traffic.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-fg-muted">${comp.trafficValue.toLocaleString()}</td>
                  <td className="py-3 px-4"><span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent-light">{comp.source}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-border gap-2 flex-wrap">
          <p className="text-[11px] text-fg-dim">
            {filtered.length === 0 ? '0 of 0' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} of ${filtered.length}`}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2.5 py-1.5 rounded-lg text-xs text-fg-muted hover:text-fg disabled:opacity-30">← Prev</button>
            <span className="text-xs text-fg-muted px-2">{page}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-2.5 py-1.5 rounded-lg text-xs text-fg-muted hover:text-fg disabled:opacity-30">Next →</button>
          </div>
        </div>

      </DataCard>
    </div>
  )
}
