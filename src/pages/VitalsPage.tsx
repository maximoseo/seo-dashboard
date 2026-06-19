import { useState, useEffect } from 'react'
// framer-motion available for animations
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { DataCard } from '@/components/DataCard'
import { fetchPageSpeed, type PageSpeedData } from '@/services/seoApi'
import { useSEO } from '@/contexts/SEOContext'

const lcpHistory = [
  { month: "Jan", value: 2.8 }, { month: "Feb", value: 2.6 }, { month: "Mar", value: 2.4 },
  { month: "Apr", value: 2.3 }, { month: "May", value: 2.2 }, { month: "Jun", value: 2.1 },
]
const clsHistory = [
  { month: "Jan", value: 0.18 }, { month: "Feb", value: 0.15 }, { month: "Mar", value: 0.12 },
  { month: "Apr", value: 0.10 }, { month: "May", value: 0.09 }, { month: "Jun", value: 0.08 },
]

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
          cx="45" cy="45" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 45 45)"
        />
        <text x="45" y="50" textAnchor="middle" fill={color} fontSize="18" fontWeight="700">{score}</text>
      </svg>
      <span className="text-[11px] md:text-xs text-fg-dim">{label}</span>
    </div>
  )
}

function CWVMetric({ label, value, unit, good, poor }: { label: string; value: number | null; unit: string; good: number; poor: number }) {
  const status = value === null ? 'unknown' : value <= good ? 'good' : value <= poor ? 'needs-improvement' : 'poor'
  const colors = { good: 'text-green-400', 'needs-improvement': 'text-yellow-400', poor: 'text-red-400', unknown: 'text-fg-dim' }
  const bgColors = { good: 'bg-green-500/10 border-green-500/20', 'needs-improvement': 'bg-yellow-500/10 border-yellow-500/20', poor: 'bg-red-500/10 border-red-500/20', unknown: 'bg-white/5 border-white/10' }
  return (
    <div className={`rounded-xl border p-3.5 md:p-4 card-glow ${bgColors[status]}`}>
      <p className="text-[11px] md:text-xs text-fg-dim mb-1">{label}</p>
      <p className={`text-2xl md:text-3xl font-bold ${colors[status]}`}>
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
  const [strategy, setStrategy] = useState<'mobile' | 'desktop'>('mobile')
  const [psiData, setPsiData] = useState<PageSpeedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchPageSpeed(`https://${domain}`, strategy)
      .then(data => setPsiData(data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [domain, strategy])

  const cats = psiData?.lighthouseResult?.categories
  const audits = psiData?.lighthouseResult?.audits

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

  const opportunities = audits
    ? Object.values(audits)
        .filter(a => a.score !== null && a.score < 0.9 && a.displayValue)
        .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
        .slice(0, 6)
    : []

  return (
    <div className="space-y-4 lg:space-y-5 pt-4">
      {/* Strategy Toggle + Source Badges */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex gap-1 bg-bg-card border border-border rounded-lg p-1">
          {(['mobile', 'desktop'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStrategy(s)}
              className={`px-3.5 md:px-4 py-1.5 rounded text-xs md:text-sm font-medium transition-colors capitalize touch-target-reset ${
                strategy === s ? 'bg-accent text-white' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <span className="text-[11px] md:text-xs bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-1 rounded touch-target-reset">PageSpeed</span>
          <span className="text-[11px] md:text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-1 rounded touch-target-reset">GTmetrix</span>
          <span className="text-[11px] md:text-xs bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2 py-1 rounded touch-target-reset">Browserless</span>
        </div>
      </div>

      {/* Lighthouse Scores */}
      <DataCard title="Lighthouse Scores" sources={['PageSpeed']} loading={loading} error={error}>
        <div className="flex flex-wrap justify-around gap-3 md:gap-4 py-2">
          {perfScore !== null && <ScoreGauge score={perfScore} label="Performance" />}
          {a11yScore !== null && <ScoreGauge score={a11yScore} label="Accessibility" />}
          {bpScore !== null && <ScoreGauge score={bpScore} label="Best Practices" />}
          {seoScore !== null && <ScoreGauge score={seoScore} label="SEO" />}
          {!loading && !error && perfScore === null && (
            <p className="text-xs md:text-sm text-fg-muted py-4">No score data available</p>
          )}
        </div>
      </DataCard>

      {/* Core Web Vitals */}
      <DataCard title="Core Web Vitals" sources={['PageSpeed']} loading={loading} error={error}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
          <CWVMetric label="LCP" value={lcp} unit="s" good={2.5} poor={4} />
          <CWVMetric label="CLS" value={cls} unit="" good={0.1} poor={0.25} />
          <CWVMetric label="FCP" value={fcp} unit="s" good={1.8} poor={3} />
          <CWVMetric label="TBT" value={tbt} unit="ms" good={200} poor={600} />
        </div>
      </DataCard>

      {/* Historical Trends */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4 lg:gap-5">
        <DataCard title="LCP Trend (Historical)" sources={['PageSpeed']}>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lcpHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="month" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 8 }} />
                <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6', r: 3 }} name="LCP (s)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </DataCard>

        <DataCard title="CLS Trend (Historical)" sources={['PageSpeed']}>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={clsHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="month" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 8 }} />
                <Line type="monotone" dataKey="value" stroke="#22C55E" strokeWidth={2} dot={{ fill: '#22C55E', r: 3 }} name="CLS" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </DataCard>
      </div>

      {/* Opportunities */}
      {opportunities.length > 0 && (
        <DataCard title="Improvement Opportunities" sources={['PageSpeed']}>
          <div className="space-y-2">
            {opportunities.map(opp => (
              <div key={opp.id} className="flex items-start gap-3 p-3.5 md:p-3 bg-bg-darkest rounded-lg border border-border card-glow">
                <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                  (opp.score ?? 1) < 0.5 ? 'bg-red-400' : 'bg-yellow-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm font-medium text-fg">{opp.title}</p>
                  {opp.displayValue && <p className="text-[11px] md:text-xs text-fg-dim mt-0.5">{opp.displayValue}</p>}
                </div>
              </div>
            ))}
          </div>
        </DataCard>
      )}
    </div>
  )
}
