import { useEffect, useMemo, useState } from 'react'
import { DataCard } from '@/components/DataCard'
import DataStateBadge from '@/components/DataStateBadge'
import DomainIntegrityBar from '@/components/DomainIntegrityBar'
import SyncButton from '@/components/SyncButton'
import { fetchPageSpeed, type PageSpeedData } from '@/services/seoApi'
import { useSEO } from '@/contexts/SEOContext'
import { useProject } from '@/contexts/ProjectContext'
import { canonicalizeDomain } from '@/lib/domain'
import { useDomainSwitchCleanup } from '@/lib/useDomainQuery'

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color = score >= 90 ? '#22C55E' : score >= 50 ? '#F59E0B' : '#EF4444'
  const pct = score / 100
  const r = 36
  const circ = 2 * Math.PI * r
  const dash = circ * pct
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={r} fill="none" stroke="#1E293B" strokeWidth="8" />
        <circle
          cx="45"
          cy="45"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 45 45)"
        />
        <text x="45" y="50" textAnchor="middle" fill={color} fontSize="18" fontWeight="700">
          {score}
        </text>
      </svg>
      <span className="text-[11px] md:text-xs text-fg-dim">{label}</span>
    </div>
  )
}

function CWVMetric({
  label,
  value,
  unit,
  good,
  poor,
}: {
  label: string
  value: number | null
  unit: string
  good: number
  poor: number
}) {
  const status = value === null ? 'unknown' : value <= good ? 'good' : value <= poor ? 'needs-improvement' : 'poor'
  const colors = {
    good: 'text-green-400',
    'needs-improvement': 'text-yellow-400',
    poor: 'text-red-400',
    unknown: 'text-fg-dim',
  }
  const bgColors = {
    good: 'bg-green-500/10 border-green-500/20',
    'needs-improvement': 'bg-yellow-500/10 border-yellow-500/20',
    poor: 'bg-red-500/10 border-red-500/20',
    unknown: 'bg-white/5 border-white/10',
  }
  return (
    <div className={`rounded-xl border p-3.5 md:p-4 card-glow ${bgColors[status]}`}>
      <p className="text-[11px] md:text-xs text-fg-dim mb-1">{label}</p>
      <p className={`text-2xl md:text-3xl font-bold tabular-nums ${colors[status]}`}>
        {value !== null ? `${value}${unit}` : '—'}
      </p>
      <p className={`text-[11px] md:text-xs mt-1 capitalize ${colors[status]}`}>
        {status === 'needs-improvement' ? 'Needs Improvement' : status.charAt(0).toUpperCase() + status.slice(1)}
      </p>
    </div>
  )
}

