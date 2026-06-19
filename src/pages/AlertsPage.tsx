import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type Severity = 'critical' | 'warning' | 'info'
type AlertStatus = 'unread' | 'read' | 'resolved'

interface Alert {
  id: string
  severity: Severity
  title: string
  description: string
  detail: string
  module: string
  time: string
  timestamp: number
  status: AlertStatus
}

const initialAlerts: Alert[] = [
  { id: '1', severity: 'critical', title: 'Backlink lost from examplepartner.com', description: 'A high-authority dofollow backlink (DR 85) was lost.', detail: 'The backlink from examplepartner.com/resources pointing to /tools/keyword-research was removed on Oct 30, 2024. This was a dofollow link with DR 85. Consider reaching out to restore the link or find a replacement.', module: 'Backlinks', time: '1d ago', timestamp: Date.now() - 86400000, status: 'unread' },
  { id: '2', severity: 'warning', title: 'High CLS detected on /blog/on-page-seo', description: 'CLS value is 0.18 which is above the recommended threshold of 0.1.', detail: 'The page /blog/on-page-seo has a CLS of 0.18, exceeding the "Good" threshold of 0.1. Main contributors: late-loading images without dimensions and dynamically injected ad units. Fix: Add width/height attributes to images and reserve space for ad slots.', module: 'Vitals', time: '2h ago', timestamp: Date.now() - 7200000, status: 'unread' },
  { id: '3', severity: 'warning', title: 'Drop in rankings for "technical seo"', description: 'Position dropped from 7 to 9 in the last 7 days.', detail: 'The keyword "technical seo" dropped from position 7 to 9. Competitor semrush.com published a new comprehensive guide that may be outranking your content. Consider updating your /blog/technical-seo page with fresh content and additional internal links.', module: 'Rankings', time: '5h ago', timestamp: Date.now() - 18000000, status: 'unread' },
  { id: '4', severity: 'info', title: 'New referring domain: hubspot.com', description: 'A new dofollow backlink was detected from hubspot.com.', detail: 'hubspot.com (DR 93) linked to your /blog/seo-best-practices page from their resource roundup. This is a high-quality editorial link that should positively impact your rankings.', module: 'Backlinks', time: '8h ago', timestamp: Date.now() - 28800000, status: 'read' },
  { id: '5', severity: 'warning', title: 'Page /tools/broken-checker has slow LCP', description: 'LCP is 4.1s, well above the 2.5s threshold.', detail: 'The page /tools/broken-checker has an LCP of 4.1s. The largest element is a hero image (2.4MB). Recommendations: compress the image, serve WebP format, implement lazy loading for below-fold images, and consider a CDN.', module: 'Vitals', time: '12h ago', timestamp: Date.now() - 43200000, status: 'read' },
  { id: '6', severity: 'critical', title: '404 error on /old-feature', description: 'This page is returning a 404 status and has 12 backlinks pointing to it.', detail: 'The page /old-feature returns a 404 error but still has 12 external backlinks. Set up a 301 redirect to the most relevant active page to preserve link equity. Suggested redirect target: /tools', module: 'Pages', time: '1d ago', timestamp: Date.now() - 86400000, status: 'unread' },
  { id: '7', severity: 'info', title: 'Keyword "seo best practices 2024" entered Top 3', description: 'Position improved from 6 to 2.', detail: 'Great news! Your page /blog/seo-best-practices now ranks #2 for "seo best practices 2024" (volume: 1,900/mo). This improvement likely came from the recent content update and new internal links added last week.', module: 'Rankings', time: '2d ago', timestamp: Date.now() - 172800000, status: 'read' },
  { id: '8', severity: 'warning', title: 'Organic traffic dip on /blog/local-seo-tips', description: 'Traffic decreased by 15% compared to last month.', detail: 'The page /blog/local-seo-tips saw a 15% traffic decrease (from 1,760 to 1,500 sessions). This correlates with a position drop for "local seo tips" from 12 to 15. Consider refreshing the content with 2024 data and adding more local SEO case studies.', module: 'Rankings', time: '3d ago', timestamp: Date.now() - 259200000, status: 'resolved' },
]

