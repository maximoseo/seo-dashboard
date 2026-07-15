import { motion } from 'framer-motion'
import { useAhrefs } from '@/contexts/AhrefsContext'
import { useSEO } from '@/contexts/SEOContext'

function formatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

const metricConfig = [
  {
    label: 'ORGANIC TRAFFIC',
    accent: 'metric-accent-blue',
    iconBg: 'bg-blue-500/15',
    iconColor: '#3B82F6',
  },
  {
    label: 'KEYWORDS RANKED',
    accent: 'metric-accent-green',
    iconBg: 'bg-green-500/15',
    iconColor: '#22C55E',
  },
  {
    label: 'BACKLINKS',
    accent: 'metric-accent-purple',
    iconBg: 'bg-purple-500/15',
    iconColor: '#8B5CF6',
  },
  {
    label: 'DOMAIN RATING',
    accent: 'metric-accent-amber',
    iconBg: 'bg-amber-500/15',
    iconColor: '#F59E0B',
  },
]

export default function MetricCards() {
  const { siteMetrics, domainRating, backlinksStats, semrushOverview, loading } = useAhrefs()
  const { overview, overviewLoading } = useSEO()

  const semTraffic = semrushOverview?.organic_traffic
  const semKeywords = semrushOverview?.organic_keywords

  const traffic =
    siteMetrics?.org_traffic ??
    (semTraffic != null ? Number(semTraffic) : null) ??
    (overview?.sources?.semrush?.['Organic Traffic']
      ? Number(overview.sources.semrush['Organic Traffic'])
      : overview?.sources?.semrush?.Ot
        ? Number(overview.sources.semrush.Ot)
        : null)

  const keywords =
    siteMetrics?.org_keywords ??
    (semKeywords != null ? Number(semKeywords) : null) ??
    (overview?.sources?.semrush?.['Organic Keywords']
      ? Number(overview.sources.semrush['Organic Keywords'])
      : overview?.sources?.semrush?.Or
        ? Number(overview.sources.semrush.Or)
        : null)

  const backlinks =
    backlinksStats?.live ??
    (typeof overview?.sources?.dataforseo?.backlinks === 'number'
      ? overview.sources.dataforseo.backlinks
      : null) ??
    (typeof overview?.sources?.ahrefs?.metrics?.backlinks === 'number'
      ? overview.sources.ahrefs.metrics.backlinks
      : null)

  const dr =
    domainRating?.domain_rating ??
    overview?.sources?.ahrefs?.domain_rating?.domain_rating ??
    null

  const metrics = [
    {
      value: formatNumber(Number.isFinite(Number(traffic)) ? Number(traffic) : null),
      source: siteMetrics?.org_traffic != null ? 'Ahrefs' : semTraffic != null || overview?.sources?.semrush ? 'SEMrush' : null,
      hasData: Number.isFinite(Number(traffic)),
    },
    {
      value: formatNumber(Number.isFinite(Number(keywords)) ? Number(keywords) : null),
      source: siteMetrics?.org_keywords != null ? 'Ahrefs' : semKeywords != null || overview?.sources?.semrush ? 'SEMrush' : null,
      hasData: Number.isFinite(Number(keywords)),
    },
    {
      value: formatNumber(Number.isFinite(Number(backlinks)) ? Number(backlinks) : null),
      source: backlinksStats?.live != null ? 'Ahrefs' : overview?.sources?.dataforseo?.backlinks != null ? 'DataForSEO' : null,
      hasData: Number.isFinite(Number(backlinks)),
    },
    {
      value: dr != null && Number.isFinite(Number(dr)) ? String(Math.round(Number(dr))) : '—',
      source: domainRating?.domain_rating != null || overview?.sources?.ahrefs?.domain_rating ? 'Ahrefs' : null,
      hasData: dr != null && Number.isFinite(Number(dr)),
    },
  ]

  const busy = loading || overviewLoading

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
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-7 h-7 rounded-lg ${cfg.iconBg} flex items-center justify-center shrink-0`}>
                  <MetricIcon type={i} color={cfg.iconColor} />
                </div>
                <h3 className="text-[11px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted truncate">{cfg.label}</h3>
              </div>
              {busy && <div className="w-3 h-3 border border-accent/40 border-t-accent rounded-full animate-spin" />}
            </div>

            <p className="text-2xl md:text-3xl font-bold text-fg tabular-nums">{metric.value}</p>

            <div className="mt-1.5 flex items-center gap-2">
              {metric.hasData && metric.source ? (
                <span className="text-[10px] md:text-[11px] text-fg-dim border border-border rounded-md px-1.5 py-0.5">
                  {metric.source}
                </span>
              ) : (
                <span className="text-[11px] md:text-xs text-fg-dim">
                  {busy ? 'Loading live metric…' : 'No live value for this domain'}
                </span>
              )}
            </div>
          </motion.div>
        )
      })}
    </>
  )
}

function MetricIcon({ type, color }: { type: number; color: string }) {
  switch (type) {
    case 0:
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 10l3-4 3 2.5 3-5 3 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 1:
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="4" stroke={color} strokeWidth="1.5" />
          <path d="M9 9l3.5 3.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 2:
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M6 8l2-2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M8 6l1-1a2 2 0 00-2.8-2.8L5 3.2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M6 8l-1 1a2 2 0 002.8 2.8L9 10.8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 3:
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.07l-3.52 1.78.67-3.93L1.3 5.14l3.94-.57L7 1z" stroke={color} strokeWidth="1.3" strokeLinejoin="round" fill="none" />
        </svg>
      )
    default:
      return null
  }
}
