import { motion } from 'framer-motion'

const keywords = [
  {
    keyword: 'seo tools',
    volume: '12.1K',
    current: 3,
    oneMonthAgo: 4,
    threeMonthsAgo: 7,
    change: 2,
    direction: 'up' as const,
    trend: [12, 10, 9, 8, 7, 6, 5, 4, 3, 3],
  },
  {
    keyword: 'keyword research',
    volume: '8.1K',
    current: 5,
    oneMonthAgo: 6,
    threeMonthsAgo: 9,
    change: 1,
    direction: 'up' as const,
    trend: [14, 12, 11, 10, 9, 8, 7, 6, 5, 5],
  },
  {
    keyword: 'on page seo',
    volume: '6.6K',
    current: 7,
    oneMonthAgo: 6,
    threeMonthsAgo: 5,
    change: 1,
    direction: 'down' as const,
    trend: [4, 5, 5, 5, 6, 6, 6, 6, 7, 7],
  },
  {
    keyword: 'technical seo',
    volume: '4.4K',
    current: 9,
    oneMonthAgo: 11,
    threeMonthsAgo: 14,
    change: 2,
    direction: 'up' as const,
    trend: [18, 16, 15, 14, 13, 12, 11, 11, 9, 9],
  },
  {
    keyword: 'backlink strategy',
    volume: '3.6K',
    current: 12,
    oneMonthAgo: 11,
    threeMonthsAgo: 10,
    change: 1,
    direction: 'down' as const,
    trend: [8, 9, 9, 10, 10, 10, 11, 11, 12, 12],
  },
]

export default function KeywordRankings() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="bg-bg-card border border-border rounded-xl p-5 hover:border-border-light transition-colors overflow-hidden"
    >
      <div className="flex items-center gap-1.5 mb-4">
        <h3 className="text-xs font-semibold tracking-wider uppercase text-fg-muted">Keyword Rankings</h3>
        <InfoIcon />
      </div>

      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="text-xs font-semibold tracking-wider uppercase text-fg-dim">
              <th className="text-left pb-3 pr-3">Keyword</th>
              <th className="text-right pb-3 px-2">Volume</th>
              <th className="text-right pb-3 px-2">Current</th>
              <th className="text-right pb-3 px-2">1M Ago</th>
              <th className="text-right pb-3 px-2">3M Ago</th>
              <th className="text-right pb-3 pl-2">Trend</th>
            </tr>
          </thead>
          <tbody>
            {keywords.map((kw) => (
              <tr key={kw.keyword} className="border-t border-border hover:bg-white/[0.02] transition-colors">
                <td className="py-2.5 pr-3 text-fg font-medium">{kw.keyword}</td>
                <td className="py-2.5 px-2 text-right text-fg-muted">{kw.volume}</td>
                <td className="py-2.5 px-2 text-right">
                  <span className="text-fg font-medium">{kw.current}</span>
                  {' '}
                  <span className={`text-xs font-medium ${kw.direction === 'up' ? 'text-green' : 'text-red'}`}>
                    {kw.direction === 'up' ? '\u2191' : '\u2193'}{kw.change}
                  </span>
                </td>
                <td className="py-2.5 px-2 text-right text-fg-muted">{kw.oneMonthAgo}</td>
                <td className="py-2.5 px-2 text-right text-fg-muted">{kw.threeMonthsAgo}</td>
                <td className="py-2.5 pl-2">
                  <MiniTrend data={kw.trend} direction={kw.direction} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="mt-4 text-sm font-medium text-accent hover:text-accent-light transition-colors flex items-center gap-1">
        View all keywords
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </motion.div>
  )
}

function MiniTrend({ data, direction }: { data: number[]; direction: 'up' | 'down' }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const h = 20
  const w = 60

  // For rankings, lower is better, so invert
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w
      const y = ((v - min) / range) * (h - 4) + 2
      return `${x},${y}`
    })
    .join(' ')

  const color = direction === 'up' ? '#22C55E' : '#EF4444'

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
