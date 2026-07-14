import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DataCard } from '@/components/DataCard'
import DataStateBadge from '@/components/DataStateBadge'
import PageSizeSelect from '@/components/PageSizeSelect'
import SyncButton from '@/components/SyncButton'
import { usePageSize } from '@/hooks/usePageSize'
import { useSEO } from '@/contexts/SEOContext'
import { useProject } from '@/contexts/ProjectContext'
import { useAhrefs } from '@/contexts/AhrefsContext'
import { useBacklinksAgg, refreshBacklinks } from '@/api/client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { exportToCSV, ExportCSVButton } from '@/lib/csvExport'

interface Backlink {
  url_from?: string
  domain_from?: string
  url_to?: string
  rank?: number
  dofollow?: boolean
  anchor?: string
  first_seen?: string
  source?: string
}

interface RefDomain {
  domain: string
  rank: number
  backlinks: number
  dofollow: number | null
  first_seen?: string
  last_seen?: string
  source?: string
}

const SOURCE_LABELS: Record<string, string> = {
  ahrefs: 'Ahrefs',
  semrush: 'SEMrush',
  dataforseo: 'DataForSEO',
  serpstat: 'Serpstat',
  morningscore: 'Morningscore',
  unknown: 'Unknown',
}

function normalizeSource(raw?: string | null) {
  return String(raw || 'unknown').toLowerCase().replace(/\s+/g, '')
}

function sourceLabel(raw?: string | null) {
  const key = normalizeSource(raw)
  return SOURCE_LABELS[key] || raw || 'Unknown'
}

