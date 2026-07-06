export type DataState = 'live' | 'cached' | 'loading' | 'demo' | 'unavailable' | 'unauthorized' | 'planned'

interface DataStateBadgeProps {
  state: DataState
  source?: string
  fetchedAt?: string | null
  className?: string
}

const stateStyles: Record<DataState, string> = {
  live: 'bg-green-500/15 text-green-300 border-green-500/30',
  cached: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  loading: 'bg-blue-500/15 text-blue-200 border-blue-500/30',
  demo: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  unavailable: 'bg-red-500/15 text-red-300 border-red-500/30',
  unauthorized: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  planned: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
}

const stateLabels: Record<DataState, string> = {
  live: 'Live',
  cached: 'Cached',
  loading: 'Loading',
  demo: 'Demo fallback',
  unavailable: 'Unavailable',
  unauthorized: 'Needs auth',
  planned: 'Planned',
}

export default function DataStateBadge({ state, source, fetchedAt, className = '' }: DataStateBadgeProps) {
  const timestamp = fetchedAt ? new Date(fetchedAt).toLocaleString() : null
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stateStyles[state]} ${className}`}
      title={[source, timestamp].filter(Boolean).join(' • ')}
    >
      {stateLabels[state]}
      {source ? <span className="font-medium opacity-80">{source}</span> : null}
    </span>
  )
}
