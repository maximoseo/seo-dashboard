import DataStateBadge, { type DataState } from '@/components/DataStateBadge'

interface LoadingSkeletonProps {
  lines?: number
  className?: string
}

export function LoadingSkeleton({ lines = 3, className = '' }: LoadingSkeletonProps) {
  return (
    <div className={`animate-pulse space-y-2.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-white/[0.06] rounded-md"
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
    <div className="flex items-center gap-2.5 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3.5 py-3">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 5v3.5M8 11v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span className="flex-1 text-[13px]">{source}: {error.slice(0, 80)}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-xs font-medium underline hover:no-underline touch-target-reset">Retry</button>
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
  dataState?: DataState
  fetchedAt?: string | null
}

export function DataCard({ title, children, sources, loading, error, onRetry, className = '', headerRight, dataState, fetchedAt }: DataCardProps) {
  return (
    <div className={`bg-bg-card border border-border rounded-xl p-4 md:p-5 transition-all hover:border-border-light card-glow ${className}`}>
      <div className="flex items-start justify-between gap-2 mb-3 md:mb-4">
        <div>
          <h3 className="text-sm md:text-[15px] font-semibold text-fg">{title}</h3>
          {sources && sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {sources.map(src => (
                <span key={src} className="text-[10px] font-medium px-2 py-0.5 rounded-md border bg-white/[0.04] text-fg-dim border-white/10">
                  {src}
                </span>
              ))}
            </div>
          )}
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
        {dataState && !headerRight && <DataStateBadge state={dataState} fetchedAt={fetchedAt} />}
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