export default function BacklinksPage() {
  const { domain } = useSEO()
  const { activeProject } = useProject()
  const market = activeProject?.market || null
  const { domainRating, backlinksStats, loading: ahrefsLoading } = useAhrefs()
  const qc = useQueryClient()
  const { data, isLoading, error, isFetching, dataUpdatedAt } = useBacklinksAgg(domain, market)
  const { pageSize, setPageSize } = usePageSize('backlinks')
  const [page, setPage] = useState(1)
  const [syncing, setSyncing] = useState(false)
  const [viewMode, setViewMode] = useState<'links' | 'refdomains'>('links')
  const [filter, setFilter] = useState<'all' | 'dofollow' | 'nofollow'>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const backlinks: Backlink[] = useMemo(() => {
    if (Array.isArray(data?.normalized) && data.normalized.length) {
      return data.normalized.map((b: any) => ({
        url_from: b.url_from || b.sourceUrl || b.urlFrom || '',
        domain_from: b.domain_from || b.sourceDomain || b.domain || '',
        url_to: b.url_to || b.targetUrl || '',
        rank: Number(b.rank ?? b.domainRating ?? b.ascore ?? 0) || 0,
        dofollow: b.dofollow ?? b.isDofollow ?? true,
        anchor: b.anchor || b.anchorText || '',
        first_seen: b.first_seen || b.firstSeen || '',
        source: normalizeSource(b.source),
      }))
    }
    // Fallback legacy nested DFS related format
    const items = data?.sources?.dataforseo?.tasks?.[0]?.result?.[0]?.items
    if (Array.isArray(items)) {
      return items.map((b: any) => ({
        url_from: b.url_from,
        domain_from: b.domain_from,
        url_to: b.url_to,
        rank: b.rank,
        dofollow: b.dofollow,
        anchor: b.anchor,
        first_seen: b.first_seen,
        source: 'dataforseo',
      }))
    }
    return []
  }, [data])

  const refdomains: RefDomain[] = useMemo(() => {
    if (Array.isArray(data?.refdomains) && data.refdomains.length) {
      return data.refdomains.map((r: any) => ({
        domain: String(r.domain || '').replace(/^www\./, ''),
        rank: Number(r.rank || 0) || 0,
        backlinks: Number(r.backlinks || 0) || 0,
        dofollow: r.dofollow == null ? null : Number(r.dofollow) || 0,
        first_seen: r.first_seen || '',
        last_seen: r.last_seen || '',
        source: normalizeSource(r.source),
      }))
    }

    // Derive from link rows if server payload lacks refdomains
    const map = new Map<string, RefDomain>()
    for (const bl of backlinks) {
      const d = String(bl.domain_from || '').replace(/^www\./, '').toLowerCase()
      if (!d) continue
      const key = `${d}|${normalizeSource(bl.source)}`
      const prev = map.get(key)
      if (!prev) {
        map.set(key, {
          domain: d,
          rank: Number(bl.rank || 0) || 0,
          backlinks: 1,
          dofollow: bl.dofollow ? 1 : 0,
          first_seen: bl.first_seen || '',
          last_seen: '',
          source: normalizeSource(bl.source),
        })
      } else {
        prev.backlinks += 1
        prev.rank = Math.max(prev.rank, Number(bl.rank || 0) || 0)
        if (bl.dofollow) prev.dofollow = Number(prev.dofollow || 0) + 1
      }
    }
    return Array.from(map.values()).sort((a, b) => b.rank - a.rank || b.backlinks - a.backlinks)
  }, [data, backlinks])

  const sourceOptions = useMemo(() => {
    const set = new Set<string>()
    for (const bl of backlinks) if (bl.source) set.add(normalizeSource(bl.source))
    for (const rd of refdomains) if (rd.source) set.add(normalizeSource(rd.source))
    for (const s of data?.activeSources || []) set.add(normalizeSource(s))
    return Array.from(set).filter(Boolean).sort()
  }, [backlinks, refdomains, data])

  const summary = data?.summary || {
    total: backlinks.length,
    dofollow: backlinks.filter((b) => b.dofollow).length,
    nofollow: backlinks.filter((b) => !b.dofollow).length,
    refDomains: new Set(refdomains.map((r) => r.domain)).size,
  }

  const filteredLinks = useMemo(() => {
    let list = [...backlinks]
    if (filter === 'dofollow') list = list.filter((bl) => bl.dofollow)
    if (filter === 'nofollow') list = list.filter((bl) => !bl.dofollow)
    if (sourceFilter !== 'all') list = list.filter((bl) => normalizeSource(bl.source) === sourceFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (bl) =>
          (bl.domain_from || '').toLowerCase().includes(q) ||
          (bl.anchor || '').toLowerCase().includes(q) ||
          (bl.url_from || '').toLowerCase().includes(q),
      )
    }
    return list
  }, [backlinks, filter, sourceFilter, search])

  const filteredRefDomains = useMemo(() => {
    let list = [...refdomains]
    if (sourceFilter !== 'all') list = list.filter((rd) => normalizeSource(rd.source) === sourceFilter)
    if (filter === 'dofollow') list = list.filter((rd) => (rd.dofollow ?? 1) > 0)
    if (filter === 'nofollow') list = list.filter((rd) => (rd.dofollow ?? 1) === 0)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((rd) => rd.domain.toLowerCase().includes(q))
    }
    return list
  }, [refdomains, sourceFilter, filter, search])

  const activeListLength = viewMode === 'links' ? filteredLinks.length : filteredRefDomains.length
  const totalPages = Math.max(1, Math.ceil(activeListLength / pageSize))
  const pageSafe = Math.min(page, totalPages)
  const paginatedLinks = filteredLinks.slice((pageSafe - 1) * pageSize, pageSafe * pageSize)
  const paginatedRefDomains = filteredRefDomains.slice((pageSafe - 1) * pageSize, pageSafe * pageSize)

  const anchorMap: Record<string, number> = {}
  for (const bl of backlinks) {
    const anchor = bl.anchor || 'No anchor'
    anchorMap[anchor] = (anchorMap[anchor] || 0) + 1
  }
  const anchorData = Object.entries(anchorMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name: name.slice(0, 20), count }))

  const handleExport = () => {
    if (viewMode === 'refdomains') {
      const headers = ['Referring Domain', 'Rank', 'Backlinks', 'Dofollow links', 'Source', 'First Seen', 'Last Seen']
      const rows = filteredRefDomains.map((rd) => [
        rd.domain,
        rd.rank || '',
        rd.backlinks || '',
        rd.dofollow ?? '',
        sourceLabel(rd.source),
        rd.first_seen || '',
        rd.last_seen || '',
      ])
      exportToCSV(headers, rows, `refdomains-${domain}-${new Date().toISOString().slice(0, 10)}`)
      return
    }
    const headers = ['Source Domain', 'URL From', 'Anchor', 'Rank', 'Dofollow', 'Provider', 'First Seen']
    const rows = filteredLinks.map((bl) => [
      bl.domain_from || '',
      bl.url_from || '',
      bl.anchor || '',
      bl.rank || '',
      bl.dofollow ? 'Yes' : 'No',
      sourceLabel(bl.source),
      bl.first_seen || '',
    ])
    exportToCSV(headers, rows, `backlinks-${domain}-${new Date().toISOString().slice(0, 10)}`)
  }

  const handleForceSync = async () => {
    if (!domain) return
    setSyncing(true)
    try {
      const fresh = await refreshBacklinks(domain, market)
      qc.setQueryData(['backlinks', domain, market?.trim() || ''], fresh)
    } catch {
      // keep cache
    } finally {
      setSyncing(false)
    }
  }

  const activeSources: string[] = data?.activeSources || []
  const softDegraded: string[] = Array.isArray(data?.softDegraded) ? data.softDegraded : []
  const dataState = error
    ? 'unavailable'
    : isLoading
      ? 'loading'
      : backlinks.length || refdomains.length
        ? data?.dataState === 'cached'
          ? 'cached'
          : 'live'
        : 'unavailable'

  return (
    <div className="space-y-4 lg:space-y-5 pt-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Backlinks</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">
            Live referring domains for <span className="font-medium text-fg">{domain}</span>
            {activeProject?.name ? ` · ${activeProject.name}` : ''}
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          <ExportCSVButton onClick={handleExport} />
          <SyncButton onClick={handleForceSync} loading={syncing || isFetching} label="Force refresh" loadingLabel="Syncing…" />
          <DataStateBadge
            state={dataState as any}
            source={activeSources.join(', ') || 'aggregated'}
            fetchedAt={data?.fetchedAt || (dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : null)}
          />
          {activeSources.map((s) => (
            <span key={s} className="text-[10px] md:text-xs bg-accent/10 text-accent-light border border-accent/20 px-1.5 py-0.5 rounded">
              {s}
            </span>
          ))}
          {softDegraded.map((s) => (
            <span key={`soft-${s}`} className="text-[10px] md:text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded">
              {s} soft-degraded
            </span>
          ))}
        </div>
      </div>

      {softDegraded.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-100">
          <p className="font-semibold">Provider soft-degrade</p>
          <p className="mt-1 text-xs md:text-sm text-amber-100/90">
            {softDegraded.join(', ')} hit auth/quota/rate limits — remaining sources still shown.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-bg-card border border-border rounded-xl p-3.5 md:p-5 card-glow">
          <p className="text-[10px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">Total rows</p>
          <p className="text-2xl md:text-3xl font-bold mt-1 text-fg">{summary.total ?? backlinks.length}</p>
        </div>
        <div className="bg-bg-card border border-border rounded-xl p-3.5 md:p-5 card-glow">
          <p className="text-[10px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">Referring domains</p>
          <p className="text-2xl md:text-3xl font-bold mt-1 text-accent-light">
            {summary.refDomains ?? new Set(refdomains.map((r) => r.domain)).size}
          </p>
        </div>
        <div className="bg-bg-card border border-border rounded-xl p-3.5 md:p-5 card-glow">
          <p className="text-[10px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">Dofollow</p>
          <p className="text-2xl md:text-3xl font-bold mt-1 text-green">{summary.dofollow ?? '—'}</p>
        </div>
        <div className="bg-bg-card border border-border rounded-xl p-3.5 md:p-5 card-glow">
          <p className="text-[10px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">Ahrefs DR</p>
          <p className="text-2xl md:text-3xl font-bold mt-1 text-accent-light">
            {ahrefsLoading ? '…' : domainRating?.domain_rating != null ? domainRating.domain_rating : (backlinksStats as any)?.domain_rating ?? '—'}
          </p>
        </div>
      </div>

      {anchorData.length > 0 && (
        <DataCard title="Top anchors" dataState={dataState as any} fetchedAt={data?.fetchedAt}>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={anchorData}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <Tooltip contentStyle={{ background: '#0b1220', border: '1px solid #1f2937' }} />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DataCard>
      )}

      <DataCard
        title={viewMode === 'links' ? 'Referring links' : 'Referring domains'}
        dataState={dataState as any}
        fetchedAt={data?.fetchedAt}
      >
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'links', label: 'Backlinks' },
                { id: 'refdomains', label: 'Referring domains' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setViewMode(tab.id)
                  setPage(1)
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  viewMode === tab.id
                    ? 'bg-accent/15 text-accent-light border-accent/30'
                    : 'bg-bg-darkest text-fg-muted border-border hover:text-fg'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
            <input
              type="text"
              placeholder={viewMode === 'links' ? 'Search referring domain / anchor…' : 'Search referring domain…'}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="w-full flex-1 px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent"
            />
            <div className="flex gap-2 items-center flex-wrap">
              <select
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value)
                  setPage(1)
                }}
                className="px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent"
              >
                <option value="all">All sources</option>
                {sourceOptions.map((s) => (
                  <option key={s} value={s}>
                    {sourceLabel(s)}
                  </option>
                ))}
              </select>
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value as any)
                  setPage(1)
                }}
                className="px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent"
              >
                <option value="all">All types</option>
                <option value="dofollow">Dofollow</option>
                <option value="nofollow">Nofollow</option>
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

        {isLoading && (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-white/[0.06] rounded-xl" />
            ))}
          </div>
        )}

        {!isLoading && error && !backlinks.length && !refdomains.length && (
          <div className="text-center py-8">
            <p className="text-sm text-red-300">Failed to load backlinks</p>
            <p className="text-xs text-fg-dim mt-1">{error instanceof Error ? error.message : 'API unavailable'}</p>
            <button onClick={handleForceSync} className="mt-3 px-3 py-1.5 rounded-lg border border-accent/30 text-xs text-accent-light">
              Retry with live sync
            </button>
          </div>
        )}

        {!isLoading && !error && activeListLength === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-fg-muted">
              {viewMode === 'links' ? `No backlinks inventory yet for ${domain}` : `No referring domains yet for ${domain}`}
            </p>
            <p className="text-xs text-fg-dim mt-1">Force refresh to pull DataForSEO / SEMrush / Ahrefs</p>
            <button onClick={handleForceSync} className="mt-3 px-3 py-1.5 rounded-lg border border-accent/30 text-xs text-accent-light">
              Force refresh
            </button>
          </div>
        )}

        {viewMode === 'links' && paginatedLinks.length > 0 && (
          <>
            <div className="md:hidden space-y-3">
              {paginatedLinks.map((bl, i) => (
                <div key={`${bl.url_from}-${i}`} className="rounded-xl border border-border bg-bg-darkest p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-fg truncate">{bl.domain_from || '—'}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent-light border border-accent/20">
                      {sourceLabel(bl.source)}
                    </span>
                  </div>
                  <p className="text-xs text-fg-dim truncate mt-0.5">{bl.url_from || ''}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-fg-muted">
                    <span className="truncate">Anchor: {bl.anchor || '—'}</span>
                    <span>Rank: {bl.rank || '—'}</span>
                    <span className={bl.dofollow ? 'text-green-300' : 'text-fg-dim'}>{bl.dofollow ? 'dofollow' : 'nofollow'}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-fg-dim font-medium">Source domain</th>
                    <th className="text-left py-2 px-3 text-fg-dim font-medium">Anchor</th>
                    <th className="text-right py-2 px-3 text-fg-dim font-medium">Rank</th>
                    <th className="text-right py-2 px-3 text-fg-dim font-medium">Type</th>
                    <th className="text-right py-2 px-3 text-fg-dim font-medium">Provider</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLinks.map((bl, i) => (
                    <tr key={`${bl.url_from}-${i}`} className="border-b border-border/50 hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3">
                        <p className="text-fg font-medium truncate max-w-[200px]">{bl.domain_from || '—'}</p>
                        <p className="text-xs text-fg-dim truncate max-w-[200px]">{bl.url_from?.slice(0, 50) || ''}</p>
                      </td>
                      <td className="py-2.5 px-3 text-fg-muted truncate max-w-[150px]">{bl.anchor || '—'}</td>
                      <td className="py-2.5 px-3 text-right text-fg-muted">{bl.rank || '—'}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`text-xs px-1.5 py-0.5 rounded touch-target-reset ${bl.dofollow ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'}`}>
                          {bl.dofollow ? 'dofollow' : 'nofollow'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent-light border border-accent/20">
                          {sourceLabel(bl.source)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {viewMode === 'refdomains' && paginatedRefDomains.length > 0 && (
          <>
            <div className="md:hidden space-y-3">
              {paginatedRefDomains.map((rd, i) => (
                <div key={`${rd.domain}-${rd.source}-${i}`} className="rounded-xl border border-border bg-bg-darkest p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-fg truncate">{rd.domain}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent-light border border-accent/20">
                      {sourceLabel(rd.source)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-fg-muted">
                    <span>Rank: {rd.rank || '—'}</span>
                    <span>Links: {rd.backlinks || '—'}</span>
                    <span>Dofollow: {rd.dofollow ?? '—'}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-fg-dim font-medium">Referring domain</th>
                    <th className="text-right py-2 px-3 text-fg-dim font-medium">Rank</th>
                    <th className="text-right py-2 px-3 text-fg-dim font-medium">Backlinks</th>
                    <th className="text-right py-2 px-3 text-fg-dim font-medium">Dofollow</th>
                    <th className="text-right py-2 px-3 text-fg-dim font-medium">Provider</th>
                    <th className="text-right py-2 px-3 text-fg-dim font-medium">First seen</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRefDomains.map((rd, i) => (
                    <tr key={`${rd.domain}-${rd.source}-${i}`} className="border-b border-border/50 hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3 text-fg font-medium">{rd.domain}</td>
                      <td className="py-2.5 px-3 text-right text-fg-muted">{rd.rank || '—'}</td>
                      <td className="py-2.5 px-3 text-right text-fg-muted">{rd.backlinks || '—'}</td>
                      <td className="py-2.5 px-3 text-right text-fg-muted">{rd.dofollow ?? '—'}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent-light border border-accent/20">
                          {sourceLabel(rd.source)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-fg-dim text-xs">{rd.first_seen ? String(rd.first_seen).slice(0, 10) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeListLength > 0 && (
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-border gap-2 flex-wrap">
            <p className="text-[11px] text-fg-dim">
              {activeListLength === 0
                ? '0 of 0'
                : `${(pageSafe - 1) * pageSize + 1}–${Math.min(pageSafe * pageSize, activeListLength)} of ${activeListLength}`}
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
                className="px-2.5 py-1.5 rounded-lg text-xs text-fg-muted hover:text-fg disabled:opacity-30"
              >
                ← Prev
              </button>
              <span className="text-xs text-fg-muted px-2">
                {pageSafe}/{totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
                className="px-2.5 py-1.5 rounded-lg text-xs text-fg-muted hover:text-fg disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </DataCard>
    </div>
  )
}
