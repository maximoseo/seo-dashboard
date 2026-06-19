import { useState } from 'react'
import { motion } from 'framer-motion'

interface TopBarProps {
  title?: string
  subtitle?: string
}

export default function TopBar({ title = 'Dashboard', subtitle = "Overview of your site's SEO performance" }: TopBarProps) {
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
      className="sticky top-0 z-20 bg-bg-darkest/80 backdrop-blur-xl border-b border-border px-4 lg:px-6 py-4 flex items-center justify-between gap-4"
    >
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-fg">{title}</h1>
        <p className="text-sm text-fg-muted mt-0.5">{subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-border-light bg-bg-card text-sm text-fg-muted transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-fg-dim">
              <rect x="1" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M1 5.5h12" stroke="currentColor" strokeWidth="1.2" />
              <path d="M4.5 1v2.5M9.5 1v2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:inline">{dateLabels[selectedRange]}</span>
            <span className="sm:hidden">{selectedRange}</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
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
                className="absolute right-0 top-full mt-1 bg-bg-card border border-border rounded-lg shadow-xl z-40 py-1 min-w-[120px]"
              >
                {ranges.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => {
                      setSelectedRange(r.value)
                      setShowDatePicker(false)
                    }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      selectedRange === r.value
                        ? 'text-accent bg-accent/10'
                        : 'text-fg-muted hover:text-fg hover:bg-white/[0.04]'
                    }`}
                  >
                    {r.label} — {dateLabels[r.value]}
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </div>

        <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-border-light bg-bg-card text-sm text-fg-muted hover:text-fg transition-colors">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v7M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 10v1.5a1 1 0 001 1h8a1 1 0 001-1V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span className="hidden sm:inline">Export</span>
        </button>
      </div>
    </motion.header>
  )
}
