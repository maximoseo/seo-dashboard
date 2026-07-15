import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { useAhrefs } from '@/contexts/AhrefsContext'
import { useSEO } from '@/contexts/SEOContext'

function labelForScore(score: number | null): { text: string; className: string } {
  if (score == null) return { text: 'No score', className: 'text-fg-muted' }
  if (score >= 80) return { text: 'Strong', className: 'text-green' }
  if (score >= 60) return { text: 'Fair', className: 'text-yellow-400' }
  if (score >= 40) return { text: 'Weak', className: 'text-orange-300' }
  return { text: 'Critical', className: 'text-red-400' }
}

export default function SEOHealthScore() {
  const { domain, overview, overviewLoading } = useSEO()
  const { domainRating, siteMetrics, pagespeedMobile, loading } = useAhrefs()
  const [animatedScore, setAnimatedScore] = useState(0)

  const score = useMemo(() => {
    const parts: number[] = []
    const dr = domainRating?.domain_rating ?? overview?.sources?.ahrefs?.domain_rating?.domain_rating
    if (typeof dr === 'number' && Number.isFinite(dr)) parts.push(Math.max(0, Math.min(100, dr)))

    const perf = pagespeedMobile?.lighthouse?.performance_score
    const seo = pagespeedMobile?.lighthouse?.seo_score
    if (typeof perf === 'number' && perf > 0) parts.push(perf)
    if (typeof seo === 'number' && seo > 0) parts.push(seo)

    const kw = siteMetrics?.org_keywords
    const tr = siteMetrics?.org_traffic
    if (typeof kw === 'number' && kw > 0) parts.push(Math.min(95, 40 + Math.log10(kw + 1) * 18))
    if (typeof tr === 'number' && tr > 0) parts.push(Math.min(95, 35 + Math.log10(tr + 1) * 16))

    if (!parts.length) return null
    return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length)
  }, [domainRating, overview, pagespeedMobile, siteMetrics])

  useEffect(() => {
    setAnimatedScore(0)
    if (score == null) return
    const timer = setTimeout(() => setAnimatedScore(score), 200)
    return () => clearTimeout(timer)
  }, [score, domain])

  const circumference = 2 * Math.PI * 54
  const progress = score == null ? 0 : (animatedScore / 100) * circumference
  const dashOffset = circumference - progress
  const badge = labelForScore(score)
  const isLoading = loading || overviewLoading

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="bg-bg-card border border-border rounded-xl p-4 md:p-5 hover:border-border-light transition-all card-glow relative overflow-hidden"
    >
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between gap-2 mb-3 md:mb-4">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[11px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">SEO Health Score</h3>
        </div>
        {isLoading && <div className="w-3 h-3 border border-accent/40 border-t-accent rounded-full animate-spin" />}
      </div>

      <div className="flex items-center gap-4 md:gap-5">
        <div className="relative w-[100px] h-[100px] md:w-[120px] md:h-[120px] shrink-0">
          <svg width="100%" height="100%" viewBox="0 0 120 120" className="-rotate-90 score-glow">
            <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="url(#scoreGradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 1.2s ease-out' }}
            />
            <defs>
              <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3B82F6" />
                <stop offset="100%" stopColor="#60A5FA" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl md:text-3xl font-bold text-fg">{score == null ? '—' : animatedScore}</span>
            <span className="text-xs md:text-sm text-fg-muted">/100</span>
          </div>
        </div>

        <div className="min-w-0">
          <p className={`text-sm md:text-base font-semibold ${badge.className}`}>{badge.text}</p>
          <p className="mt-1.5 text-[11px] md:text-xs text-fg-dim leading-relaxed">
            {domain
              ? score == null
                ? 'Waiting for live DR / PSI / metrics for this domain.'
                : 'Composite of live Domain Rating, PageSpeed and organic signals — not a canned demo score.'
              : 'Select a project domain to compute a live health score.'}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
