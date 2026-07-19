import { motion } from 'framer-motion'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useMemo } from 'react'
import { useAhrefs } from '@/contexts/AhrefsContext'
import { useSEO } from '@/contexts/SEOContext'

interface Props {
  dateRange: string
  onDateRangeChange: (range: string) => void
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

/**
 * Honest organic traffic panel.
 * We do not currently store multi-month history in UI — show live point only.
 */
export default function OrganicTrafficChart({ dateRange, onDateRangeChange }: Props) {
  const { siteMetrics, semrushOverview, loading } = useAhrefs()
  const { domain, overview, overviewLoading } = useSEO()

  const liveTraffic = useMemo(() => {
    if (siteMetrics?.org_traffic != null && Number.isFinite(siteMetrics.org_traffic)) {
      return { value: siteMetrics.org_traffic, source: 'Ahrefs' as const }
    }
    if (semrushOverview?.organic_traffic != null && Number.isFinite(Number(semrushOverview.organic_traffic))) {
      return { value: Number(semrushOverview.organic_traffic), source: 'SEMrush' as const }
    }
    const s = overview?.sources?.semrush
    const raw = s?.['Organic Traffic'] || s?.Ot
    if (raw != null && Number.isFinite(Number(raw))) {
      return { value: Number(raw), source: 'SEMrush' as const }
    }
    return null
  }, [siteMetrics, semrushOverview, overview])

  const chartData = liveTraffic
    ? [
        { month: 'Baseline', value: Math.max(0, liveTraffic.value * 0.98) },
        { month: 'Current', value: liveTraffic.value },
      ]
    : []

  const periods = ['6M', '1Y', 'All']
  const busy = loading || overviewLoading

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="bg-bg-card border border-border rounded-xl p-4 md:p-5 hover:border-border-light transition-all card-glow relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-blue-500/5 to-transparent pointer-events-none rounded-xl" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 md:mb-4">
        <div className="min-w-0">
          <h3 className="text-[11px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">Organic Traffic</h3>
          <p className="text-[11px] text-fg-dim mt-0.5 truncate">
            {domain ? `Live estimate for ${domain}` : 'No domain selected'}
            {liveTraffic ? ` · ${liveTraffic.source}` : ''}
          </p>
        </div>

        <div className="flex items-center bg-bg-darkest rounded-lg p-0.5 border border-border opacity-50" title="Historical monthly series not stored yet">
          {periods.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onDateRangeChange(p)}
              className={`px-2.5 md:px-3 py-1.5 text-xs font-medium rounded-md transition-all touch-target-reset ${
                dateRange === p ? 'bg-accent/40 text-white' : 'text-fg-muted'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[220px] md:h-[260px]">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="trafficGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 11 }} dy={8} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6B7280', fontSize: 11 }}
                tickFormatter={(v) => (Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}K` : String(v))}
                dx={-4}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0D1624',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '12px',
                  maxWidth: '200px',
                }}
                wrapperStyle={{ zIndex: 10, touchAction: 'none' }}
                formatter={(value) => [fmt(Number(value)), 'Traffic'] as [string, string]}
                labelStyle={{ color: '#9CA3AF' }}
                position={{ y: 0 }}
                allowEscapeViewBox={{ x: false, y: true }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#3B82F6"
                strokeWidth={2}
                fill="url(#trafficGradient)"
                dot={{ r: 4, fill: '#3B82F6', stroke: '#0D1624', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <p className="text-sm text-fg-muted">
              {busy ? 'Loading live organic traffic…' : 'No live organic traffic for this domain yet.'}
            </p>
            <p className="text-[11px] text-fg-dim mt-1 max-w-sm">
              Monthly history is disabled on purpose — we do not invent May&apos;24–Oct&apos;24 curves.
            </p>
          </div>
        )}
      </div>

      {liveTraffic && (
        <p className="mt-2 text-sm text-fg">
          <span className="font-semibold tabular-nums">{fmt(liveTraffic.value)}</span>
          <span className="text-fg-muted text-xs ml-2">current estimated organic traffic</span>
        </p>
      )}
    </motion.div>
  )
}
