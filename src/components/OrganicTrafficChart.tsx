import { motion } from 'framer-motion'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const data6M = [
  { month: "May '24", value: 28000 },
  { month: "Jun '24", value: 30000 },
  { month: "Jul '24", value: 32000 },
  { month: "Aug '24", value: 35000 },
  { month: "Sep '24", value: 40000 },
  { month: "Oct '24", value: 45200 },
]

const data1Y = [
  { month: "Nov '23", value: 18000 },
  { month: "Dec '23", value: 19000 },
  { month: "Jan '24", value: 20000 },
  { month: "Feb '24", value: 22000 },
  { month: "Mar '24", value: 24000 },
  { month: "Apr '24", value: 26000 },
  { month: "May '24", value: 28000 },
  { month: "Jun '24", value: 30000 },
  { month: "Jul '24", value: 32000 },
  { month: "Aug '24", value: 35000 },
  { month: "Sep '24", value: 40000 },
  { month: "Oct '24", value: 45200 },
]

const dataAll = [
  { month: "Jan '23", value: 5000 },
  { month: "Apr '23", value: 8000 },
  { month: "Jul '23", value: 12000 },
  { month: "Oct '23", value: 16000 },
  { month: "Jan '24", value: 20000 },
  { month: "Apr '24", value: 26000 },
  { month: "Jul '24", value: 32000 },
  { month: "Oct '24", value: 45200 },
]

const datasets: Record<string, typeof data6M> = {
  '6M': data6M,
  '1Y': data1Y,
  'All': dataAll,
}

interface Props {
  dateRange: string
  onDateRangeChange: (range: string) => void
}

export default function OrganicTrafficChart({ dateRange, onDateRangeChange }: Props) {
  const chartData = datasets[dateRange] || data6M
  const periods = ['6M', '1Y', 'All']

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="bg-bg-card border border-border rounded-xl p-5 hover:border-border-light transition-colors"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold tracking-wider uppercase text-fg-muted">Organic Traffic</h3>
          <InfoIcon />
        </div>

        <div className="flex items-center bg-bg-darkest rounded-lg p-0.5 border border-border">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => onDateRangeChange(p)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                dateRange === p
                  ? 'bg-accent text-white'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="trafficGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6B7280', fontSize: 11 }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6B7280', fontSize: 11 }}
              tickFormatter={(v) => `${v / 1000}K`}
              dx={-4}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0D1624',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '12px',
              }}
              formatter={(value) => [`${(Number(value) / 1000).toFixed(1)}K`, 'Traffic']}
              labelStyle={{ color: '#9CA3AF' }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#3B82F6"
              strokeWidth={2}
              fill="url(#trafficGradient)"
              dot={false}
              activeDot={{
                r: 5,
                fill: '#3B82F6',
                stroke: '#0D1624',
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
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
