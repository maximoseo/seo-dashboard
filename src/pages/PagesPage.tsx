import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import DataStateBadge from '@/components/DataStateBadge'

interface PageData {
  url: string
  title: string
  status: number
  traffic: number
  keywords: number
  backlinks: number
  score: number
  contentType: string
  lastCrawled: string
  wordCount: number
  loadTime: number
}

// No production demo crawl inventory — empty until real crawl/sitemap module is wired.
const livePages: PageData[] = []

const ITEMS_PER_PAGE = 10

function getStatusColor(status: number) {
  if (status >= 200 && status < 300) return { bg: 'bg-green/15', text: 'text-green' }
  if (status >= 300 && status < 400) return { bg: 'bg-yellow/15', text: 'text-yellow' }
  return { bg: 'bg-red/15', text: 'text-red' }
}

function getScoreColor(score: number) {
  if (score >= 90) return '#22C55E'
  if (score >= 75) return '#4ADE80'
  if (score >= 50) return '#F59E0B'
  return '#EF4444'
}

export default function PagesPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let data = [...livePages]
    if (search) data = data.filter(p => p.url.toLowerCase().includes(search.toLowerCase()) || p.title.toLowerCase().includes(search.toLowerCase()))
    if (statusFilter !== 'all') {
      if (statusFilter === '2xx') data = data.filter(p => p.status >= 200 && p.status < 300)
      else if (statusFilter === '3xx') data = data.filter(p => p.status >= 300 && p.status < 400)
      else if (statusFilter === '4xx') data = data.filter(p => p.status >= 400)
    }
    if (typeFilter !== 'all') data = data.filter(p => p.contentType === typeFilter)
    return data
  }, [search, statusFilter, typeFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  const summaryCards = [
    { label: 'Total Pages', value: livePages.length.toString(), color: 'text-fg' },
    { label: 'Healthy (2xx)', value: livePages.filter(p => p.status >= 200 && p.status < 300).length.toString(), color: 'text-green' },
    { label: 'Redirects (3xx)', value: livePages.filter(p => p.status >= 300 && p.status < 400).length.toString(), color: 'text-yellow' },
    { label: 'Errors (4xx/5xx)', value: livePages.filter(p => p.status >= 400).length.toString(), color: 'text-red' },
  ]

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Header with source badges */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Pages Analysis</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">Crawled pages with on-page audit data</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <DataStateBadge state={livePages.length ? 'live' : 'planned'} source={livePages.length ? 'crawl' : 'no crawl inventory yet'} />
          <span className="text-[11px] md:text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-1 rounded touch-target-reset">DataForSEO</span>
          <span className="text-[11px] md:text-xs bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2 py-1 rounded touch-target-reset">Browserless</span>
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
              placeholder="Search by URL or title..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            className="px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent transition-colors"
          >
            <option value="all">All Status</option>
            <option value="2xx">2xx Success</option>
            <option value="3xx">3xx Redirect</option>
            <option value="4xx">4xx/5xx Error</option>
          </select>
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
            className="px-3 py-2.5 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent transition-colors"
          >
            <option value="all">All Types</option>
            <option value="page">Pages</option>
            <option value="blog">Blog Posts</option>
          </select>
        </div>
      </motion.div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-2.5">
        {!paginated.length && (
          <div className="rounded-xl border border-border bg-bg-card p-5 text-center text-sm text-fg-muted">
            No crawl inventory yet — page list stays empty until sitemap/crawl module is connected.
          </div>
        )}
        {paginated.map((p) => {
          const sc = getStatusColor(p.status)
          const isExpanded = expandedUrl === p.url
          return (
            <motion.div
              key={p.url}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-bg-card border border-border rounded-xl overflow-hidden card-glow"
            >
              <button
                onClick={() => setExpandedUrl(isExpanded ? null : p.url)}
                className="w-full text-left p-3.5 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg truncate">{p.url}</p>
                    <p className="text-[11px] text-fg-dim truncate mt-0.5">{p.title}</p>
                  </div>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 touch-target-reset ${sc.bg} ${sc.text}`}>{p.status}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-fg-dim mt-2">
                  <span>Traffic: <span className="text-fg-muted font-medium">{p.traffic > 0 ? `${(p.traffic / 1000).toFixed(1)}K` : '—'}</span></span>
                  <span>KWs: <span className="text-fg-muted font-medium">{p.keywords || '—'}</span></span>
                  <span>BLs: <span className="text-fg-muted font-medium">{p.backlinks}</span></span>
                </div>
                {p.score > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${p.score}%`, backgroundColor: getScoreColor(p.score) }} />
                    </div>
                    <span className="text-[11px] font-medium w-6 text-right" style={{ color: getScoreColor(p.score) }}>{p.score}</span>
                  </div>
                )}
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
                    <div className="px-3.5 pb-3.5 pt-0 grid grid-cols-2 gap-3 border-t border-border mt-0 pt-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-fg-dim">Last Crawled</p>
                        <p className="text-xs text-fg mt-0.5">{p.lastCrawled}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-fg-dim">Word Count</p>
                        <p className="text-xs text-fg mt-0.5">{p.wordCount > 0 ? p.wordCount.toLocaleString() : '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-fg-dim">Load Time</p>
                        <p className="text-xs text-fg mt-0.5">{p.loadTime > 0 ? `${p.loadTime}s` : '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-fg-dim">Content Type</p>
                        <p className="text-xs text-fg mt-0.5 capitalize">{p.contentType}</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>

      {/* Desktop Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="hidden md:block bg-bg-card border border-border rounded-xl overflow-hidden card-glow"
      >
        <div className="overflow-x-auto table-scroll">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="text-xs font-semibold tracking-wider uppercase text-fg-dim border-b border-border">
                <th className="text-left py-3 px-5">URL</th>
                <th className="text-center py-3 px-3">Status</th>
                <th className="text-right py-3 px-3">Traffic</th>
                <th className="text-right py-3 px-3">Keywords</th>
                <th className="text-right py-3 px-3">Backlinks</th>
                <th className="text-right py-3 px-3">Score</th>
              </tr>
            </thead>
            <tbody>
              {!paginated.length && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-fg-muted">
                    No crawl inventory yet — page list stays empty until sitemap/crawl module is connected.
                  </td>
                </tr>
              )}
              {paginated.map((p) => {
                const sc = getStatusColor(p.status)
                const isExpanded = expandedUrl === p.url
                return (
                  <>
                    <tr
                      key={p.url}
                      onClick={() => setExpandedUrl(isExpanded ? null : p.url)}
                      className="border-t border-border hover:bg-white/[0.02] transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-5">
                        <p className="text-fg font-medium truncate max-w-[280px]">{p.url}</p>
                        <p className="text-xs text-fg-dim truncate max-w-[280px] mt-0.5">{p.title}</p>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold touch-target-reset ${sc.bg} ${sc.text}`}>{p.status}</span>
                      </td>
                      <td className="py-3 px-3 text-right text-fg-muted">{p.traffic > 0 ? `${(p.traffic / 1000).toFixed(1)}K` : '—'}</td>
                      <td className="py-3 px-3 text-right text-fg-muted">{p.keywords || '—'}</td>
                      <td className="py-3 px-3 text-right text-fg-muted">{p.backlinks}</td>
                      <td className="py-3 px-3">
                        {p.score > 0 ? (
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${p.score}%`, backgroundColor: getScoreColor(p.score) }} />
                            </div>
                            <span className="text-xs font-medium w-6 text-right" style={{ color: getScoreColor(p.score) }}>{p.score}</span>
                          </div>
                        ) : (
                          <span className="text-fg-dim text-xs text-right block">—</span>
                        )}
                      </td>
                    </tr>
                    <AnimatePresence>
                      {isExpanded && (
                        <tr key={`${p.url}-detail`}>
                          <td colSpan={6} className="p-0">
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-5 py-4 bg-bg-darkest/50 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider text-fg-dim">Last Crawled</p>
                                  <p className="text-sm text-fg mt-0.5">{p.lastCrawled}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider text-fg-dim">Word Count</p>
                                  <p className="text-sm text-fg mt-0.5">{p.wordCount > 0 ? p.wordCount.toLocaleString() : '—'}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider text-fg-dim">Load Time</p>
                                  <p className="text-sm text-fg mt-0.5">{p.loadTime > 0 ? `${p.loadTime}s` : '—'}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider text-fg-dim">Content Type</p>
                                  <p className="text-sm text-fg mt-0.5 capitalize">{p.contentType}</p>
                                </div>
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <p className="text-xs text-fg-dim">
            Showing {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors touch-target-reset"
            >
              ← Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors touch-target-reset ${
                  page === p ? 'bg-accent text-white' : 'text-fg-muted hover:text-fg hover:bg-white/[0.04]'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors touch-target-reset"
            >
              Next →
            </button>
          </div>
        </div>
      </motion.div>

      {/* Mobile Pagination */}
      <div className="md:hidden flex items-center justify-between px-1">
        <p className="text-[11px] text-fg-dim">
          {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-2 rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors touch-target-reset"
          >
            ← Prev
          </button>
          <span className="text-xs text-fg-muted px-2">{page}/{totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-2 rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors touch-target-reset"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}