export default function VitalsPage() {
  const { domain } = useSEO()
  const { activeProject } = useProject()
  useDomainSwitchCleanup(domain)
  const clean = canonicalizeDomain(domain)
  const [strategy, setStrategy] = useState<'mobile' | 'desktop'>('mobile')
  const [psiData, setPsiData] = useState<PageSpeedData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [runCount, setRunCount] = useState(0)

  // Never paint previous domain PSI results while switching
  useEffect(() => {
    setPsiData(null)
    setError(null)
    setFetchedAt(null)
  }, [clean])

  useEffect(() => {
    if (!clean) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPageSpeed(`https://${clean}`, strategy)
      .then((data) => {
        if (cancelled) return
        // Soft sanity: lighthouse finalUrl should belong to domain when present
        const finalUrl = (data as any)?.lighthouseResult?.finalUrl || (data as any)?.id || ''
        setPsiData(data)
        setFetchedAt(new Date().toISOString())
        setRunCount((n) => n + 1)
        if (finalUrl && !String(finalUrl).toLowerCase().includes(clean) && !String(finalUrl).includes(clean)) {
          // keep data but flag in error soft note
          setError(`PSI returned finalUrl outside ${clean}: ${finalUrl}`)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setPsiData(null)
          setError(e instanceof Error ? e.message : 'PageSpeed failed')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [clean, strategy])

  const cats = psiData?.lighthouseResult?.categories
  const audits = psiData?.lighthouseResult?.audits
  const finalUrl = (psiData as any)?.lighthouseResult?.finalUrl || (psiData as any)?.id || `https://${clean}/`

  const perfScore = cats?.performance ? Math.round(cats.performance.score * 100) : null
  const a11yScore = cats?.accessibility ? Math.round(cats.accessibility.score * 100) : null
  const bpScore = cats?.['best-practices'] ? Math.round(cats['best-practices'].score * 100) : null
  const seoScore = cats?.seo ? Math.round(cats.seo.score * 100) : null

  const lcp = audits?.['largest-contentful-paint']?.numericValue
    ? Math.round(audits['largest-contentful-paint'].numericValue / 100) / 10
    : null
  const cls = audits?.['cumulative-layout-shift']?.numericValue
    ? Math.round(audits['cumulative-layout-shift'].numericValue * 1000) / 1000
    : null
  const fcp = audits?.['first-contentful-paint']?.numericValue
    ? Math.round(audits['first-contentful-paint'].numericValue / 100) / 10
    : null
  const tbt = audits?.['total-blocking-time']?.numericValue
    ? Math.round(audits['total-blocking-time'].numericValue)
    : null
  const si = audits?.['speed-index']?.numericValue
    ? Math.round(audits['speed-index'].numericValue / 100) / 10
    : null
  const tti = audits?.interactive?.numericValue ? Math.round(audits.interactive.numericValue / 100) / 10 : null

  const opportunities = useMemo(() => {
    if (!audits) return []
    return Object.values(audits)
      .filter((a: any) => a && a.score !== null && a.score < 0.9 && a.details?.type === 'opportunity')
      .sort((a: any, b: any) => (a.score ?? 1) - (b.score ?? 1))
      .slice(0, 8) as Array<{ id: string; title: string; displayValue?: string; score?: number | null; description?: string }>
  }, [audits])

  const dataState = !clean
    ? 'unavailable'
    : loading
      ? 'loading'
      : error && !psiData
        ? 'unavailable'
        : psiData
          ? 'live'
          : 'unavailable'

  const rerun = () => {
    // force effect by toggling strategy briefly is messy — remount via nonce
    setPsiData(null)
    setError(null)
    setFetchedAt(null)
    setRunCount((n) => n + 1)
    if (!clean) return
    setLoading(true)
    fetchPageSpeed(`https://${clean}`, strategy)
      .then((data) => {
        setPsiData(data)
        setFetchedAt(new Date().toISOString())
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'PageSpeed failed'))
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-4 lg:space-y-5 pt-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Core Web Vitals</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">
            Live Lighthouse / PSI for <span className="font-medium text-fg">{clean || '—'}</span>
            {activeProject?.name ? ` · ${activeProject.name}` : ''} — no synthetic history
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-bg-card border border-border rounded-lg p-1">
            {(['mobile', 'desktop'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStrategy(s)}
                className={`px-3.5 md:px-4 py-1.5 rounded text-xs md:text-sm font-medium transition-colors capitalize ${
                  strategy === s ? 'bg-accent text-white' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <SyncButton onClick={rerun} loading={loading} label="Re-run PSI" loadingLabel="Running…" />
          <DataStateBadge state={dataState as any} source="PageSpeed" fetchedAt={fetchedAt} />
        </div>
      </div>

      <DomainIntegrityBar
        activeDomain={clean}
        payloadDomain={clean}
        dataState={dataState}
        fetchedAt={fetchedAt}
        rowCount={psiData ? 1 : 0}
        extra={finalUrl ? `finalUrl: ${String(finalUrl).slice(0, 80)}` : undefined}
      />

      {!clean && (
        <div className="rounded-xl border border-border bg-bg-card p-6 text-sm text-fg-muted text-center">
          Choose a project domain to run real PageSpeed Insights.
        </div>
      )}

      <DataCard title={`Lighthouse scores · ${strategy}`} dataState={dataState as any} fetchedAt={fetchedAt} error={error && !psiData ? error : undefined}>
        <div className="flex flex-wrap justify-around gap-3 md:gap-4 py-2">
          {perfScore !== null && <ScoreGauge score={perfScore} label="Performance" />}
          {a11yScore !== null && <ScoreGauge score={a11yScore} label="Accessibility" />}
          {bpScore !== null && <ScoreGauge score={bpScore} label="Best Practices" />}
          {seoScore !== null && <ScoreGauge score={seoScore} label="SEO" />}
          {!loading && !psiData && (
            <p className="text-xs md:text-sm text-fg-muted py-4">
              {error || 'No live PSI data yet — click Re-run PSI'}
            </p>
          )}
        </div>
      </DataCard>

      <DataCard title="Core Web Vitals (this run)" dataState={dataState as any} fetchedAt={fetchedAt}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          <CWVMetric label="LCP" value={lcp} unit="s" good={2.5} poor={4} />
          <CWVMetric label="CLS" value={cls} unit="" good={0.1} poor={0.25} />
          <CWVMetric label="FCP" value={fcp} unit="s" good={1.8} poor={3} />
          <CWVMetric label="TBT" value={tbt} unit="ms" good={200} poor={600} />
          <CWVMetric label="Speed Index" value={si} unit="s" good={3.4} poor={5.8} />
          <CWVMetric label="TTI" value={tti} unit="s" good={3.8} poor={7.3} />
        </div>
        <p className="mt-3 text-[11px] text-fg-dim">
          Lab data from Google PageSpeed Insights for this domain run only. Historical charts require stored snapshots (not invented).
          {runCount > 0 ? ` · runs this session: ${runCount}` : ''}
        </p>
      </DataCard>

      {opportunities.length > 0 && (
        <DataCard title="Improvement opportunities" dataState="live" fetchedAt={fetchedAt}>
          <div className="space-y-2">
            {opportunities.map((opp) => (
              <div key={opp.id} className="flex items-start gap-3 p-3.5 md:p-3 bg-bg-darkest rounded-lg border border-border">
                <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${(opp.score ?? 1) < 0.5 ? 'bg-red-400' : 'bg-yellow-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm font-medium text-fg">{opp.title}</p>
                  {opp.displayValue && <p className="text-[11px] md:text-xs text-fg-dim mt-0.5">{opp.displayValue}</p>}
                </div>
              </div>
            ))}
          </div>
        </DataCard>
      )}

      {error && psiData && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-xs text-amber-100">
          {error}
        </div>
      )}
    </div>
  )
}
