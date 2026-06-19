import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

const vitals = [
  {
    label: 'LCP',
    fullLabel: 'Largest Contentful Paint',
    value: '2.1',
    unit: 's',
    status: 'Good',
    threshold: 'Good (< 2.5s)',
    score: 84,
    color: '#22C55E',
  },
  {
    label: 'FID',
    fullLabel: 'First Input Delay',
    value: '48',
    unit: 'ms',
    status: 'Good',
    threshold: 'Good (< 100ms)',
    score: 92,
    color: '#22C55E',
  },
  {
    label: 'CLS',
    fullLabel: 'Cumulative Layout Shift',
    value: '0.04',
    unit: '',
    status: 'Good',
    threshold: 'Good (< 0.1)',
    score: 96,
    color: '#22C55E',
  },
]

export default function CoreWebVitals() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.45 }}
      className="bg-bg-card border border-border rounded-xl p-5 hover:border-border-light transition-colors"
    >
      <div className="flex items-center gap-1.5 mb-5">
        <h3 className="text-xs font-semibold tracking-wider uppercase text-fg-muted">Core Web Vitals</h3>
        <InfoIcon />
      </div>

      {/* Labels row */}
      <div className="grid grid-cols-3 gap-3 mb-2">
        {vitals.map((v) => (
          <div key={v.label} className="text-center">
            <p className="text-sm font-semibold text-fg">{v.label}</p>
            <p className="text-[10px] text-fg-dim mt-0.5">{v.fullLabel}</p>
          </div>
        ))}
      </div>

      {/* Gauges */}
      <div className="grid grid-cols-3 gap-3">
        {vitals.map((v) => (
          <VitalGauge key={v.label} {...v} />
        ))}
      </div>

      {/* Thresholds */}
      <div className="grid grid-cols-3 gap-3 mt-2">
        {vitals.map((v) => (
          <p key={v.label} className="text-[10px] text-fg-dim text-center">{v.threshold}</p>
        ))}
      </div>

      <button className="mt-4 text-sm font-medium text-accent hover:text-accent-light transition-colors flex items-center gap-1 mx-auto">
        View full report
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </motion.div>
  )
}

function VitalGauge({ value, unit, status, score, color }: {
  value: string
  unit: string
  status: string
  score: number
  color: string
}) {
  const [animatedScore, setAnimatedScore] = useState(0)
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const arcLength = circumference * 0.75 // 270 degrees

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedScore(score), 400)
    return () => clearTimeout(timer)
  }, [score])

  const progress = (animatedScore / 100) * arcLength

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[90px] h-[90px]">
        <svg width="90" height="90" viewBox="0 0 90 90" style={{ transform: 'rotate(135deg)' }}>
          {/* Background arc */}
          <circle
            cx="45"
            cy="45"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="6"
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Progress arc */}
          <circle
            cx="45"
            cy="45"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={`${progress} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-fg">
            {value}<span className="text-sm font-medium text-fg-muted">{unit}</span>
          </span>
        </div>
      </div>
      <p className="text-xs font-medium mt-1" style={{ color }}>{status}</p>
    </div>
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
