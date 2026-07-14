import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { usePages, refreshPages } from '@/api/client'
import { useSEO } from '@/contexts/SEOContext'
import { useProject } from '@/contexts/ProjectContext'
import DataStateBadge from '@/components/DataStateBadge'
import PageSizeSelect from '@/components/PageSizeSelect'
import SyncButton from '@/components/SyncButton'
import DomainIntegrityBar from '@/components/DomainIntegrityBar'
import { usePageSize } from '@/hooks/usePageSize'
import { canonicalizeDomain } from '@/lib/domain'
import { filterPageRowsForDomain } from '@/lib/dataIntegrity'
import { useDomainSwitchCleanup } from '@/lib/useDomainQuery'

interface PageRow {
  url: string
  title: string
  status: number
  traffic: number
  keywords: number
  backlinks: number
  score: number
  contentType: string
  lastCrawled: string
  wordCount: number
  loadTime: number
  source?: string
  description?: string
  h1?: string
  onpageIssues?: string[]
}

function getStatusColor(status: number) {
  if (status >= 200 && status < 300) return { bg: 'bg-green/15', text: 'text-green' }
  if (status >= 300 && status < 400) return { bg: 'bg-yellow/15', text: 'text-yellow' }
  return { bg: 'bg-red/15', text: 'text-red' }
}

function getScoreColor(score: number) {
  if (score >= 80) return '#22C55E'
  if (score >= 60) return '#F59E0B'
  return '#EF4444'
}

