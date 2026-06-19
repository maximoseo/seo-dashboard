interface SourceBadgeProps {
  sources: string[]
  className?: string
}

const sourceColors: Record<string, string> = {
  Ahrefs: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  SEMrush: 'bg-orange-400/20 text-orange-200 border-orange-400/30',
  DataForSEO: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  PageSpeed: 'bg-green-500/20 text-green-300 border-green-500/30',
  GTmetrix: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'SE Ranking': 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  Serpstat: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  'KW Everywhere': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
}

export default function SourceBadge({ sources, className = '' }: SourceBadgeProps) {
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {sources.map(src => (
        <span
          key={src}
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${sourceColors[src] || 'bg-white/10 text-fg-muted border-white/10'}`}
        >
          {src}
        </span>
      ))}
    </div>
  )
}
