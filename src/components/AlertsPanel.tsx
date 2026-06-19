import { motion } from 'framer-motion'

const alerts = [
  {
    severity: 'warning' as const,
    title: 'High CLS detected on /blog/on-page-seo',
    description: 'CLS value is 0.18 which is above the recommended threshold.',
    time: '2h ago',
  },
  {
    severity: 'warning' as const,
    title: 'Drop in rankings for "technical seo"',
    description: 'Position dropped from 7 to 9.',
    time: '5h ago',
  },
  {
    severity: 'critical' as const,
    title: 'Backlink lost from examplepartner.com',
    description: 'This backlink was lost on Oct 30, 2024.',
    time: '1d ago',
  },
]

export default function AlertsPanel() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.5 }}
      className="bg-bg-card border border-border rounded-xl p-5 hover:border-border-light transition-colors"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold tracking-wider uppercase text-fg-muted">Alerts</h3>
          <InfoIcon />
        </div>
        <span className="bg-accent text-white text-[11px] font-semibold w-5 h-5 rounded-full flex items-center justify-center">
          3
        </span>
      </div>

      <div className="space-y-3">
        {alerts.map((alert, i) => (
          <button
            key={i}
            className="w-full text-left flex items-start gap-3 p-3 rounded-lg hover:bg-white/[0.03] transition-colors group -mx-1"
          >
            {/* Severity Icon */}
            <div className="shrink-0 mt-0.5">
              {alert.severity === 'warning' ? (
                <div className="w-6 h-6 rounded-full bg-yellow/15 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 2L1.5 12h11L7 2z" fill="#F59E0B" />
                    <path d="M7 6v2.5" stroke="#0A0F1E" strokeWidth="1.2" strokeLinecap="round" />
                    <circle cx="7" cy="10" r="0.5" fill="#0A0F1E" />
                  </svg>
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-red/15 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="5.5" fill="#EF4444" />
                    <path d="M7 4.5v3" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
                    <circle cx="7" cy="9.5" r="0.5" fill="white" />
                  </svg>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-fg truncate">{alert.title}</p>
                <span className="text-[11px] text-fg-dim shrink-0">{alert.time}</span>
              </div>
              <p className="text-xs text-fg-muted mt-0.5 line-clamp-2">{alert.description}</p>
            </div>

            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-fg-dim shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>

      <button className="mt-3 text-sm font-medium text-accent hover:text-accent-light transition-colors flex items-center gap-1">
        View all alerts
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