export default function PagesPage() {
  const { domain } = useSEO()
  const { activeProject } = useProject()
  useDomainSwitchCleanup(domain)
  const market = activeProject?.market || null
  const qc = useQueryClient()
  const { data: apiData, isLoading, error, dataUpdatedAt, isFetching } = usePages(domain, market)
  const { pageSize, setPageSize } = usePageSize('pages')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const pages: PageRow[] = useMemo(() => {
    if (Array.isArray(apiData?.normalized)) {
      return apiData.normalized.map((p: any) => ({
        url: p.url || '',
        title: p.title || p.url || '',
        status: Number(p.status) || 200,
        traffic: Number(p.traffic) || 0,
        keywords: Number(p.keywords) || 0,
        backlinks: Number(p.backlinks) || 0,
        score: Number(p.score) || 0,
        contentType: p.contentType || 'page',
        lastCrawled: p.lastCrawled || (apiData?.fetchedAt || '').slice(0, 10),
        wordCount: Number(p.wordCount) || 0,
        loadTime: Number(p.loadTime) || 0,
        source: p.source,
        description: p.description || '',
        h1: p.h1 || '',
        onpageIssues: Array.isArray(p.onpageIssues) ? p.onpageIssues : [],
      }))
    }
    return []
  }, [apiData])

  const pagesIntegrity = useMemo(() => filterPageRowsForDomain(pages, domain || ''), [pages, domain])
  const safePages = pagesIntegrity.rows

  const filtered = useMemo(() => {
    let list = [...safePages]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((p) => p.url.toLowerCase().includes(q) || p.title.toLowerCase().includes(q))
    }
    if (statusFilter === 'healthy') list = list.filter((p) => p.status >= 200 && p.status < 300)
    if (statusFilter === 'redirect') list = list.filter((p) => p.status >= 300 && p.status < 400)
    if (statusFilter === 'error') list = list.filter((p) => p.status >= 400)
    return list
  }, [safePages, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  const summary = apiData?.summary || {
    total: safePages.length,
    healthy: safePages.filter((p) => p.status >= 200 && p.status < 300).length,
    redirects: safePages.filter((p) => p.status >= 300 && p.status < 400).length,
    errors: safePages.filter((p) => p.status >= 400).length,
    withTraffic: safePages.filter((p) => p.traffic > 0).length,
  }

  const activeSources: string[] = apiData?.activeSources || []
  const softDegraded: string[] = Array.isArray(apiData?.softDegraded) ? apiData.softDegraded : []
  const dataState = error
    ? 'unavailable'
    : isLoading
      ? 'loading'
      : safePages.length
        ? apiData?.dataState === 'cached'
          ? 'cached'
          : 'live'
        : 'unavailable'

  const handleForceSync = async () => {
    if (!domain) return
    setSyncing(true)
    try {
      const fresh = await refreshPages(domain, market)
      qc.setQueryData(['pages', canonicalizeDomain(domain), market?.trim() || ''], fresh)
    } catch {
      // keep existing cache; user sees badge still
    } finally {
      setSyncing(false)
    }
  }

  const cards = [
    { label: 'Top pages', value: summary.total, color: 'text-fg' },
    { label: 'With traffic', value: summary.withTraffic ?? safePages.filter((p) => p.traffic > 0).length, color: 'text-green' },
    { label: 'With on-page', value: summary.withOnpage ?? safePages.filter((p) => p.wordCount > 0 || p.h1 || (p.onpageIssues?.length || 0) > 0).length, color: 'text-accent-light' },
    { label: 'Redirects', value: summary.redirects, color: 'text-yellow' },
    { label: 'Errors', value: summary.errors, color: 'text-red' },
  ]

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Top Pages</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">
            Live organic pages for {domain} — SEMrush + DataForSEO + Ahrefs + On-Page technical fields
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          <SyncButton onClick={handleForceSync} loading={syncing || isFetching} label="Force refresh" loadingLabel="Syncing…" />
          <DataStateBadge
            state={dataState as any}
            source={activeSources.join(', ') || domain}
            fetchedAt={apiData?.fetchedAt || (dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : null)}
          />
          {activeSources.map((s: string) => (
            <span key={s} className="text-[10px] md:text-xs bg-accent/10 text-accent-light border border-accent/20 px-1.5 py-0.5 rounded">
              {s}
            </span>
          ))}
          {softDegraded.map((s: string) => (
            <span key={`soft-${s}`} className="text-[10px] md:text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded">
              {s} soft-degraded
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
        rowCount={safePages.length}
        foreignDropped={pagesIntegrity.foreignDropped + Number(apiData?.integrity?.foreignRowsDropped || 0)}
      />

      {softDegraded.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-100">
          <p className="font-semibold">Provider soft-degrade</p>
          <p className="mt-1 text-xs md:text-sm text-amber-100/90">
            {softDegraded.join(', ')} hit auth/quota/rate limits — remaining sources still shown.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.04 }}
            className="bg-bg-card border border-border rounded-xl p-3.5 md:p-5 card-glow"
          >
            <p className="text-[10px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">{card.label}</p>
            <p className={`text-2xl md:text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="bg-bg-card border border-border rounded-xl p-3 md:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
          <input
            type="text"
            placeholder="Search URL or title…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-full flex-1 px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent"
          />
          <div className="flex gap-2 items-center flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className="px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent"
            >
              <option value="all">All statuses</option>
              <option value="healthy">2xx healthy</option>
              <option value="redirect">3xx redirect</option>
              <option value="error">4xx/5xx error</option>
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

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-bg-card border border-border rounded-xl overflow-hidden"
      >
        {isLoading && (
          <div className="p-4 space-y-3 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-white/[0.06] rounded-xl" />
            ))}
          </div>
        )}

        {!isLoading && error && !safePages.length && (
          <div className="text-center py-10 px-4">
            <p className="text-sm text-red-300">Failed to load pages</p>
            <p className="text-xs text-fg-dim mt-1">{error instanceof Error ? error.message : 'API unavailable'}</p>
            <button onClick={handleForceSync} className="mt-3 px-3 py-1.5 rounded-lg border border-accent/30 text-xs text-accent-light">
              Retry with live sync
            </button>
          </div>
        )}

        {!isLoading && !error && safePages.length === 0 && (
          <div className="text-center py-10 px-4">
            <p className="text-sm text-fg-muted">No page inventory yet for {domain}</p>
            <p className="text-xs text-fg-dim mt-1">Run Keyword sync first (for URL rollup) or Force refresh to pull SEMrush / DataForSEO pages</p>
            <button onClick={handleForceSync} className="mt-3 px-3 py-1.5 rounded-lg border border-accent/30 text-xs text-accent-light">
              Force refresh
            </button>
          </div>
        )}

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-border">
          {paginated.map((p) => {
            const sc = getStatusColor(p.status)
            return (
              <div key={p.url} className="p-3.5 space-y-2">
                <p className="text-sm font-medium text-fg truncate">{p.url}</p>
                <p className="text-[11px] text-fg-dim truncate">{p.title}</p>
                <div className="flex items-center gap-3 text-xs text-fg-muted flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded ${sc.bg} ${sc.text}`}>{p.status}</span>
                  <span>Traffic: {p.traffic ? p.traffic.toLocaleString() : '—'}</span>
                  <span>KWs: {p.keywords || '—'}</span>
                  <span>BL: {p.backlinks}</span>
                  {p.wordCount > 0 && <span>Words: {p.wordCount}</span>}
                  {p.h1 && <span className="truncate max-w-[140px]">H1: {p.h1}</span>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto table-scroll">
          <table className="w-full text-sm min-w-[980px]">
            <thead>
              <tr className="text-xs font-semibold tracking-wider uppercase text-fg-dim border-b border-border">
                <th className="text-left py-3 px-5">URL</th>
                <th className="text-center py-3 px-3">Status</th>
                <th className="text-right py-3 px-3">Traffic</th>
                <th className="text-right py-3 px-3">Keywords</th>
                <th className="text-right py-3 px-3">Backlinks</th>
                <th className="text-right py-3 px-3">Words</th>
                <th className="text-right py-3 px-3">Score</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((p) => {
                const sc = getStatusColor(p.status)
                const isExpanded = expandedUrl === p.url
                return (
                  <tr key={p.url} className="border-t border-border hover:bg-white/[0.02]">
                    <td className="py-3 px-5" colSpan={isExpanded ? 7 : 1}>
                      {!isExpanded ? (
                        <button type="button" className="text-left w-full" onClick={() => setExpandedUrl(p.url)}>
                          <p className="text-fg font-medium truncate max-w-[320px]">{p.url}</p>
                          <p className="text-xs text-fg-dim truncate max-w-[320px] mt-0.5">{p.title}</p>
                        </button>
                      ) : (
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-fg font-medium">{p.url}</p>
                              <p className="text-xs text-fg-dim mt-0.5">{p.title}</p>
                            </div>
                            <button type="button" className="text-xs text-accent" onClick={() => setExpandedUrl(null)}>
                              Close
                            </button>
                          </div>
                          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <p className="text-[10px] uppercase text-fg-dim">Last seen</p>
                              <p className="text-sm text-fg">{p.lastCrawled || '—'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-fg-dim">Type</p>
                              <p className="text-sm text-fg capitalize">{p.contentType}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-fg-dim">Source</p>
                              <p className="text-sm text-fg">{p.source || '—'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-fg-dim">Backlinks</p>
                              <p className="text-sm text-fg">{p.backlinks}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-fg-dim">H1</p>
                              <p className="text-sm text-fg">{p.h1 || '—'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-fg-dim">Meta description</p>
                              <p className="text-sm text-fg line-clamp-2">{p.description || '—'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-fg-dim">Word count</p>
                              <p className="text-sm text-fg">{p.wordCount || '—'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-fg-dim">Load time</p>
                              <p className="text-sm text-fg">{p.loadTime ? `${Math.round(p.loadTime)}ms` : '—'}</p>
                            </div>
                            <div className="md:col-span-2">
                              <p className="text-[10px] uppercase text-fg-dim">On-page checks</p>
                              <p className="text-sm text-fg">
                                {(p.onpageIssues || []).slice(0, 6).join(', ') || '—'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                    {!isExpanded && (
                      <>
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${sc.bg} ${sc.text}`}>{p.status}</span>
                        </td>
                        <td className="py-3 px-3 text-right text-fg-muted">{p.traffic > 0 ? p.traffic.toLocaleString() : '—'}</td>
                        <td className="py-3 px-3 text-right text-fg-muted">{p.keywords || '—'}</td>
                        <td className="py-3 px-3 text-right text-fg-muted">{p.backlinks}</td>
                        <td className="py-3 px-3 text-right text-fg-muted">{p.wordCount || '—'}</td>
                        <td className="py-3 px-3">
                          {p.score > 0 ? (
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, p.score)}%`, backgroundColor: getScoreColor(p.score) }} />
                              </div>
                              <span className="text-xs font-medium w-6 text-right" style={{ color: getScoreColor(p.score) }}>
                                {p.score}
                              </span>
                            </div>
                          ) : (
                            <span className="text-fg-dim text-xs text-right block">—</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 md:px-5 py-3 border-t border-border gap-2 flex-wrap">
          <p className="text-[11px] md:text-xs text-fg-dim">
            {filtered.length === 0 ? '0 of 0' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} of ${filtered.length}`}
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
              disabled={page === 1}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-white/[0.04] disabled:opacity-30"
            >
              ← Prev
            </button>
            <span className="text-xs text-fg-muted px-2">
              {page}/{totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-white/[0.04] disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </div>
      </motion.div>
      <AnimatePresence />
    </div>
  )
}
