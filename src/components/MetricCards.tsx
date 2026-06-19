import { motion } from 'framer-motion'
import { useAhrefs } from '@/contexts/AhrefsContext'

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toLocaleString()
}

const metricConfig = [
  {
    label: 'ORGANIC TRAFFIC',
    accent: 'metric-accent-blue',
    iconBg: 'bg-blue-500/15',
    iconColor: '#3B82F6',
    sparkColor: '#3B82F6',
    sparkGradId: 'sparkBlue',
  },
  {
    label: 'KEYWORDS RANKED',
    accent: 'metric-accent-green',
    iconBg: 'bg-green-500/15',
    iconColor: '#22C55E',
    sparkColor: '#22C55E',
    sparkGradId: 'sparkGreen',
  },
  {
    label: 'BACKLINKS',
    accent: 'metric-accent-purple',
    iconBg: 'bg-purple-500/15',
    iconColor: '#8B5CF6',
    sparkColor: '#8B5CF6',
    sparkGradId: 'sparkPurple',
  },
  {
    label: 'DOMAIN RATING',
    accent: 'metric-accent-amber',
    iconBg: 'bg-amber-500/15',
    iconColor: '#F59E0B',
    sparkColor: '#F59E0B',
    sparkGradId: 'sparkAmber',
  },
]

export default function MetricCards() {
  const { siteMetrics, domainRating, backlinksStats, loading } = useAhrefs()

  const metrics = [
    {
      value: siteMetrics ? formatNumber(siteMetrics.org_traffic) : '45.2K',
      change: '+12%',
      changeColor: 'text-green',
      arrow: '\u2191',
      period: 'vs last period',
      sparkline: [20, 22, 21, 25, 28, 30, 32, 35, 38, 42, 45, 48],
    },
    {
      value: siteMetrics ? formatNumber(siteMetrics.org_keywords) : '1,247',
      change: '+8%',
      changeColor: 'text-green',
      arrow: '\u2191',
      period: 'vs last period',
      sparkline: [30, 32, 31, 35, 38, 40, 42, 44, 46, 48, 50, 52],
    },
    {
      value: backlinksStats ? formatNumber(backlinksStats.live) : '3,891',
      change: '+5%',
      changeColor: 'text-green',
      arrow: '\u2191',
      period: 'vs last period',
      sparkline: [40, 42, 41, 43, 44, 45, 46, 47, 48, 49, 50, 51],
    },
    {
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
      {metrics.map((metric, i) => {
        const cfg = metricConfig[i]
        return (
          <motion.div
            key={cfg.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 + i * 0.05 }}
            className={`bg-bg-card border border-border rounded-xl p-4 md:p-5 hover:border-border-light transition-all card-glow group ${cfg.accent}`}
          >
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-lg ${cfg.iconBg} flex items-center justify-center`}>
                  <MetricIcon type={i} color={cfg.iconColor} />
                </div>
                <h3 className="text-[11px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">{cfg.label}</h3>
              </div>
              {loading && (
                <div className="w-3 h-3 border border-accent/40 border-t-accent rounded-full animate-spin" />
              )}
            </div>

            <p className="text-2xl md:text-3xl font-bold text-fg">{metric.value}</p>

            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-sm font-medium ${metric.changeColor} flex items-center gap-0.5`}>
                {metric.arrow && <span className="text-xs">{metric.arrow}</span>} {metric.change}
              </span>
              <span className="text-xs text-fg-dim">{metric.period}</span>
            </div>

            <div className="mt-3 opacity-60 group-hover:opacity-100 transition-opacity">
              <Sparkline data={metric.sparkline} color={cfg.sparkColor} gradId={cfg.sparkGradId} />
            </div>
          </motion.div>
        )
      })}
    </>
  )
}

function MetricIcon({ type, color }: { type: number; color: string }) {
  switch (type) {
    case 0: // Traffic
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 10l3-4 3 2.5 3-5 3 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 1: // Keywords
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="4" stroke={color} strokeWidth="1.5" />
          <path d="M9 9l3.5 3.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 2: // Backlinks
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M6 8l2-2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M8 6l1-1a2 2 0 00-2.8-2.8L5 3.2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M6 8l-1 1a2 2 0 002.8 2.8L9 10.8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 3: // Domain Rating
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.07l-3.52 1.78.67-3.93L1.3 5.14l3.94-.57L7 1z" stroke={color} strokeWidth="1.3" strokeLinejoin="round" fill="none" />
        </svg>
      )
    default:
      return null
  }
}

function Sparkline({ data, color, gradId }: { data: number[]; color: string; gradId: string }) {
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
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
