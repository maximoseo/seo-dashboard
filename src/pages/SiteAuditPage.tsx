import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import DataStateBadge from '@/components/DataStateBadge'
import PageSizeSelect from '@/components/PageSizeSelect'
import SyncButton from '@/components/SyncButton'
import { usePageSize } from '@/hooks/usePageSize'
import { useSEO } from '@/contexts/SEOContext'
import { useProject } from '@/contexts/ProjectContext'
import {
  useSiteAudit,
  refreshSiteAudit,
  useSiteAuditHistory,
  recheckSiteAuditUrl,
} from '@/api/client'
import DomainIntegrityBar from '@/components/DomainIntegrityBar'
import { canonicalizeDomain } from '@/lib/domain'
import { useDomainSwitchCleanup } from '@/lib/useDomainQuery'
import {
  computeSiteAuditHealthScore,
  healthScoreTone,
} from '@/lib/siteAuditScore'
import { guidanceForIssue } from '@/lib/siteAuditCopy'

type Severity = 'error' | 'warning' | 'notice' | 'all'
type CrawlLimit = 10 | 20 | 50

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

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const lines = [headers.map(csvEscape).join(',')]
  for (const row of rows) lines.push(row.map(csvEscape).join(','))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function SiteAuditPage() {
  const { domain } = useSEO()
  const { activeProject } = useProject()
  useDomainSwitchCleanup(domain)
  const market = activeProject?.market || null
  const qc = useQueryClient()
  const [maxPages, setMaxPages] = useState<CrawlLimit>(20)
  const [pendingMax, setPendingMax] = useState<CrawlLimit>(20)
  const { data, isLoading, error, isFetching, dataUpdatedAt } = useSiteAudit(
    domain,
    market,
    maxPages,
  )
  const { data: historyData, isLoading: historyLoading } = useSiteAuditHistory(domain, 10)
  const { pageSize, setPageSize } = usePageSize('site-audit')
  const [severity, setSeverity] = useState<Severity>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [syncing, setSyncing] = useState(false)
  const [tab, setTab] = useState<'issues' | 'pages' | 'history'>('issues')
  const [openIssueId, setOpenIssueId] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [recheckBusy, setRecheckBusy] = useState<string | null>(null)
  const [recheckMsg, setRecheckMsg] = useState<string | null>(null)

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
    onpageScore: null as number | null,
    lighthouseSeo: null as number | null,
    performanceMobile: null as number | null,
    brokenBacklinks: null as number | null,
  }

  const healthScore = computeSiteAuditHealthScore({
    pagesCrawled: summary.pagesCrawled ?? pages.length,
    errors: summary.errors ?? 0,
    warnings: summary.warnings ?? 0,
    notices: summary.notices ?? 0,
    onpageScore: summary.onpageScore,
    lighthouseSeo: summary.lighthouseSeo,
  })

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

  const topCritical = useMemo(
    () =>
      [...issues]
        .filter((i) => i.severity === 'error')
        .slice(0, 5)
        .concat(
          [...issues].filter((i) => i.severity === 'warning').slice(0, Math.max(0, 5 - issues.filter((x) => x.severity === 'error').length)),
        )
        .slice(0, 5),
    [issues],
  )

  const historyRows: Array<{
    fetchedAt: string | null
    snapshotDate: string | null
    summary: Record<string, any>
    issuesCount: number
  }> = Array.isArray(historyData?.history) ? historyData.history : []
  const delta = historyData?.delta || null

  const activeLen =
    tab === 'issues' ? filteredIssues.length : tab === 'pages' ? filteredPages.length : historyRows.length
  const totalPages = Math.max(1, Math.ceil(activeLen / pageSize))
  const pageSafe = Math.min(page, totalPages)
  const paginatedIssues = filteredIssues.slice((pageSafe - 1) * pageSize, pageSafe * pageSize)
  const paginatedPages = filteredPages.slice((pageSafe - 1) * pageSize, pageSafe * pageSize)
  const paginatedHistory = historyRows.slice((pageSafe - 1) * pageSize, pageSafe * pageSize)

  const handleRecheckUrl = async (url: string) => {
    if (!domain || !url) return
    setRecheckBusy(url)
    setRecheckMsg(null)
    try {
      const res = await recheckSiteAuditUrl(domain, url)
      setRecheckMsg(
        res?.ok
          ? `Rechecked ${url}${res.softDegraded ? ' (partial)' : ''}`
          : `Recheck failed for ${url}`,
      )
    } catch (e) {
      setRecheckMsg(e instanceof Error ? e.message : 'Recheck failed')
    } finally {
      setRecheckBusy(null)
    }
  }

  const activeSources: string[] = data?.activeSources || []
  const softDegraded: string[] = Array.isArray(data?.softDegraded) ? data.softDegraded : []
  const pagesCrawled = Number(summary.pagesCrawled ?? pages.length) || 0
  const neverAudited = !isLoading && !error && !issues.length && !pages.length && !data?.fromSnapshot
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
    if (pendingMax === 50) {
      const ok = window.confirm(
        '50-page crawl uses more DataForSEO budget and can take longer. Continue?',
      )
      if (!ok) return
    }
    setMaxPages(pendingMax)
    setSyncing(true)
    setStatusMsg(`Starting crawl (max ${pendingMax} pages)…`)
    try {
      setStatusMsg('Waiting for On-Page summary & scores…')
      const fresh = await refreshSiteAudit(domain, market, pendingMax)
      qc.setQueryData(
        ['site-audit', canonicalizeDomain(domain), market?.trim() || '', pendingMax],
        fresh,
      )
      setStatusMsg('Audit complete')
      setTimeout(() => setStatusMsg(null), 2500)
    } catch {
      setStatusMsg('Audit failed — cache kept if available')
    } finally {
      setSyncing(false)
    }
  }

  const exportIssues = () => {
    downloadCsv(
      `site-audit-issues-${canonicalizeDomain(domain) || 'domain'}.csv`,
      ['severity', 'category', 'title', 'detail', 'url', 'source'],
      filteredIssues.map((i) => [
        i.severity,
        i.category,
        i.title,
        i.detail || '',
        i.url || '',
        i.source || '',
      ]),
    )
  }

  const exportPages = () => {
    downloadCsv(
      `site-audit-pages-${canonicalizeDomain(domain) || 'domain'}.csv`,
      ['url', 'status', 'title', 'h1', 'wordCount', 'loadTimeMs', 'onpageScore', 'checks'],
      filteredPages.map((p) => [
        p.url,
        String(p.status || ''),
        p.title || '',
        p.h1 || '',
        String(p.wordCount || ''),
        String(p.loadTime || ''),
        p.onpageScore == null ? '' : String(p.onpageScore),
        (p.issues || []).join('; '),
      ]),
    )
  }

  const cards = [
    {
      label: 'Health',
      value: healthScore == null ? '—' : healthScore,
      color: healthScoreTone(healthScore),
      hint: 'Derived from severities + on-page/Lighthouse when present',
    },
    { label: 'Pages crawled', value: summary.pagesCrawled ?? pages.length, color: 'text-fg' },
    { label: 'Errors', value: summary.errors ?? 0, color: 'text-red-300' },
    { label: 'Warnings', value: summary.warnings ?? 0, color: 'text-amber-300' },
    { label: 'On-Page score', value: summary.onpageScore ?? '—', color: 'text-accent-light' },
    { label: 'Lighthouse SEO', value: summary.lighthouseSeo ?? '—', color: 'text-green' },
    { label: 'Perf (mobile)', value: summary.performanceMobile ?? '—', color: 'text-fg-muted' },
    { label: 'Broken backlinks', value: summary.brokenBacklinks ?? '—', color: 'text-fg-muted' },
  ]

  return (
    <div className="space-y-4 lg:space-y-5 pb-24">
      <DomainIntegrityBar
        activeDomain={domain}
        payloadDomain={data?.canonicalDomain || data?.domain || domain}
        dataState={
          error
            ? 'unavailable'
            : isLoading
              ? 'loading'
              : issues.length || pages.length
                ? data?.dataState === 'cached'
                  ? 'cached'
                  : 'live'
                : 'unavailable'
        }
        fetchedAt={data?.fetchedAt || (dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : null)}
        fromSnapshot={Boolean(data?.fromSnapshot)}
        rowCount={issues.length + pages.length}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Site Audit</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">
            Technical SEO checks for <span className="font-medium text-fg">{domain}</span> —
            DataForSEO On-Page + PageSpeed + backlink risk
          </p>
          {statusMsg && (
            <p className="mt-1 text-xs text-accent-light" aria-live="polite">
              {statusMsg}
            </p>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          <label className="flex items-center gap-1.5 text-[11px] text-fg-muted">
            Max pages
            <select
              value={pendingMax}
              onChange={(e) => setPendingMax(Number(e.target.value) as CrawlLimit)}
              className="rounded-lg border border-border bg-bg-darkest px-2 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50 · higher cost</option>
            </select>
          </label>
          <SyncButton
            onClick={handleForceSync}
            loading={syncing || isFetching}
            label="Run audit"
            loadingLabel="Auditing…"
          />
          <button
            type="button"
            onClick={exportIssues}
            disabled={!issues.length}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-40"
          >
            Export issues
          </button>
          <button
            type="button"
            onClick={exportPages}
            disabled={!pages.length}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-40"
          >
            Export pages
          </button>
          <DataStateBadge
            state={dataState as any}
            source={activeSources.join(', ') || 'site-audit'}
            fetchedAt={data?.fetchedAt || (dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : null)}
          />
          {activeSources.map((s) => (
            <span
              key={s}
              className="text-[10px] md:text-xs bg-accent/10 text-accent-light border border-accent/20 px-1.5 py-0.5 rounded"
            >
              {s}
            </span>
          ))}
          {softDegraded.map((s) => (
            <span
              key={`soft-${s}`}
              className="text-[10px] md:text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded"
            >
              {s} soft-degraded
            </span>
          ))}
        </div>
      </div>

      {softDegraded.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-100">
          <p className="font-semibold">Provider soft-degrade</p>
          <p className="mt-1 text-xs md:text-sm text-amber-100/90">
            {softDegraded.join(', ')} hit auth/quota/timeout — partial audit still shown. A clean zero
            is only claimed when sources complete without soft-degrade.
          </p>
        </div>
      )}

      {neverAudited && (
        <div className="rounded-xl border border-border bg-bg-card px-4 py-6 text-center">
          <p className="text-sm font-medium text-fg">No audit yet for {domain}</p>
          <p className="mt-1 text-xs text-fg-dim">
            Empty state ≠ perfect site. Run a crawl to generate technical issues.
          </p>
          <button
            type="button"
            onClick={handleForceSync}
            className="mt-3 rounded-lg border border-accent/30 px-3 py-1.5 text-xs text-accent-light"
          >
            Run first audit
          </button>
        </div>
      )}

      {!neverAudited && pagesCrawled === 0 && (issues.length || pages.length || data?.fromSnapshot) && (
        <div className="rounded-xl border border-border/80 bg-white/[0.03] px-3.5 py-2.5 text-xs text-fg-muted">
          <strong className="text-fg">0 pages crawled</strong> does not mean a perfect site — providers
          may have returned summary-only or soft-degraded results.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-bg-card border border-border rounded-xl p-3.5 md:p-5 card-glow"
            title={(card as any).hint}
          >
            <p className="text-[10px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">
              {card.label}
            </p>
            <p className={`text-2xl md:text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {topCritical.length > 0 && (
        <div className="rounded-xl border border-border bg-bg-card p-3.5 md:p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Critical now</p>
          <ul className="mt-2 space-y-1.5">
            {topCritical.map((i) => (
              <li key={i.id} className="flex items-start gap-2 text-sm text-fg">
                <span className={`mt-0.5 text-[10px] px-1.5 py-0.5 rounded border ${severityStyles(i.severity)}`}>
                  {i.severity}
                </span>
                <button
                  type="button"
                  className="text-left hover:text-accent-light"
                  onClick={() => {
                    setTab('issues')
                    setOpenIssueId(i.id)
                  }}
                >
                  {i.title}
                  {i.url ? <span className="block text-[11px] text-fg-dim truncate">{i.url}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-bg-card border border-border rounded-xl p-3 md:p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'issues', label: `Issues (${issues.length})` },
              { id: 'pages', label: `Crawled pages (${pages.length})` },
              { id: 'history', label: `History (${historyRows.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id)
                setPage(1)
              }}
              className={`min-h-11 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
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
          {tab !== 'history' && (
          <input
            type="text"
            placeholder={tab === 'issues' ? 'Search issues…' : 'Search page URL / title…'}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-full flex-1 min-h-11 px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-base sm:text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent"
          />
          )}
          {tab === 'issues' && (
            <select
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value as Severity)
                setPage(1)
              }}
              className="min-h-11 px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent"
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
            <p className="text-xs text-fg-dim mt-1">
              {error instanceof Error ? error.message : 'API unavailable'}
            </p>
            <button
              onClick={handleForceSync}
              className="mt-3 min-h-11 px-3 py-1.5 rounded-lg border border-accent/30 text-xs text-accent-light"
            >
              Retry audit
            </button>
          </div>
        )}

        {!isLoading && !error && activeLen === 0 && !neverAudited && (
          <div className="text-center py-10">
            <p className="text-sm text-fg-muted">No rows match the current filters for {domain}</p>
            <p className="text-xs text-fg-dim mt-1">
              Clear search / severity, or re-run audit for a fresh crawl.
            </p>
            <button
              onClick={handleForceSync}
              className="mt-3 min-h-11 px-3 py-1.5 rounded-lg border border-accent/30 text-xs text-accent-light"
            >
              Run audit
            </button>
          </div>
        )}

        {tab === 'issues' && paginatedIssues.length > 0 && (
          <div className="space-y-2">
            {paginatedIssues.map((issue) => {
              const open = openIssueId === issue.id
              const guide = guidanceForIssue(issue.title, issue.category)
              return (
                <div key={issue.id} className="rounded-xl border border-border bg-bg-darkest px-3.5 py-3">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setOpenIssueId(open ? null : issue.id)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${severityStyles(issue.severity)}`}>
                        {issue.severity}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-fg-dim">
                        {issue.category}
                      </span>
                      {issue.source && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent-light border border-accent/20">
                          {issue.source}
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-fg-dim">{open ? 'Hide' : 'Why / Fix'}</span>
                    </div>
                    <p className="text-sm font-medium text-fg mt-1.5">{issue.title}</p>
                    {issue.detail && <p className="text-xs text-fg-muted mt-1">{issue.detail}</p>}
                    {issue.url && <p className="text-[11px] text-fg-dim mt-1 truncate">{issue.url}</p>}
                  </button>
                  {open && (
                    <div className="mt-3 space-y-2 rounded-lg border border-border/70 bg-bg-card/60 p-3 text-xs text-fg-muted">
                      <p>
                        <span className="font-semibold text-fg">Why · </span>
                        {guide.why}
                      </p>
                      <p>
                        <span className="font-semibold text-fg">Fix · </span>
                        {guide.fix}
                      </p>
                      <p>
                        <span className="font-semibold text-fg">Validate · </span>
                        {guide.validate}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {recheckMsg && (
          <p className="text-xs text-accent-light" aria-live="polite">
            {recheckMsg}
          </p>
        )}

        {tab === 'history' && (
          <div className="space-y-3">
            {historyLoading && (
              <div className="animate-pulse space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 bg-white/[0.06] rounded-xl" />
                ))}
              </div>
            )}
            {!historyLoading && historyRows.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-fg-muted">No prior crawl snapshots yet</p>
                <p className="text-xs text-fg-dim mt-1">
                  Run multiple audits over time to unlock history + delta.
                </p>
              </div>
            )}
            {delta && (
              <div className="rounded-xl border border-border bg-bg-darkest px-3.5 py-3 text-xs text-fg-muted">
                <p className="font-semibold text-fg mb-1.5">Δ vs previous crawl</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(delta as Record<string, number | null>).map(([k, v]) => {
                    const n = typeof v === 'number' ? v : null
                    return (
                      <span key={k} className="rounded border border-border px-1.5 py-0.5">
                        {k}: {n == null ? '—' : n > 0 ? `+${n}` : String(n)}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
            {paginatedHistory.map((row, idx) => (
              <div
                key={`${row.fetchedAt || row.snapshotDate || idx}`}
                className="rounded-xl border border-border bg-bg-darkest px-3.5 py-3"
              >
                <p className="text-sm text-fg font-medium">
                  {row.fetchedAt ? new Date(row.fetchedAt).toLocaleString() : row.snapshotDate || '—'}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-fg-dim">
                  <span className="rounded border border-border px-1.5 py-0.5">
                    Errors {row.summary?.errors ?? '—'}
                  </span>
                  <span className="rounded border border-border px-1.5 py-0.5">
                    Warnings {row.summary?.warnings ?? '—'}
                  </span>
                  <span className="rounded border border-border px-1.5 py-0.5">
                    Pages {row.summary?.pagesCrawled ?? '—'}
                  </span>
                  <span className="rounded border border-border px-1.5 py-0.5">
                    Issues {row.issuesCount}
                  </span>
                  <span className="rounded border border-border px-1.5 py-0.5">
                    On-page {row.summary?.onpageScore ?? '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'pages' && paginatedPages.length > 0 && (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {paginatedPages.map((p) => (
                <div key={p.url} className="rounded-xl border border-border bg-bg-darkest px-3.5 py-3">
                  <p className="text-sm font-medium text-fg break-all">{p.url}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-fg-dim">
                    <span className="rounded border border-border px-1.5 py-0.5">HTTP {p.status || '—'}</span>
                    <span className="rounded border border-border px-1.5 py-0.5">
                      On-page {p.onpageScore ?? '—'}
                    </span>
                    <span className="rounded border border-border px-1.5 py-0.5">
                      Words {p.wordCount || '—'}
                    </span>
                    {p.loadTime ? (
                      <span className="rounded border border-border px-1.5 py-0.5">
                        {Math.round(p.loadTime)}ms
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-xs text-fg-muted truncate">{p.title || '—'}</p>
                  <p className="text-[11px] text-fg-dim truncate">H1: {p.h1 || '—'}</p>
                  {(p.issues || []).length > 0 && (
                    <p className="mt-1 text-[11px] text-amber-200/90">
                      {(p.issues || []).slice(0, 4).join(' · ')}
                    </p>
                  )}
                  {p.url && (
                    <button
                      type="button"
                      disabled={recheckBusy === p.url}
                      onClick={() => void handleRecheckUrl(p.url)}
                      className="mt-2 min-h-11 rounded-lg border border-accent/30 px-2.5 py-1.5 text-[11px] text-accent-light disabled:opacity-50"
                    >
                      {recheckBusy === p.url ? 'Rechecking…' : 'Recheck URL'}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto table-scroll">
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
                        {p.description && (
                          <p className="text-[11px] text-fg-dim truncate max-w-[240px] mt-0.5">
                            {p.description}
                          </p>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center text-fg-muted">{p.status || '—'}</td>
                      <td className="py-2.5 px-3">
                        <p className="text-fg-muted truncate max-w-[200px]">{p.title || '—'}</p>
                        <p className="text-[11px] text-fg-dim truncate max-w-[200px] mt-0.5">
                          H1: {p.h1 || '—'}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 text-right text-fg-muted">{p.wordCount || '—'}</td>
                      <td className="py-2.5 px-3 text-right text-fg-muted">
                        {p.loadTime ? `${Math.round(p.loadTime)}ms` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-fg-muted">{p.onpageScore ?? '—'}</td>
                      <td className="py-2.5 px-3 text-fg-dim text-xs">
                        <div className="flex items-center gap-2">
                          <span>{(p.issues || []).slice(0, 3).join(', ') || '—'}</span>
                          {p.url && (
                            <button
                              type="button"
                              disabled={recheckBusy === p.url}
                              onClick={() => void handleRecheckUrl(p.url)}
                              className="shrink-0 rounded border border-accent/30 px-1.5 py-0.5 text-[10px] text-accent-light disabled:opacity-50"
                            >
                              {recheckBusy === p.url ? '…' : 'Recheck'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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
                className="min-h-11 px-2.5 py-1.5 rounded-lg text-xs text-fg-muted hover:text-fg disabled:opacity-30"
              >
                ← Prev
              </button>
              <span className="text-xs text-fg-muted px-2">
                {pageSafe}/{totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
                className="min-h-11 px-2.5 py-1.5 rounded-lg text-xs text-fg-muted hover:text-fg disabled:opacity-30"
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
