import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSEO } from '@/contexts/SEOContext'
import { authFetch } from '@/lib/authToken'
import DataStateBadge from '@/components/DataStateBadge'
import PageSizeSelect from '@/components/PageSizeSelect'
import SyncButton from '@/components/SyncButton'
import { usePageSize } from '@/hooks/usePageSize'
import { refreshAlerts } from '@/api/client'
import DomainIntegrityBar from '@/components/DomainIntegrityBar'
import { canonicalizeDomain } from '@/lib/domain'
import { useDomainSwitchCleanup } from '@/lib/useDomainQuery'

type Severity = 'critical' | 'warning' | 'info'
type AlertStatus = 'unread' | 'read' | 'resolved'

interface Alert {
  id: string
  severity: Severity
  title: string
  description: string
  detail: string
  module: string
  source: string
  time: string
  timestamp: number
  status: AlertStatus
}

interface ApiAlert {
  severity: string
  source?: string
  module?: string
  message?: string
  description?: string
  detail?: string
  title?: string
  time?: string
  timestamp?: string | number
  status?: string
  createdAt?: string
}

async function fetchAlerts(domain: string): Promise<{ alerts: ApiAlert[]; source: string }> {
  const res = await authFetch(`/api/alerts/aggregated?domain=${encodeURIComponent(domain)}`)
  if (!res.ok) throw new Error(`Alerts API failed: ${res.status}`)
  return res.json()
}

interface MetricAnomaly {
  kind: 'metric'
  metric: string
  label: string
  current: number
  baseline: number
  deltaPct: number
  zScore: number | null
  direction: 'drop' | 'spike'
  severity: Severity
  points: number
}
interface KeywordDrop {
  kind: 'keyword-drop'
  keyword: string
  fromPosition: number | null
  toPosition: number | null
  drop: number
  volume: number | null
  outOf: 'top3' | 'top10' | null
  severity: Severity
}
interface AnomaliesResponse {
  metricAnomalies?: MetricAnomaly[]
  keywordDrops?: KeywordDrop[]
  keywordsGained?: KeywordDrop[]
  keywordsCompared?: number
  snapshotsUsed?: number
  note?: string
  dataState?: string
}
async function fetchAnomalies(domain: string): Promise<AnomaliesResponse> {
  const res = await authFetch(`/api/anomalies/aggregated?domain=${encodeURIComponent(domain)}`)
  if (!res.ok) throw new Error(`Anomalies API failed: ${res.status}`)
  return res.json()
}

function normalizeAlert(raw: ApiAlert, index: number): Alert {
  const ts = typeof raw.timestamp === 'number'
    ? raw.timestamp
    : raw.timestamp ? new Date(raw.timestamp).getTime()
    : raw.createdAt ? new Date(raw.createdAt).getTime()
    : Date.now() - index * 3600000

  const now = Date.now()
  const diffMs = now - ts
  const timeLabel = diffMs < 60000 ? 'just now'
    : diffMs < 3600000 ? `${Math.floor(diffMs / 60000)}m ago`
    : diffMs < 86400000 ? `${Math.floor(diffMs / 3600000)}h ago`
    : `${Math.floor(diffMs / 86400000)}d ago`

  return {
    id: `alert-${index}`,
    severity: (['critical', 'warning', 'info'].includes(raw.severity) ? raw.severity : 'info') as Severity,
    title: raw.title || raw.message || 'Alert',
    description: raw.description || raw.detail || raw.message || '',
    detail: raw.detail || raw.description || raw.message || '',
    module: raw.module || 'General',
    source: raw.source || 'System',
    time: raw.time || timeLabel,
    timestamp: ts,
    status: (['unread', 'read', 'resolved'].includes(raw.status || '') ? raw.status : 'unread') as AlertStatus,
  }
}

