import { useState } from 'react'
import { motion } from 'framer-motion'

interface TopBarProps {
  title?: string
  subtitle?: string
  onMenuClick?: () => void
}

export default function TopBar({ title = 'Dashboard', subtitle = "Overview of your site's SEO performance", onMenuClick }: TopBarProps) {
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [selectedRange, setSelectedRange] = useState('6M')

  const ranges = [
    { label: '7D', value: '7D' },
    { label: '30D', value: '30D' },
    { label: '3M', value: '3M' },
    { label: '6M', value: '6M' },
    { label: '1Y', value: '1Y' },
  ]

  const dateLabels: Record<string, string> = {
    '7D': 'Oct 24 – Oct 31, 2024',
    '30D': 'Oct 1 – Oct 31, 2024',
    '3M': 'Aug 1 – Oct 31, 2024',
    '6M': 'May 1 – Oct 31, 2024',
    '1Y': 'Nov 1, 2023 – Oct 31, 2024',
  }

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="sticky top-0 z-20 glass-header border-b border-border px-4 md:px-6 lg:px-8 py-3.5 lg:py-4 relative"
    >
      {/* Bottom gradient line */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile hamburger */}
          <button
            onClick={onMenuClick}
            className="lg:hidden flex items-center justify-center w-10 h-10 -ml-1 rounded-xl text-fg-muted hover:text-fg hover:bg-white/[0.06] transition-colors touch-target-reset"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          <div className="min-w-0">
            <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-fg truncate">{title}</h1>
            <p className="text-xs md:text-sm text-fg-muted mt-0.5 truncate hidden sm:block">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Date picker */}
          <div className="relative">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-lg border border-border hover:border-border-light bg-bg-card text-xs md:text-sm text-fg-muted transition-colors touch-target-reset"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-fg-dim shrink-0">
                <rect x="1" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M1 5.5h12" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4.5 1v2.5M9.5 1v2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <span className="hidden md:inline">{dateLabels[selectedRange]}</span>
              <span className="md:hidden">{selectedRange}</span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
                <path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {showDatePicker && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowDatePicker(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute right-0 top-full mt-1.5 bg-bg-card border border-border-light rounded-xl shadow-2xl z-40 py-1.5 min-w-[180px] md:min-w-[240px]"
                >
                  {ranges.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => {
                        setSelectedRange(r.value)
                        setShowDatePicker(false)
                      }}
                      className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors touch-target-reset ${
                        selectedRange === r.value
                          ? 'text-accent bg-accent/10'
                          : 'text-fg-muted hover:text-fg hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="font-medium">{r.label}</span>
                      <span className="text-fg-dim ml-2 text-xs">{dateLabels[r.value]}</span>
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </div>

          {/* Export button */}
          <button className="flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-lg border border-border hover:border-border-light bg-bg-card text-xs md:text-sm text-fg-muted hover:text-fg transition-colors touch-target-reset">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
              <path d="M7 2v7M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 10v1.5a1 1 0 001 1h8a1 1 0 001-1V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>
    </motion.header>
  )
}
