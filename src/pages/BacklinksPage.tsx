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
  const [filter, setFilter] = useState<'all' | 'dofollow' | 'nofollow'>('all')
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
        source: b.source,
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

  const summary = data?.summary || {
    total: backlinks.length,
    dofollow: backlinks.filter((b) => b.dofollow).length,
    nofollow: backlinks.filter((b) => !b.dofollow).length,
  }

  const filtered = useMemo(() => {
    let list = [...backlinks]
    if (filter === 'dofollow') list = list.filter((bl) => bl.dofollow)
    if (filter === 'nofollow') list = list.filter((bl) => !bl.dofollow)
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
  }, [backlinks, filter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

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
    const headers = ['Source Domain', 'URL From', 'Anchor', 'Rank', 'Dofollow', 'First Seen']
    const rows = filtered.map((bl) => [
      bl.domain_from || '',
      bl.url_from || '',
      bl.anchor || '',
      bl.rank || '',
      bl.dofollow ? 'Yes' : 'No',
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
      : backlinks.length
        ? data?.dataState === 'cached'
          ? 'cached'
          : 'live'
        : 'unavailable'

  return (
    <div className="space-y-4 lg:space-y-5 pt-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Backlinks</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">Live referring domains for {domain}</p>
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
          <p className="text-[10px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">Dofollow</p>
          <p className="text-2xl md:text-3xl font-bold mt-1 text-green">{summary.dofollow ?? '—'}</p>
        </div>
        <div className="bg-bg-card border border-border rounded-xl p-3.5 md:p-5 card-glow">
          <p className="text-[10px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">Nofollow</p>
          <p className="text-2xl md:text-3xl font-bold mt-1 text-fg-muted">{summary.nofollow ?? '—'}</p>
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

      <DataCard title="Referring links" dataState={dataState as any} fetchedAt={data?.fetchedAt}>
        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 mb-4">
          <input
            type="text"
            placeholder="Search domain / anchor / URL…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-full flex-1 px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent"
          />
          <div className="flex gap-2 items-center flex-wrap">
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

        {isLoading && (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-white/[0.06] rounded-xl" />
            ))}
          </div>
        )}

        {!isLoading && error && !backlinks.length && (
          <div className="text-center py-8">
            <p className="text-sm text-red-300">Failed to load backlinks</p>
            <p className="text-xs text-fg-dim mt-1">{error instanceof Error ? error.message : 'API unavailable'}</p>
            <button onClick={handleForceSync} className="mt-3 px-3 py-1.5 rounded-lg border border-accent/30 text-xs text-accent-light">
              Retry with live sync
            </button>
          </div>
        )}

        {!isLoading && !error && backlinks.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-fg-muted">No backlinks inventory yet for {domain}</p>
            <p className="text-xs text-fg-dim mt-1">Force refresh to pull DataForSEO / SEMrush backlinks</p>
            <button onClick={handleForceSync} className="mt-3 px-3 py-1.5 rounded-lg border border-accent/30 text-xs text-accent-light">
              Force refresh
            </button>
          </div>
        )}

        {paginated.length > 0 && (
          <>
            <div className="md:hidden space-y-3">
              {paginated.map((bl, i) => (
                <div key={`${bl.url_from}-${i}`} className="rounded-xl border border-border bg-bg-darkest p-3.5">
                  <p className="text-sm font-medium text-fg truncate">{bl.domain_from || '—'}</p>
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
                    <th className="text-left py-2 px-3 text-fg-dim font-medium">Source</th>
                    <th className="text-left py-2 px-3 text-fg-dim font-medium">Anchor</th>
                    <th className="text-right py-2 px-3 text-fg-dim font-medium">Rank</th>
                    <th className="text-right py-2 px-3 text-fg-dim font-medium">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((bl, i) => (
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
                  className="px-2.5 py-1.5 rounded-lg text-xs text-fg-muted hover:text-fg disabled:opacity-30"
                >
                  ← Prev
                </button>
                <span className="text-xs text-fg-muted px-2">
                  {page}/{totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-fg-muted hover:text-fg disabled:opacity-30"
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
      </DataCard>
    </div>
  )
}