const severityConfig = {
  critical: { bg: 'bg-red/15', text: 'text-red', icon: '●', label: 'Critical' },
  warning: { bg: 'bg-yellow/15', text: 'text-yellow', icon: '▲', label: 'Warning' },
  info: { bg: 'bg-accent/15', text: 'text-accent-light', icon: 'ℹ', label: 'Info' },
}

export default function AlertsPage() {
  const { domain } = useSEO()
  useDomainSwitchCleanup(domain)
  const clean = canonicalizeDomain(domain)
  const qc = useQueryClient()
  const { pageSize, setPageSize } = usePageSize('alerts')
  const [page, setPage] = useState(1)
  const [syncing, setSyncing] = useState(false)
  const { data, isLoading, error, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['alerts', clean],
    queryFn: () => fetchAlerts(clean),
    enabled: !!clean,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  })

  const { data: anomaliesData, isLoading: anomaliesLoading } = useQuery({
    queryKey: ['anomalies', clean],
    queryFn: () => fetchAnomalies(clean),
    enabled: !!clean,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })
  const metricAnomalies = useMemo(() => (Array.isArray(anomaliesData?.metricAnomalies) ? anomaliesData.metricAnomalies : []), [anomaliesData])
  const keywordDrops = useMemo(() => (Array.isArray(anomaliesData?.keywordDrops) ? anomaliesData.keywordDrops : []), [anomaliesData])
  const keywordsGained = useMemo(() => (Array.isArray(anomaliesData?.keywordsGained) ? anomaliesData.keywordsGained : []), [anomaliesData])
  const hasAnomalies = metricAnomalies.length > 0 || keywordDrops.length > 0 || keywordsGained.length > 0

  const alerts: Alert[] = useMemo(() => {
    if (data?.alerts?.length) return data.alerts.map(normalizeAlert)
    return []
  }, [data])

  const [severityFilter, setSeverityFilter] = useState('all')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const modules = useMemo(() => {
    const set = new Set(alerts.map(a => a.module))
    return Array.from(set).sort()
  }, [alerts])

  const filtered = useMemo(() => {
    let result = [...alerts]
    if (severityFilter !== 'all') result = result.filter(a => a.severity === severityFilter)
    if (moduleFilter !== 'all') result = result.filter(a => a.module === moduleFilter)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(a => a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
    }
    return result.sort((a, b) => b.timestamp - a.timestamp)
  }, [alerts, severityFilter, moduleFilter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  const handleForceSync = async () => {
    if (!clean) return
    setSyncing(true)
    try {
      const fresh = await refreshAlerts(clean)
      qc.setQueryData(['alerts', clean], fresh)
    } catch {
      // keep cache
    } finally {
      setSyncing(false)
    }
  }

  const markAs = (_id: string, _status: AlertStatus) => {
    // Local-only state update (could be persisted to API later)
  }

  const dataState = error ? 'unavailable' : alerts.length > 0 ? 'live' : isLoading ? 'loading' : 'unavailable'

  const summaryCards = [
    { label: 'Total', value: alerts.filter(a => a.status !== 'resolved').length, color: 'text-fg' },
    { label: 'Critical', value: alerts.filter(a => a.severity === 'critical' && a.status !== 'resolved').length, color: 'text-red' },
    { label: 'Warnings', value: alerts.filter(a => a.severity === 'warning' && a.status !== 'resolved').length, color: 'text-yellow' },
    { label: 'Info', value: alerts.filter(a => a.severity === 'info' && a.status !== 'resolved').length, color: 'text-accent-light' },
  ]

  return (
    <div className="space-y-4 lg:space-y-5">
      <DomainIntegrityBar
        activeDomain={clean}
        payloadDomain={(data as any)?.domain || clean}
        dataState={dataState as any}
        fetchedAt={dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : null}
        rowCount={alerts.length}
        extra={clean ? `alerts for ${clean}` : 'no domain'}
      />
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Alerts & Notifications</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">Aggregated alerts from monitoring sources for {clean || domain}</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <SyncButton onClick={handleForceSync} loading={syncing || isFetching} label="Force refresh" loadingLabel="Syncing…" />
          <DataStateBadge state={dataState as any} source={(data as any)?.source || 'rules'} fetchedAt={dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : null} />
          <PageSizeSelect value={pageSize} onChange={(n) => { setPageSize(n); setPage(1) }} compact />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {summaryCards.map((card, i) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.05 }} className="bg-bg-card border border-border rounded-xl p-3.5 md:p-5 hover:border-border-light transition-colors card-glow">
            <p className="text-[11px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">{card.label}</p>
            <p className={`text-2xl md:text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Anomaly detection — statistical (MAD z-score) on snapshot history */}
      {(anomaliesLoading || hasAnomalies) && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }} className="bg-bg-card border border-border rounded-xl p-3.5 md:p-4 card-glow">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm md:text-base font-semibold text-fg">Anomaly detection</h3>
              <p className="text-[11px] text-fg-dim mt-0.5">
                {anomaliesData?.note || 'Statistical anomalies vs trailing snapshot baseline.'}
                {anomaliesData?.snapshotsUsed ? ` · ${anomaliesData.snapshotsUsed} snapshots` : ''}
              </p>
            </div>
            {metricAnomalies.length > 0 && (
              <span className="text-[10px] md:text-xs bg-red/15 text-red border border-red/30 px-2 py-0.5 rounded shrink-0">
                {metricAnomalies.length} metric {metricAnomalies.length === 1 ? 'anomaly' : 'anomalies'}
              </span>
            )}
          </div>

          {anomaliesLoading && <div className="animate-pulse space-y-2">{[1, 2].map(i => <div key={i} className="h-12 bg-white/[0.06] rounded-xl" />)}</div>}

          {metricAnomalies.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-3">
              {metricAnomalies.map((a) => {
                const cfg = severityConfig[a.severity] || severityConfig.info
                return (
                  <div key={a.metric} className="rounded-xl border border-border bg-bg-darkest px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{a.label}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>{a.severity}</span>
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-2">
                      <p className={`text-lg font-bold ${a.direction === 'drop' ? 'text-red' : 'text-green'}`}>
                        {a.direction === 'drop' ? '▼' : '▲'} {a.current.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-fg-dim">baseline {a.baseline.toLocaleString()}</p>
                    </div>
                    <p className="text-[11px] text-fg-dim mt-0.5">
                      {a.deltaPct > 0 ? '+' : ''}{a.deltaPct}% vs median{a.zScore != null ? ` · z=${a.zScore}` : ''} · {a.points} pts
                    </p>
                  </div>
                )
              })}
            </div>
          )}

          {keywordDrops.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Keyword drops ({keywordDrops.length})</p>
              {keywordDrops.slice(0, 8).map((d) => {
                const cfg = severityConfig[d.severity] || severityConfig.info
                return (
                  <div key={d.keyword} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-darkest px-3 py-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${cfg.bg} ${cfg.text}`}>{d.outOf ? `out of ${d.outOf}` : `−${d.drop}`}</span>
                      <p className="truncate text-sm text-fg">{d.keyword}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-red">{d.fromPosition ?? '—'} → {d.toPosition ?? 'lost'}</p>
                      {d.volume != null && <p className="text-[10px] text-fg-dim">vol {d.volume.toLocaleString()}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {keywordsGained.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 items-center">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Gained:</span>
              {keywordsGained.slice(0, 6).map((g) => (
                <span key={g.keyword} className="text-[10px] bg-green/15 text-green border border-green/30 px-2 py-0.5 rounded">
                  {g.keyword} {g.fromPosition ?? '—'}→{g.toPosition ?? '—'}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }} className="bg-bg-card border border-border rounded-xl p-3.5 md:p-4 card-glow">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-dim"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <input type="text" placeholder="Search alerts..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent transition-colors" />
          </div>
          <select value={severityFilter} onChange={e => { setSeverityFilter(e.target.value); setPage(1) }} className="px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent transition-colors">
            <option value="all">All Severity</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
          <select value={moduleFilter} onChange={e => { setModuleFilter(e.target.value); setPage(1) }} className="px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent transition-colors">
            <option value="all">All Modules</option>
            {modules.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </motion.div>

      {/* Alert List */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }} className="bg-bg-card border border-border rounded-xl overflow-hidden card-glow">
        {isLoading && <div className="p-6"><div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-white/[0.06] rounded-xl" />)}</div></div>}
        {error && !alerts.length && (
          <div className="p-6 text-center">
            <p className="text-sm text-red-300">Failed to load alerts</p>
            <p className="text-xs text-fg-dim mt-1">{error instanceof Error ? error.message : 'API unavailable'}</p>
            <button onClick={handleForceSync} className="mt-3 px-3 py-1.5 rounded-lg border border-accent/30 text-xs text-accent-light">Retry</button>
          </div>
        )}
        {!isLoading && !error && alerts.length === 0 && (
          <div className="p-6 text-center">
            <p className="text-sm text-fg-muted">No alerts detected for {domain}</p>
            <p className="text-xs text-fg-dim mt-1">Alerts are generated from Ahrefs, PageSpeed, and rule-based analysis</p>
          </div>
        )}
        <div className="divide-y divide-border">
          {paginated.map(alert => {
            const config = severityConfig[alert.severity]
            const isExpanded = expandedId === alert.id
            return (
              <div key={alert.id}>
                <button onClick={() => setExpandedId(isExpanded ? null : alert.id)} className={`w-full text-left flex items-start gap-2.5 sm:gap-4 px-3.5 sm:px-5 py-3.5 sm:py-4 hover:bg-white/[0.02] transition-colors ${alert.status === 'unread' ? 'bg-white/[0.01]' : ''}`}>
                  <div className={`shrink-0 mt-0.5 w-7 h-7 rounded-full ${config.bg} flex items-center justify-center`}>
                    <span className={`text-xs ${config.text}`}>{config.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-xs md:text-sm font-medium truncate ${alert.status === 'unread' ? 'text-fg' : 'text-fg-muted'}`}>{alert.title}</p>
                      {alert.status === 'unread' && <div className="w-2 h-2 rounded-full bg-accent shrink-0" />}
                    </div>
                    <p className="text-[11px] md:text-xs text-fg-dim mt-0.5 line-clamp-1">{alert.description}</p>
                    <div className="flex items-center gap-1.5 sm:gap-2 mt-1.5 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium touch-target-reset ${config.bg} ${config.text}`}>{config.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-accent/10 text-accent-light touch-target-reset">{alert.module}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-white/[0.06] text-fg-dim touch-target-reset">{alert.source}</span>
                    </div>
                  </div>
                  <span className="text-[11px] md:text-xs text-fg-dim shrink-0 mt-1">{alert.time}</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={`text-fg-dim shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-90' : ''}`}><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="px-3.5 sm:px-5 pb-4 pl-12 sm:pl-16">
                        <p className="text-xs md:text-sm text-fg-muted leading-relaxed">{alert.detail}</p>
                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                          {alert.status !== 'resolved' && (
                            <button onClick={(e) => { e.stopPropagation(); markAs(alert.id, 'resolved') }} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green/15 text-green hover:bg-green/25 transition-colors touch-target-reset">Mark Resolved</button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-between px-4 md:px-5 py-3 border-t border-border gap-2 flex-wrap">
          <p className="text-[11px] text-fg-dim">
            {filtered.length === 0 ? '0 of 0' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} of ${filtered.length}`}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2.5 py-1.5 rounded-lg text-xs text-fg-muted hover:text-fg disabled:opacity-30">← Prev</button>
            <span className="text-xs text-fg-muted px-2">{page}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-2.5 py-1.5 rounded-lg text-xs text-fg-muted hover:text-fg disabled:opacity-30">Next →</button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
