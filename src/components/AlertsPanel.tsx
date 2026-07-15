import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { useAlerts } from '@/api/client'
import { useSEO } from '@/contexts/SEOContext'
import { buildProjectPath } from '@/lib/projectRoutes'
import { canonicalizeDomain } from '@/lib/domain'

type Severity = 'warning' | 'critical' | 'info' | 'error'

function normalizeSeverity(raw?: string | null): Severity {
  const s = String(raw || '').toLowerCase()
  if (s === 'critical' || s === 'error' || s === 'high') return 'critical'
  if (s === 'info' || s === 'low') return 'info'
  return 'warning'
}

function relativeTime(iso?: string | null) {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const delta = Date.now() - t
  const mins = Math.floor(delta / 60000)
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function AlertsPanel() {
  const { domain } = useSEO()
  const clean = canonicalizeDomain(domain)
  const { data, isLoading, error } = useAlerts(clean || null)

  const alerts = useMemo(() => {
    const rows = (data as any)?.alerts || (data as any)?.normalized || []
    return (Array.isArray(rows) ? rows : [])
      .map((a: any, idx: number) => ({
        id: String(a.id || a.fingerprint || `${a.title || 'alert'}-${idx}`),
        severity: normalizeSeverity(a.severity || a.level || a.priority),
        title: String(a.title || a.message || a.name || 'Alert'),
        description: String(a.description || a.detail || a.brief || a.message || ''),
        time: relativeTime(a.createdAt || a.created_at || a.fetchedAt || (data as any)?.fetchedAt),
      }))
      .slice(0, 5)
  }, [data])

  const alertsHref = clean ? buildProjectPath(clean, 'alerts') : '/projects'
  const count = alerts.length

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.5 }}
      className="bg-bg-card border border-border rounded-xl p-5 hover:border-border-light transition-colors"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-semibold tracking-wider uppercase text-fg-muted">Alerts</h3>
          <p className="text-[11px] text-fg-dim mt-0.5">{clean || 'No domain'}</p>
        </div>
        <span className="bg-accent text-white text-[11px] font-semibold min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center">
          {isLoading ? '…' : count}
        </span>
      </div>

      <div className="space-y-3">
        {alerts.map((alert) => (
          <Link
            key={alert.id}
            to={alertsHref}
            className="w-full text-left flex items-start gap-3 p-3 rounded-lg hover:bg-white/[0.03] transition-colors group -mx-1"
          >
            <div className="shrink-0 mt-0.5">
              {alert.severity === 'critical' ? (
                <div className="w-6 h-6 rounded-full bg-red/15 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="5.5" fill="#EF4444" />
                    <path d="M7 4.5v3" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
                    <circle cx="7" cy="9.5" r="0.5" fill="white" />
                  </svg>
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-yellow/15 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 2L1.5 12h11L7 2z" fill="#F59E0B" />
                    <path d="M7 6v2.5" stroke="#0A0F1E" strokeWidth="1.2" strokeLinecap="round" />
                    <circle cx="7" cy="10" r="0.5" fill="#0A0F1E" />
                  </svg>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-fg truncate">{alert.title}</p>
                {alert.time && <span className="text-[11px] text-fg-dim shrink-0">{alert.time}</span>}
              </div>
              {alert.description && <p className="text-xs text-fg-muted mt-0.5 line-clamp-2">{alert.description}</p>}
            </div>
          </Link>
        ))}

        {!isLoading && alerts.length === 0 && (
          <p className="text-xs md:text-sm text-fg-muted py-3">
            {error ? 'Could not load alerts for this domain.' : 'No open alerts for this domain.'}
          </p>
        )}
        {isLoading && <p className="text-xs text-fg-dim">Loading alerts…</p>}
      </div>

      <Link to={alertsHref} className="mt-3 text-sm font-medium text-accent hover:text-accent-light transition-colors inline-flex items-center gap-1">
        View all alerts
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </motion.div>
  )
}
