interface PageErrorProps {
  title?: string
  message: string
  details?: string
  onRetry?: () => void
}

export function PageError({ title = 'Something went wrong', message, details, onRetry }: PageErrorProps) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-5 md:p-6">
      <div className="flex items-start gap-3">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0 mt-0.5 text-red-400">
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 6v5M10 13v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-red-200">{title}</p>
          <p className="text-xs text-red-100/70 mt-1">{message}</p>
          {details && <p className="text-[11px] text-red-100/50 mt-1 font-mono truncate">{details}</p>}
          {onRetry && (
            <button onClick={onRetry} className="mt-3 px-3 py-1.5 rounded-lg border border-red-300/30 text-xs text-red-100 hover:bg-red-500/10 transition-colors touch-target-reset">
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function PageSkeleton({ lines = 5, cards = 0 }: { lines?: number; cards?: number }) {
  return (
    <div className="space-y-4">
      {cards > 0 && (
        <div className={`grid grid-cols-2 lg:grid-cols-${Math.min(cards, 4)} gap-3`}>
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="bg-bg-card border border-border rounded-xl p-4 animate-pulse">
              <div className="h-3 w-20 bg-white/[0.06] rounded mb-2" />
              <div className="h-8 w-16 bg-white/[0.06] rounded" />
            </div>
          ))}
        </div>
      )}
      <div className="bg-bg-card border border-border rounded-xl p-5 animate-pulse space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-4 bg-white/[0.06] rounded" style={{ width: `${55 + (i % 4) * 12}%` }} />
        ))}
      </div>
    </div>
  )
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && <div className="mb-3 text-fg-dim">{icon}</div>}
      <p className="text-sm font-medium text-fg-muted">{title}</p>
      <p className="text-xs text-fg-dim mt-1 max-w-sm">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
