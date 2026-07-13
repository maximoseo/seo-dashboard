interface SyncButtonProps {
  onClick: () => void
  loading?: boolean
  label?: string
  loadingLabel?: string
  className?: string
  disabled?: boolean
}

/** Shared Force refresh / Sync control for data tabs */
export default function SyncButton({
  onClick,
  loading = false,
  label = 'Sync now',
  loadingLabel = 'Syncing…',
  className = '',
  disabled = false,
}: SyncButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className={`rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted hover:border-border-light hover:text-fg transition-colors touch-target-reset disabled:opacity-50 ${className}`}
    >
      {loading ? loadingLabel : label}
    </button>
  )
}
