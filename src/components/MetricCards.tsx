import { motion } from 'framer-motion'
import { useAhrefs } from '@/contexts/AhrefsContext'

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toLocaleString()
}

export default function MetricCards() {
  const { siteMetrics, domainRating, backlinksStats, loading } = useAhrefs()

  const metrics = [
    {
      label: 'ORGANIC TRAFFIC',
      value: siteMetrics ? formatNumber(siteMetrics.org_traffic) : '45.2K',
      change: '+12%',
      changeColor: 'text-green',
      arrow: '\u2191',
      period: 'vs last period',
      sparkline: [20, 22, 21, 25, 28, 30, 32, 35, 38, 42, 45, 48],
    },
    {
      label: 'KEYWORDS RANKED',
      value: siteMetrics ? formatNumber(siteMetrics.org_keywords) : '1,247',
      change: '+8%',
      changeColor: 'text-green',
      arrow: '\u2191',
      period: 'vs last period',
      sparkline: [30, 32, 31, 35, 38, 40, 42, 44, 46, 48, 50, 52],
    },
    {
      label: 'BACKLINKS',
      value: backlinksStats ? formatNumber(backlinksStats.live) : '3,891',
      change: '+5%',
      changeColor: 'text-green',
      arrow: '\u2191',
      period: 'vs last period',
      sparkline: [40, 42, 41, 43, 44, 45, 46, 47, 48, 49, 50, 51],
    },
    {
      label: 'DOMAIN RATING',
      value: domainRating ? domainRating.domain_rating.toString() : '62',
      change: 'No change',
      changeColor: 'text-fg-muted',
      arrow: '',
      period: 'vs last period',
      sparkline: [50, 50, 50, 51, 51, 51, 52, 52, 52, 52, 52, 52],
    },
  ]

  return (
    <>
      {metrics.map((metric, i) => (
        <motion.div
          key={metric.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 + i * 0.05 }}
          className="bg-bg-card border border-border rounded-xl p-4 md:p-5 hover:border-border-light transition-all card-glow group"
        >
          <div className="flex items-center gap-1.5 mb-2 md:mb-3">
            <h3 className="text-[11px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">{metric.label}</h3>
            {loading && (
              <div className="w-3 h-3 border border-accent/40 border-t-accent rounded-full animate-spin" />
            )}
          </div>

          <p className="text-2xl md:text-3xl font-bold text-fg">{metric.value}</p>

          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-sm font-medium ${metric.changeColor}`}>
              {metric.arrow} {metric.change}
            </span>
            <span className="text-xs text-fg-dim">{metric.period}</span>
          </div>

          <div className="mt-3">
            <Sparkline data={metric.sparkline} />
          </div>
        </motion.div>
      ))}
    </>
  )
}

function Sparkline({ data }: { data: number[] }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const h = 28
  const w = 120

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w
      const y = h - ((v - min) / range) * (h - 4) - 2
      return `${x},${y}`
    })
    .join(' ')

  const areaPoints = `0,${h} ${points} ${w},${h}`

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#sparkGrad)" />
      <polyline
        points={points}
        fill="none"
        stroke="#3B82F6"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
