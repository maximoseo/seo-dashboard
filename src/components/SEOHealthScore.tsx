import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

export default function SEOHealthScore() {
  const [animatedScore, setAnimatedScore] = useState(0)
  const score = 87
  const circumference = 2 * Math.PI * 54

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedScore(score), 300)
    return () => clearTimeout(timer)
  }, [])

  const progress = (animatedScore / 100) * circumference
  const dashOffset = circumference - progress

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="bg-bg-card border border-border rounded-xl p-4 md:p-5 hover:border-border-light transition-all card-glow"
    >
      <div className="flex items-center gap-1.5 mb-3 md:mb-4">
        <h3 className="text-[11px] md:text-xs font-semibold tracking-wider uppercase text-fg-muted">SEO Health Score</h3>
        <InfoIcon />
      </div>

      <div className="flex items-center gap-4 md:gap-5">
        {/* Circular Gauge */}
        <div className="relative w-[100px] h-[100px] md:w-[120px] md:h-[120px] shrink-0">
          <svg width="100%" height="100%" viewBox="0 0 120 120" className="-rotate-90">
            {/* Background track */}
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="8"
            />
            {/* Progress arc */}
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
            <span className="text-2xl md:text-3xl font-bold text-fg">{animatedScore}</span>
            <span className="text-xs md:text-sm text-fg-muted">/100</span>
          </div>
        </div>

        <div>
          <p className="text-sm md:text-base font-semibold text-green">Excellent</p>
          {/* Mini trend line */}
          <svg width="80" height="24" viewBox="0 0 80 24" className="mt-2">
            <polyline
              points="0,20 10,18 20,16 30,17 40,14 50,12 60,10 70,8 80,6"
              fill="none"
              stroke="#94A3B8"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      <p className="mt-3 text-xs text-fg-muted">
        <span className="text-green font-medium">+7 points</span>
        {' '}vs Apr 1 – Apr 30, 2024
      </p>
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
