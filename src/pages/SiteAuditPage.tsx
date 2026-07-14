import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import DataStateBadge from '@/components/DataStateBadge'
import PageSizeSelect from '@/components/PageSizeSelect'
import SyncButton from '@/components/SyncButton'
import { usePageSize } from '@/hooks/usePageSize'
import { useSEO } from '@/contexts/SEOContext'
import { useProject } from '@/contexts/ProjectContext'
import { useSiteAudit, refreshSiteAudit } from '@/api/client'

type Severity = 'error' | 'warning' | 'notice' | 'all'

interface AuditIssue {
  id: string
  severity: 'error' | 'warning' | 'notice'
  category: string
  title: string
  detail?: string
  url?: string
  source?: string
}

interface AuditPage {
  url: string
  status: number
  title: string
  description?: string
  h1?: string
  wordCount?: number
  loadTime?: number
  size?: number
  onpageScore?: number | null
  issues?: string[]
  source?: string
}

function severityStyles(severity: string) {
  if (severity === 'error') return 'bg-red-500/15 text-red-300 border-red-500/30'
  if (severity === 'warning') return 'bg-amber-500/15 text-amber-200 border-amber-500/30'
  return 'bg-sky-500/15 text-sky-200 border-sky-500/30'
}

export default function SiteAuditPage() {
  const { domain } = useSEO()
  const { activeProject } = useProject()
  const market = activeProject?.market || null
  const qc = useQueryClient()
  const { data, isLoading, error, isFetching, dataUpdatedAt } = useSiteAudit(domain, market)
  const { pageSize, setPageSize } = usePageSize('site-audit')
  const [severity, setSeverity] = useState<Severity>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [syncing, setSyncing] = useState(false)
  const [tab, setTab] = useState<'issues' | 'pages'>('issues')

  const issues: AuditIssue[] = useMemo(() => {
    if (!Array.isArray(data?.issues)) return []
    return data.issues.map((i: any) => ({
      id: i.id || `${i.title}-${i.category}`,
      severity: i.severity || 'notice',
      category: i.category || 'General',
      title: i.title || 'Issue',
      detail: i.detail || '',
      url: i.url || '',
      source: i.source || '',
    }))
  }, [data])

  const pages: AuditPage[] = useMemo(() => {
    if (!Array.isArray(data?.pages)) return []
    return data.pages.map((p: any) => ({
      url: p.url || '',
      status: Number(p.status || 0) || 0,
      title: p.title || '',
      description: p.description || '',
      h1: p.h1 || '',
      wordCount: Number(p.wordCount || 0) || 0,
      loadTime: Number(p.loadTime || 0) || 0,
      size: Number(p.size || 0) || 0,
      onpageScore: p.onpageScore == null ? null : Number(p.onpageScore),
      issues: Array.isArray(p.issues) ? p.issues : [],
      source: p.source || '',
    }))
  }, [data])

  const summary = data?.summary || {
    pagesCrawled: pages.length,
    issuesTotal: issues.length,
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    notices: issues.filter((i) => i.severity === 'notice').length,
    onpageScore: null,
    lighthouseSeo: null,
    performanceMobile: null,
    brokenBacklinks: null,
  }

  const filteredIssues = useMemo(() => {
    let list = [...issues]
    if (severity !== 'all') list = list.filter((i) => i.severity === severity)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          (i.detail || '').toLowerCase().includes(q) ||
          (i.url || '').toLowerCase().includes(q),
      )
    }
    return list
  }, [issues, severity, search])

  const filteredPages = useMemo(() => {
    let list = [...pages]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.url.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          (p.h1 || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q),
      )
    }
    return list
  }, [pages, search])

  const activeLen = tab === 'issues' ? filteredIssues.length : filteredPages.length
  const totalPages = Math.max(1, Math.ceil(activeLen / pageSize))
  const pageSafe = Math.min(page, totalPages)
  const paginatedIssues = filteredIssues.slice((pageSafe - 1) * pageSize, pageSafe * pageSize)
  const paginatedPages = filteredPages.slice((pageSafe - 1) * pageSize, pageSafe * pageSize)

  const activeSources: string[] = data?.activeSources || []
  const softDegraded: string[] = Array.isArray(data?.softDegraded) ? data.softDegraded : []
  const dataState = error
    ? 'unavailable'
    : isLoading
      ? 'loading'
      : issues.length || pages.length
        ? data?.dataState === 'cached'
          ? 'cached'
          : 'live'
        : 'unavailable'

  const handleForceSync = async () => {
    if (!domain) return
    setSyncing(true)
    try {
      const fresh = await refreshSiteAudit(domain, market)
      qc.setQueryData(['site-audit', domain, market?.trim() || ''], fresh)
    } catch {
      // keep cache
    } finally {
      setSyncing(false)
    }
  }

  const cards = [
    { label: 'Pages crawled', value: summary.pagesCrawled ?? pages.length, color: 'text-fg' },
    { label: 'Errors', value: summary.errors ?? 0, color: 'text-red-300' },
    { label: 'Warnings', value: summary.warnings ?? 0, color: 'text-amber-300' },
    { label: 'On-Page score', value: summary.onpageScore ?? '—', color: 'text-accent-light' },
    { label: 'Lighthouse SEO', value: summary.lighthouseSeo ?? '—', color: 'text-green' },
    { label: 'Perf (mobile)', value: summary.performanceMobile ?? '—', color: 'text-fg-muted' },
    { label: 'Broken backlinks', value: summary.brokenBacklinks ?? '—', color: 'text-fg-muted' },
    { label: 'Issues total', value: summary.issuesTotal ?? issues.length, color: 'text-fg' },
  ]

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Site Audit</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">
            Technical SEO checks for <span className="font-medium text-fg">{domain}</span> — DataForSEO On-Page + PageSpeed + backlink risk
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          <SyncButton onClick={handleForceSync} loading={syncing || isFetching} label="Run audit" loadingLabel="Auditing…" />
          <DataStateBadge
            state={dataState as any}
            source={activeSources.join(', ') || 'site-audit'}
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
            {softDegraded.join(', ')} hit auth/quota/timeout — partial audit still shown.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-bg-card border border-border rounded-xl p-3.5 md:p-5 card-glow">
            <p className="text-[10px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">{card.label}</p>
            <p className={`text-2xl md:text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-bg-card border border-border rounded-xl p-3 md:p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'issues', label: `Issues (${issues.length})` },
              { id: 'pages', label: `Crawled pages (${pages.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id)
                setPage(1)
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                tab === t.id
                  ? 'bg-accent/15 text-accent-light border-accent/30'
                  : 'bg-bg-darkest text-fg-muted border-border hover:text-fg'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
          <input
            type="text"
            placeholder={tab === 'issues' ? 'Search issues…' : 'Search page URL / title…'}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-full flex-1 px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent"
          />
          {tab === 'issues' && (
            <select
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value as Severity)
                setPage(1)
              }}
              className="px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent"
            >
              <option value="all">All severities</option>
              <option value="error">Errors</option>
              <option value="warning">Warnings</option>
              <option value="notice">Notices</option>
            </select>
          )}
          <PageSizeSelect
            value={pageSize}
            onChange={(n) => {
              setPageSize(n)
              setPage(1)
            }}
            compact
          />
        </div>

        {isLoading && (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-white/[0.06] rounded-xl" />
            ))}
          </div>
        )}

        {!isLoading && error && !issues.length && !pages.length && (
          <div className="text-center py-10">
            <p className="text-sm text-red-300">Failed to load site audit</p>
            <p className="text-xs text-fg-dim mt-1">{error instanceof Error ? error.message : 'API unavailable'}</p>
            <button onClick={handleForceSync} className="mt-3 px-3 py-1.5 rounded-lg border border-accent/30 text-xs text-accent-light">
              Retry audit
            </button>
          </div>
        )}

        {!isLoading && !error && activeLen === 0 && (
          <div className="text-center py-10">
            <p className="text-sm text-fg-muted">No technical audit data yet for {domain}</p>
            <p className="text-xs text-fg-dim mt-1">Run audit to crawl with DataForSEO On-Page and PageSpeed SEO checks</p>
            <button onClick={handleForceSync} className="mt-3 px-3 py-1.5 rounded-lg border border-accent/30 text-xs text-accent-light">
              Run audit
            </button>
          </div>
        )}

        {tab === 'issues' && paginatedIssues.length > 0 && (
          <div className="space-y-2">
            {paginatedIssues.map((issue) => (
              <div key={issue.id} className="rounded-xl border border-border bg-bg-darkest px-3.5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${severityStyles(issue.severity)}`}>
                    {issue.severity}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-fg-dim">{issue.category}</span>
                  {issue.source && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent-light border border-accent/20">
                      {issue.source}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-fg mt-1.5">{issue.title}</p>
                {issue.detail && <p className="text-xs text-fg-muted mt-1">{issue.detail}</p>}
                {issue.url && <p className="text-[11px] text-fg-dim mt-1 truncate">{issue.url}</p>}
              </div>
            ))}
          </div>
        )}

        {tab === 'pages' && paginatedPages.length > 0 && (
          <div className="overflow-x-auto table-scroll">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-fg-dim">
                  <th className="text-left py-2 px-3 font-medium">URL</th>
                  <th className="text-center py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Title / H1</th>
                  <th className="text-right py-2 px-3 font-medium">Words</th>
                  <th className="text-right py-2 px-3 font-medium">Load</th>
                  <th className="text-right py-2 px-3 font-medium">On-Page</th>
                  <th className="text-left py-2 px-3 font-medium">Checks</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPages.map((p) => (
                  <tr key={p.url} className="border-b border-border/50 hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3">
                      <p className="text-fg font-medium truncate max-w-[240px]">{p.url}</p>
                      {p.description && <p className="text-[11px] text-fg-dim truncate max-w-[240px] mt-0.5">{p.description}</p>}
                    </td>
                    <td className="py-2.5 px-3 text-center text-fg-muted">{p.status || '—'}</td>
                    <td className="py-2.5 px-3">
                      <p className="text-fg-muted truncate max-w-[200px]">{p.title || '—'}</p>
                      <p className="text-[11px] text-fg-dim truncate max-w-[200px] mt-0.5">H1: {p.h1 || '—'}</p>
                    </td>
                    <td className="py-2.5 px-3 text-right text-fg-muted">{p.wordCount || '—'}</td>
                    <td className="py-2.5 px-3 text-right text-fg-muted">{p.loadTime ? `${Math.round(p.loadTime)}ms` : '—'}</td>
                    <td className="py-2.5 px-3 text-right text-fg-muted">{p.onpageScore ?? '—'}</td>
                    <td className="py-2.5 px-3 text-fg-dim text-xs">
                      {(p.issues || []).slice(0, 3).join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeLen > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-border gap-2 flex-wrap">
            <p className="text-[11px] text-fg-dim">
              {(pageSafe - 1) * pageSize + 1}–{Math.min(pageSafe * pageSize, activeLen)} of {activeLen}
            </p>
            <div className="flex items-center gap-1">
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
      </div>
    </div>
  )
}
