import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { useKeywords } from '@/api/client'
import { useSEO } from '@/contexts/SEOContext'
import { useProject } from '@/contexts/ProjectContext'
import { buildProjectPath } from '@/lib/projectRoutes'
import { canonicalizeDomain } from '@/lib/domain'

function fmtVol(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return Math.round(n).toLocaleString()
}

export default function KeywordRankings() {
  const { domain } = useSEO()
  const { activeProject } = useProject()
  const clean = canonicalizeDomain(domain)
  const market = activeProject?.market || null
  const { data, isLoading, error } = useKeywords(clean || null, market)

  const keywords = useMemo(() => {
    const rows = (data as any)?.normalized || []
    return (Array.isArray(rows) ? rows : [])
      .filter((k: any) => k?.keyword)
      .map((k: any) => {
        const current = k.position != null ? Number(k.position) : null
        const prev = k.previousPosition != null ? Number(k.previousPosition) : null
        let direction: 'up' | 'down' | 'flat' = 'flat'
        let change = 0
        if (current != null && prev != null && Number.isFinite(current) && Number.isFinite(prev)) {
          change = Math.abs(prev - current)
          if (current < prev) direction = 'up' // lower rank = better
          else if (current > prev) direction = 'down'
        }
        return {
          keyword: String(k.keyword),
          volume: k.volume != null ? Number(k.volume) : null,
          current,
          previous: prev,
          change,
          direction,
          source: k.source || null,
        }
      })
      .sort((a: any, b: any) => {
        const ap = a.current ?? 999
        const bp = b.current ?? 999
        return ap - bp
      })
      .slice(0, 5)
  }, [data])

  const keywordsHref = clean ? buildProjectPath(clean, 'keywords') : '/projects'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="bg-bg-card border border-border rounded-xl p-5 hover:border-border-light transition-colors overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-xs font-semibold tracking-wider uppercase text-fg-muted">Keyword Rankings</h3>
          <p className="text-[11px] text-fg-dim mt-0.5">{clean || 'No domain'}</p>
        </div>
      </div>

      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm min-w-[380px]">
          <thead>
            <tr className="text-xs font-semibold tracking-wider uppercase text-fg-dim">
              <th className="text-left pb-3 pr-3">Keyword</th>
              <th className="text-right pb-3 px-2">Volume</th>
              <th className="text-right pb-3 px-2">Pos</th>
              <th className="text-right pb-3 pl-2">Δ</th>
            </tr>
          </thead>
          <tbody>
            {keywords.map((kw) => (
              <tr key={kw.keyword} className="border-t border-border hover:bg-white/[0.02] transition-colors">
                <td className="py-2.5 pr-3 text-fg font-medium max-w-[180px] truncate" title={kw.keyword}>
                  {kw.keyword}
                </td>
                <td className="py-2.5 px-2 text-right text-fg-muted tabular-nums">{fmtVol(kw.volume)}</td>
                <td className="py-2.5 px-2 text-right text-fg font-medium tabular-nums">
                  {kw.current != null ? kw.current : '—'}
                </td>
                <td className="py-2.5 pl-2 text-right">
                  {kw.direction === 'flat' || kw.change === 0 ? (
                    <span className="text-xs text-fg-dim">—</span>
                  ) : (
                    <span className={`text-xs font-medium ${kw.direction === 'up' ? 'text-green' : 'text-red-400'}`}>
                      {kw.direction === 'up' ? '↑' : '↓'}
                      {kw.change}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!isLoading && keywords.length === 0 && (
        <p className="text-xs md:text-sm text-fg-muted mt-3">
          {error ? 'Could not load keywords for this domain.' : 'No live keyword rankings for this domain yet.'}
        </p>
      )}
      {isLoading && <p className="text-xs text-fg-dim mt-3">Loading keywords…</p>}

      <Link to={keywordsHref} className="mt-4 text-sm font-medium text-accent hover:text-accent-light transition-colors inline-flex items-center gap-1">
        View all keywords
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </motion.div>
  )
}
