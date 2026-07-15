import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAhrefs } from '@/contexts/AhrefsContext'
import { useSEO } from '@/contexts/SEOContext'
import { buildProjectPath } from '@/lib/projectRoutes'
import { canonicalizeDomain } from '@/lib/domain'

type VitalStatus = 'good' | 'needs-improvement' | 'poor' | 'unknown'

function statusOf(value: number | null, good: number, poor: number): VitalStatus {
  if (value == null || !Number.isFinite(value)) return 'unknown'
  if (value <= good) return 'good'
  if (value <= poor) return 'needs-improvement'
  return 'poor'
}

function colorOf(status: VitalStatus) {
  if (status === 'good') return '#22C55E'
  if (status === 'needs-improvement') return '#F59E0B'
  if (status === 'poor') return '#EF4444'
  return '#6B7280'
}

function labelOf(status: VitalStatus) {
  if (status === 'needs-improvement') return 'Needs work'
  if (status === 'unknown') return 'No data'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export default function CoreWebVitals() {
  const { pagespeedMobile, loading } = useAhrefs()
  const { domain } = useSEO()
  const clean = canonicalizeDomain(domain)

  const lh = pagespeedMobile?.lighthouse
  const crux = pagespeedMobile?.crux

  const lcpSec =
    lh?.lcp != null && lh.lcp > 0
      ? Math.round(lh.lcp / 100) / 10
      : crux?.lcp_ms
        ? Math.round(crux.lcp_ms / 100) / 10
        : null
  const cls =
    lh?.cls != null && Number.isFinite(lh.cls)
      ? Math.round(lh.cls * 1000) / 1000
      : crux?.cls_score != null
        ? Math.round(crux.cls_score * 1000) / 1000
        : null
  const tbtMs = lh?.tbt != null && lh.tbt > 0 ? Math.round(lh.tbt) : crux?.inp_ms || null

  const vitals = [
    {
      label: 'LCP',
      fullLabel: 'Largest Contentful Paint',
      value: lcpSec != null ? String(lcpSec) : '—',
      unit: lcpSec != null ? 's' : '',
      status: statusOf(lcpSec, 2.5, 4),
      threshold: 'Good < 2.5s',
    },
    {
      label: crux?.inp_ms ? 'INP' : 'TBT',
      fullLabel: crux?.inp_ms ? 'Interaction to Next Paint' : 'Total Blocking Time',
      value: tbtMs != null ? String(tbtMs) : '—',
      unit: tbtMs != null ? 'ms' : '',
      status: statusOf(tbtMs, 200, 500),
      threshold: 'Good < 200ms',
    },
    {
      label: 'CLS',
      fullLabel: 'Cumulative Layout Shift',
      value: cls != null ? String(cls) : '—',
      unit: '',
      status: statusOf(cls, 0.1, 0.25),
      threshold: 'Good < 0.1',
    },
  ]

  const vitalsHref = clean ? buildProjectPath(clean, 'vitals') : '/projects'
  const hasAny = lcpSec != null || cls != null || tbtMs != null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.45 }}
      className="bg-bg-card border border-border rounded-xl p-5 hover:border-border-light transition-colors"
    >
      <div className="flex items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-xs font-semibold tracking-wider uppercase text-fg-muted">Core Web Vitals</h3>
          <p className="text-[11px] text-fg-dim mt-0.5">{clean || 'No domain'} · live PSI</p>
        </div>
        {loading && <div className="w-3 h-3 border border-accent/40 border-t-accent rounded-full animate-spin" />}
      </div>

      {!hasAny && !loading ? (
        <p className="text-xs md:text-sm text-fg-muted py-6 text-center">
          No live PageSpeed metrics for this domain yet. Open Vitals to run PSI.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-2">
            {vitals.map((v) => (
              <div key={v.label} className="text-center">
                <p className="text-sm font-semibold text-fg">{v.label}</p>
                <p className="text-[10px] text-fg-dim mt-0.5 line-clamp-2">{v.fullLabel}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {vitals.map((v) => (
              <VitalGauge key={v.label} value={v.value} unit={v.unit} status={v.status} color={colorOf(v.status)} />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 mt-2">
            {vitals.map((v) => (
              <p key={v.label} className="text-[10px] text-fg-dim text-center">
                {v.threshold}
              </p>
            ))}
          </div>
        </>
      )}

      <Link to={vitalsHref} className="mt-4 text-sm font-medium text-accent hover:text-accent-light transition-colors flex items-center gap-1 mx-auto w-fit">
        View full report
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </motion.div>
  )
}

function VitalGauge({
  value,
  unit,
  status,
  color,
}: {
  value: string
  unit: string
  status: VitalStatus
  color: string
}) {
  const [animated, setAnimated] = useState(0)
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const arcLength = circumference * 0.75
  const score = status === 'good' ? 90 : status === 'needs-improvement' ? 55 : status === 'poor' ? 25 : 0

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(score), 250)
    return () => clearTimeout(timer)
  }, [score])

  const progress = (animated / 100) * arcLength

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[90px] h-[90px]">
        <svg width="90" height="90" viewBox="0 0 90 90" style={{ transform: 'rotate(135deg)' }}>
          <circle
            cx="45"
            cy="45"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="6"
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          <circle
            cx="45"
            cy="45"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={`${progress} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-fg tabular-nums">
            {value}
            <span className="text-sm font-medium text-fg-muted">{unit}</span>
          </span>
        </div>
      </div>
      <p className="text-xs font-medium mt-1" style={{ color }}>
        {labelOf(status)}
      </p>
    </div>
  )
}
