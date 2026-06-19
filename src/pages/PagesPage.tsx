import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

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

const mockPages: PageData[] = [
  { url: '/', title: 'SEO Pro - Best SEO Tools & Software', status: 200, traffic: 12500, keywords: 245, backlinks: 890, score: 94, contentType: 'page', lastCrawled: '2024-10-30', wordCount: 2400, loadTime: 1.2 },
  { url: '/blog/seo-best-practices', title: 'SEO Best Practices for 2024 - Complete Guide', status: 200, traffic: 6200, keywords: 189, backlinks: 340, score: 91, contentType: 'blog', lastCrawled: '2024-10-30', wordCount: 4500, loadTime: 1.8 },
  { url: '/tools/keyword-research', title: 'Free Keyword Research Tool', status: 200, traffic: 4800, keywords: 156, backlinks: 210, score: 88, contentType: 'page', lastCrawled: '2024-10-30', wordCount: 1800, loadTime: 2.1 },
  { url: '/blog/on-page-seo', title: 'On-Page SEO: The Definitive Guide', status: 200, traffic: 3900, keywords: 134, backlinks: 180, score: 85, contentType: 'blog', lastCrawled: '2024-10-29', wordCount: 5200, loadTime: 1.5 },
  { url: '/pricing', title: 'Pricing Plans - SEO Pro', status: 200, traffic: 3100, keywords: 45, backlinks: 120, score: 82, contentType: 'page', lastCrawled: '2024-10-30', wordCount: 900, loadTime: 0.9 },
  { url: '/blog/technical-seo', title: 'Technical SEO Checklist', status: 200, traffic: 2800, keywords: 98, backlinks: 95, score: 79, contentType: 'blog', lastCrawled: '2024-10-29', wordCount: 3800, loadTime: 1.6 },
  { url: '/tools/seo-audit', title: 'Free SEO Audit Tool', status: 200, traffic: 2400, keywords: 87, backlinks: 150, score: 90, contentType: 'page', lastCrawled: '2024-10-30', wordCount: 1500, loadTime: 2.3 },
  { url: '/blog/link-building', title: 'Link Building Strategies That Work', status: 200, traffic: 1900, keywords: 76, backlinks: 230, score: 86, contentType: 'blog', lastCrawled: '2024-10-28', wordCount: 4100, loadTime: 1.4 },
  { url: '/old-pricing', title: 'Old Pricing Page', status: 301, traffic: 0, keywords: 0, backlinks: 45, score: 0, contentType: 'page', lastCrawled: '2024-10-30', wordCount: 0, loadTime: 0.3 },
  { url: '/blog/seo-guide-2023', title: 'SEO Guide 2023', status: 301, traffic: 0, keywords: 0, backlinks: 67, score: 0, contentType: 'blog', lastCrawled: '2024-10-29', wordCount: 0, loadTime: 0.2 },
  { url: '/tools/broken-checker', title: 'Broken Link Checker', status: 200, traffic: 1200, keywords: 42, backlinks: 55, score: 72, contentType: 'page', lastCrawled: '2024-10-30', wordCount: 1100, loadTime: 1.9 },
  { url: '/api/v1/docs', title: 'API Documentation', status: 200, traffic: 800, keywords: 23, backlinks: 30, score: 68, contentType: 'page', lastCrawled: '2024-10-28', wordCount: 6200, loadTime: 1.1 },
  { url: '/blog/local-seo-tips', title: 'Local SEO Tips for Small Business', status: 200, traffic: 1500, keywords: 65, backlinks: 42, score: 75, contentType: 'blog', lastCrawled: '2024-10-29', wordCount: 3200, loadTime: 1.7 },
  { url: '/old-feature', title: 'Deprecated Feature Page', status: 404, traffic: 0, keywords: 0, backlinks: 12, score: 0, contentType: 'page', lastCrawled: '2024-10-30', wordCount: 0, loadTime: 0.1 },
  { url: '/tools/rank-tracker', title: 'Rank Tracker Tool', status: 200, traffic: 2100, keywords: 78, backlinks: 88, score: 83, contentType: 'page', lastCrawled: '2024-10-30', wordCount: 1600, loadTime: 2.0 },
]

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
    let data = [...mockPages]
    if (search) data = data.filter(p => p.url.toLowerCase().includes(search.toLowerCase()) || p.title.toLowerCase().includes(search.toLowerCase()))
    if (statusFilter !== 'all') {
      if (statusFilter === '2xx') data = data.filter(p => p.status >= 200 && p.status < 300)
      else if (statusFilter === '3xx') data = data.filter(p => p.status >= 300 && p.status < 400)
      else if (statusFilter === '4xx') data = data.filter(p => p.status >= 400)
    }
    if (typeFilter !== 'all') data = data.filter(p => p.contentType === typeFilter)
    return data
  }, [search, statusFilter, typeFilter])

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  const summaryCards = [
    { label: 'Total Pages', value: mockPages.length.toString(), color: 'text-fg' },
    { label: 'Healthy (2xx)', value: mockPages.filter(p => p.status >= 200 && p.status < 300).length.toString(), color: 'text-green' },
    { label: 'Redirects (3xx)', value: mockPages.filter(p => p.status >= 300 && p.status < 400).length.toString(), color: 'text-yellow' },
    { label: 'Errors (4xx/5xx)', value: mockPages.filter(p => p.status >= 400).length.toString(), color: 'text-red' },
  ]

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            className="bg-bg-card border border-border rounded-xl p-5 hover:border-border-light transition-colors"
          >
            <p className="text-xs font-semibold tracking-wider uppercase text-fg-muted">{card.label}</p>
            <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="bg-bg-card border border-border rounded-xl p-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-dim">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search by URL or title..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-darkest border border-border text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent transition-colors"
          >
            <option value="all">All Status</option>
            <option value="2xx">2xx Success</option>
            <option value="3xx">3xx Redirect</option>
            <option value="4xx">4xx/5xx Error</option>
          </select>
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 rounded-lg bg-bg-darkest border border-border text-sm text-fg-muted focus:outline-none focus:border-accent transition-colors"
          >
            <option value="all">All Types</option>
            <option value="page">Pages</option>
            <option value="blog">Blog Posts</option>
          </select>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="bg-bg-card border border-border rounded-xl overflow-hidden"
      >
        <div className="overflow-x-auto">
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
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${sc.bg} ${sc.text}`}>{p.status}</span>
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
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                  page === p ? 'bg-accent text-white' : 'text-fg-muted hover:text-fg hover:bg-white/[0.04]'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
