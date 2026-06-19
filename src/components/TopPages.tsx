import { motion } from 'framer-motion'

const pages = [
  { url: '/', sessions: 12500, max: 12500 },
  { url: '/blog/seo-best-practices', sessions: 6200, max: 12500 },
  { url: '/tools/keyword-research', sessions: 4800, max: 12500 },
  { url: '/blog/on-page-seo', sessions: 3900, max: 12500 },
  { url: '/pricing', sessions: 3100, max: 12500 },
]

export default function TopPages() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="bg-bg-card border border-border rounded-xl p-5 hover:border-border-light transition-colors"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold tracking-wider uppercase text-fg-muted">Top Pages by Traffic</h3>
          <InfoIcon />
        </div>
        <span className="text-xs font-semibold tracking-wider uppercase text-fg-muted">Sessions</span>
      </div>

      <div className="space-y-3.5">
        {pages.map((page) => (
          <div key={page.url} className="group cursor-pointer">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm text-fg truncate">{page.url}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-fg-dim shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <path d="M4 8L8 4M8 4H5M8 4v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="text-sm font-medium text-fg ml-3 shrink-0">
                {(page.sessions / 1000).toFixed(1)}K
              </span>
            </div>
            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(page.sessions / page.max) * 100}%` }}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="h-full bg-accent rounded-full"
              />
            </div>
          </div>
        ))}
      </div>

      <button className="mt-4 text-sm font-medium text-accent hover:text-accent-light transition-colors flex items-center gap-1">
        View all pages
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </motion.div>
  )
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-fg-dim">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1" />
      <path d="M7 6v3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <circle cx="7" cy="4.5" r="0.5" fill="currentColor" />
    </svg>
  )
}
