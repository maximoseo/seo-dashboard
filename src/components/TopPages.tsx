import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { usePages } from '@/api/client'
import { useSEO } from '@/contexts/SEOContext'
import { useProject } from '@/contexts/ProjectContext'
import { buildProjectPath } from '@/lib/projectRoutes'
import { canonicalizeDomain, hostBelongsToDomain } from '@/lib/domain'

function fmtTraffic(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return Math.round(n).toLocaleString()
}

function pathOf(url: string, domain: string) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
    return u.pathname || '/'
  } catch {
    if (url.startsWith('/')) return url
    const stripped = url.replace(/^https?:\/\//i, '').replace(new RegExp(`^${domain}`, 'i'), '')
    return stripped.startsWith('/') ? stripped : `/${stripped}`
  }
}

export default function TopPages() {
  const { domain } = useSEO()
  const { activeProject } = useProject()
  const clean = canonicalizeDomain(domain)
  const market = activeProject?.market || null
  const { data, isLoading, error } = usePages(clean || null, market)

  const pages = useMemo(() => {
    const rows = (data as any)?.normalized || (data as any)?.pages || []
    return (Array.isArray(rows) ? rows : [])
      .filter((p: any) => p?.url && hostBelongsToDomain(p.url, clean))
      .map((p: any) => ({
        url: String(p.url),
        path: pathOf(String(p.url), clean),
        traffic: Number(p.traffic ?? p.sessions ?? p.organic_traffic ?? p.etv ?? 0) || 0,
        title: p.title || null,
      }))
      .sort((a: any, b: any) => b.traffic - a.traffic)
      .slice(0, 5)
  }, [data, clean])

  const max = pages[0]?.traffic || 1
  const pagesHref = clean ? buildProjectPath(clean, 'pages') : '/projects'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="bg-bg-card border border-border rounded-xl p-4 md:p-5 hover:border-border-light transition-all card-glow"
    >
      <div className="flex items-center justify-between mb-3 md:mb-4 gap-2">
        <div className="min-w-0">
          <h3 className="text-[11px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">Top Pages by Traffic</h3>
          <p className="text-[11px] text-fg-dim truncate">{clean || 'No domain'}</p>
        </div>
        <span className="text-[11px] font-semibold tracking-wider uppercase text-fg-muted shrink-0">Traffic</span>
      </div>

      <div className="space-y-3.5">
        {pages.map((page) => (
          <div key={page.url} className="group">
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <a
                href={page.url.startsWith('http') ? page.url : `https://${page.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 min-w-0 text-left hover:text-accent"
              >
                <span className="text-sm text-fg truncate" title={page.title || page.url}>
                  {page.path}
                </span>
              </a>
              <span className="text-sm font-medium text-fg ml-2 shrink-0 tabular-nums">{fmtTraffic(page.traffic)}</span>
            </div>
            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(4, (page.traffic / max) * 100)}%` }}
                transition={{ duration: 0.6 }}
                className="h-full bg-accent rounded-full"
              />
            </div>
          </div>
        ))}

        {!isLoading && pages.length === 0 && (
          <p className="text-xs md:text-sm text-fg-muted py-2">
            {error ? 'Could not load pages for this domain.' : 'No live top pages yet for this domain.'}
          </p>
        )}
        {isLoading && <p className="text-xs text-fg-dim">Loading pages…</p>}
      </div>

      <Link to={pagesHref} className="mt-4 text-sm font-medium text-accent hover:text-accent-light transition-colors inline-flex items-center gap-1">
        View all pages
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </motion.div>
  )
}
