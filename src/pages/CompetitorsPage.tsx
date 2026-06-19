import { useState, useEffect } from 'react'
import { useSEO } from '@/contexts/SEOContext'
import { DataCard } from '@/components/DataCard'
import { fetchSemrushCompetitors } from '@/services/seoApi'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface Competitor {
  Dn?: string
  Or?: string
  Ot?: string
  Cr?: string
  Np?: string
}

export default function CompetitorsPage() {
  const { domain } = useSEO()
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchSemrushCompetitors(domain)
      .then(data => setCompetitors(Array.isArray(data) ? data : []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [domain])

  const chartData = competitors.slice(0, 8).map(c => ({
    name: (c.Dn || '').replace('www.', '').slice(0, 15),
    keywords: parseInt(c.Or || '0', 10),
    traffic: parseInt(c.Ot || '0', 10),
    overlap: parseFloat(c.Cr || '0'),
  }))

  return (
    <div className="space-y-6 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-fg">Competitor Analysis</h2>
          <p className="text-sm text-fg-muted mt-0.5">Comparing {domain} against top organic competitors</p>
        </div>
        <span className="text-xs bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-1 rounded">SEMrush</span>
      </div>

      {/* Traffic Comparison Chart */}
      <DataCard
        title="Organic Traffic Comparison"
        sources={['SEMrush']}
        loading={loading}
        error={error}
      >
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 8 }}
                labelStyle={{ color: '#E2E8F0' }}
              />
              <Legend />
              <Bar dataKey="keywords" name="Keywords" fill="#3B82F6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="traffic" name="Traffic" fill="#60A5FA" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </DataCard>

      {/* Competitors Table */}
      <DataCard
        title="Top Organic Competitors"
        sources={['SEMrush']}
        loading={loading}
        error={error}
      >
        {competitors.length === 0 && !loading && !error ? (
          <p className="text-sm text-fg-muted text-center py-8">No competitor data available</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-fg-dim font-medium">Domain</th>
                  <th className="text-right py-2 px-3 text-fg-dim font-medium">Keywords</th>
                  <th className="text-right py-2 px-3 text-fg-dim font-medium">Traffic</th>
                  <th className="text-right py-2 px-3 text-fg-dim font-medium">Overlap</th>
                  <th className="text-right py-2 px-3 text-fg-dim font-medium">Common KWs</th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((c, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3 text-fg font-medium">{c.Dn || '—'}</td>
                    <td className="py-2.5 px-3 text-right text-fg-muted">{parseInt(c.Or || '0').toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-fg-muted">{parseInt(c.Ot || '0').toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        parseFloat(c.Cr || '0') > 0.3 ? 'bg-red-500/20 text-red-300' :
                        parseFloat(c.Cr || '0') > 0.1 ? 'bg-yellow-500/20 text-yellow-300' :
                        'bg-green-500/20 text-green-300'
                      }`}>
                        {(parseFloat(c.Cr || '0') * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-fg-muted">{parseInt(c.Np || '0').toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataCard>

      {/* Keyword Gap placeholder */}
      <DataCard title="Keyword Gap Analysis" sources={['SEMrush', 'Ahrefs']}>
        <div className="text-center py-8 text-fg-muted">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mx-auto mb-3 opacity-30">
            <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2" />
            <path d="M13 20h14M20 13v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p className="text-sm">Enter a competitor domain to see keyword gaps</p>
          <input
            type="text"
            placeholder="competitor.com"
            className="mt-3 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent w-64"
          />
        </div>
      </DataCard>
    </div>
  )
}
