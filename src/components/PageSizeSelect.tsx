import { PAGE_SIZE_OPTIONS, type PageSize } from '@/lib/pageSize'

interface PageSizeSelectProps {
  value: PageSize | number
  onChange: (size: PageSize) => void
  className?: string
  label?: string
  /** Compact for mobile toolbars */
  compact?: boolean
}

export default function PageSizeSelect({
  value,
  onChange,
  className = '',
  label = 'Per page',
  compact = false,
}: PageSizeSelectProps) {
  return (
    <label className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={`text-fg-dim whitespace-nowrap ${compact ? 'text-[10px]' : 'text-[11px] md:text-xs'}`}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as PageSize)}
        className={`rounded-lg bg-bg-darkest border border-border text-fg-muted focus:outline-none focus:border-accent transition-colors touch-target-reset ${
          compact ? 'px-2 py-1.5 text-[11px]' : 'px-2.5 py-2 text-xs md:text-sm'
        }`}
        aria-label={label}
      >
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  )
}