const severityConfig = {
  critical: { bg: 'bg-red/15', text: 'text-red', icon: '●', label: 'Critical' },
  warning: { bg: 'bg-yellow/15', text: 'text-yellow', icon: '▲', label: 'Warning' },
  info: { bg: 'bg-accent/15', text: 'text-accent-light', icon: 'ℹ', label: 'Info' },
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState(initialAlerts)
  const [severityFilter, setSeverityFilter] = useState('all')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let data = [...alerts]
    if (severityFilter !== 'all') data = data.filter(a => a.severity === severityFilter)
    if (moduleFilter !== 'all') data = data.filter(a => a.module === moduleFilter)
    if (search) data = data.filter(a => a.title.toLowerCase().includes(search.toLowerCase()) || a.description.toLowerCase().includes(search.toLowerCase()))
    return data.sort((a, b) => b.timestamp - a.timestamp)
  }, [alerts, severityFilter, moduleFilter, search])

  const markAs = (id: string, status: AlertStatus) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status } : a))
  }

  const summaryCards = [
    { label: 'Total Alerts', value: alerts.filter(a => a.status !== 'resolved').length, color: 'text-fg' },
    { label: 'Critical', value: alerts.filter(a => a.severity === 'critical' && a.status !== 'resolved').length, color: 'text-red' },
    { label: 'Warnings', value: alerts.filter(a => a.severity === 'warning' && a.status !== 'resolved').length, color: 'text-yellow' },
    { label: 'Info', value: alerts.filter(a => a.severity === 'info' && a.status !== 'resolved').length, color: 'text-accent-light' },
  ]

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Header with source badges */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Alerts & Notifications</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">Aggregated alerts from all monitoring sources</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <span className="text-[11px] md:text-xs bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-1 rounded touch-target-reset">Ahrefs</span>
          <span className="text-[11px] md:text-xs bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-1 rounded touch-target-reset">PageSpeed</span>
          <span className="text-[11px] md:text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-1 rounded touch-target-reset">SE Ranking</span>
          <span className="text-[11px] md:text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-1 rounded touch-target-reset">DataForSEO</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {summaryCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            className="bg-bg-card border border-border rounded-xl p-3.5 md:p-5 hover:border-border-light transition-colors card-glow"
          >
            <p className="text-[11px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">{card.label}</p>
            <p className={`text-2xl md:text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="bg-bg-card border border-border rounded-xl p-3.5 md:p-4 card-glow"
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-dim">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search alerts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value)}
            className="px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent transition-colors"
          >
            <option value="all">All Severity</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
          <select
            value={moduleFilter}
            onChange={e => setModuleFilter(e.target.value)}
            className="px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent transition-colors"
          >
            <option value="all">All Modules</option>
            <option value="Rankings">Rankings</option>
            <option value="Backlinks">Backlinks</option>
            <option value="Vitals">Vitals</option>
            <option value="Pages">Pages</option>
          </select>
        </div>
      </motion.div>

      {/* Alert List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="bg-bg-card border border-border rounded-xl overflow-hidden card-glow"
      >
        <div className="divide-y divide-border">
          {filtered.map(alert => {
            const config = severityConfig[alert.severity]
            const isExpanded = expandedId === alert.id
            return (
              <div key={alert.id}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : alert.id)}
                  className={`w-full text-left flex items-start gap-2.5 sm:gap-4 px-3.5 sm:px-5 py-3.5 sm:py-4 hover:bg-white/[0.02] transition-colors ${
                    alert.status === 'unread' ? 'bg-white/[0.01]' : ''
                  }`}
                >
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
                      {alert.status === 'resolved' && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-green/15 text-green touch-target-reset">Resolved</span>}
                    </div>
                  </div>
                  <span className="text-[11px] md:text-xs text-fg-dim shrink-0 mt-1">{alert.time}</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={`text-fg-dim shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3.5 sm:px-5 pb-4 pl-12 sm:pl-16">
                        <p className="text-xs md:text-sm text-fg-muted leading-relaxed">{alert.detail}</p>
                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                          {alert.status !== 'read' && alert.status !== 'resolved' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); markAs(alert.id, 'read') }}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-fg-muted hover:text-fg hover:bg-white/[0.1] transition-colors touch-target-reset"
                            >
                              Mark as Read
                            </button>
                          )}
                          {alert.status !== 'resolved' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); markAs(alert.id, 'resolved') }}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green/15 text-green hover:bg-green/25 transition-colors touch-target-reset"
                            >
                              Mark as Resolved
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="px-3.5 sm:px-5 py-12 text-center">
              <p className="text-fg-muted text-xs md:text-sm">No alerts match your filters</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
