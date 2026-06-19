interface LoadingSkeletonProps {
  lines?: number
  className?: string
}

export function LoadingSkeleton({ lines = 3, className = '' }: LoadingSkeletonProps) {
  return (
    <div className={`animate-pulse space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-white/[0.06] rounded"
          style={{ width: `${60 + (i % 3) * 15}%` }}
        />
      ))}
    </div>
  )
}

interface ErrorStateProps {
  source: string
  error: string
  onRetry?: () => void
}

export function ErrorState({ source, error, onRetry }: ErrorStateProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
        <path d="M7 4v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span className="flex-1">{source}: {error.slice(0, 80)}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-xs underline hover:no-underline">Retry</button>
      )}
    </div>
  )
}

interface DataCardProps {
  title: string
  children: React.ReactNode
  sources?: string[]
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  className?: string
  headerRight?: React.ReactNode
}

export function DataCard({ title, children, sources, loading, error, onRetry, className = '', headerRight }: DataCardProps) {
  return (
    <div className={`bg-bg-card border border-border rounded-xl p-4 ${className}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          {sources && sources.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {sources.map(src => (
                <span key={src} className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-white/[0.05] text-fg-dim border-white/10">
                  {src}
                </span>
              ))}
            </div>
          )}
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <ErrorState source={title} error={error} onRetry={onRetry} />
      ) : (
        children
      )}
    </div>
  )
}
