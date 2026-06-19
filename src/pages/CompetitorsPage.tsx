import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useSEO } from '@/contexts/SEOContext'
import { DataCard } from '@/components/DataCard'
import { fetchSemrushCompetitors, fetchExaSearch, fetchAggregatedCompetitors, type AggregatedCompetitors } from '@/services/seoApi'
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
  const [aggregated, setAggregated] = useState<AggregatedCompetitors | null>(null)
  const [exaSimilar, setExaSimilar] = useState<any[]>([])
  const [exaLoading, setExaLoading] = useState(false)
  const [gapDomain, setGapDomain] = useState('')

  useEffect(() => {
    setLoading(true)
    setError(null)

    // Fetch from multiple sources in parallel
    Promise.allSettled([
      fetchSemrushCompetitors(domain),
      fetchAggregatedCompetitors(domain),
    ]).then(([semrushResult, aggResult]) => {
      if (semrushResult.status === 'fulfilled') {
        setCompetitors(Array.isArray(semrushResult.value) ? semrushResult.value : [])
      }
      if (aggResult.status === 'fulfilled') {
        setAggregated(aggResult.value)
      }
    }).catch(e => setError(e.message))
      .finally(() => setLoading(false))

    // Exa similar sites
    setExaLoading(true)
    fetchExaSearch(`sites similar to ${domain} SEO tools`, 6)
      .then(data => setExaSimilar(data?.results || []))
      .catch(() => setExaSimilar([]))
      .finally(() => setExaLoading(false))
  }, [domain])

  const chartData = competitors.slice(0, 8).map(c => ({
    name: (c.Dn || '').replace('www.', '').slice(0, 15),
    keywords: parseInt(c.Or || '0', 10),
    traffic: parseInt(c.Ot || '0', 10),
    overlap: parseFloat(c.Cr || '0'),
  }))

  const activeSources = aggregated?.activeSources || ['SEMrush']

  return (
    <div className="space-y-4 lg:space-y-5 pt-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Competitor Analysis</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">Comparing {domain} against top organic competitors</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <span className="text-[11px] md:text-xs bg-orange-400/20 text-orange-200 border border-orange-400/30 px-2 py-1 rounded touch-target-reset">SEMrush</span>
          <span className="text-[11px] md:text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-1 rounded touch-target-reset">DataForSEO</span>
          <span className="text-[11px] md:text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded touch-target-reset">Exa</span>
          {activeSources.includes('seranking') && (
            <span className="text-[11px] md:text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-1 rounded touch-target-reset">SE Ranking</span>
          )}
        </div>
      </div>

      {/* Traffic Comparison Chart */}
      <DataCard
        title="Organic Traffic Comparison"
        sources={['SEMrush']}
        loading={loading}
        error={error}
      >
        <div className="h-52 md:h-64">
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
          <p className="text-xs md:text-sm text-fg-muted text-center py-8">No competitor data available</p>
        ) : (
          <>
            {/* Mobile card view */}
            <div className="md:hidden space-y-2.5">
              {competitors.map((c, i) => (
                <div key={i} className="p-3.5 bg-bg-darkest rounded-lg border border-border card-glow">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-fg">{c.Dn || '—'}</p>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded shrink-0 touch-target-reset ${
                      parseFloat(c.Cr || '0') > 0.3 ? 'bg-red-500/20 text-red-300' :
                      parseFloat(c.Cr || '0') > 0.1 ? 'bg-yellow-500/20 text-yellow-300' :
                      'bg-green-500/20 text-green-300'
                    }`}>
                      {(parseFloat(c.Cr || '0') * 100).toFixed(1)}% overlap
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-fg-dim">
                    <span>KWs: <span className="text-fg-muted font-medium">{parseInt(c.Or || '0').toLocaleString()}</span></span>
                    <span>Traffic: <span className="text-fg-muted font-medium">{parseInt(c.Ot || '0').toLocaleString()}</span></span>
                    <span>Common: <span className="text-fg-muted font-medium">{parseInt(c.Np || '0').toLocaleString()}</span></span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto table-scroll">
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
                        <span className={`text-xs px-1.5 py-0.5 rounded touch-target-reset ${
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
          </>
        )}
      </DataCard>

      {/* Exa Similar Sites */}
      <DataCard title="Similar Sites (Semantic Discovery)" sources={['Exa']} loading={exaLoading}>
        {exaSimilar.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {exaSimilar.map((site, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="p-3.5 md:p-3 bg-bg-darkest rounded-lg border border-border hover:border-border-light transition-colors card-glow"
              >
                <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-xs md:text-sm font-medium text-accent hover:text-accent-light transition-colors line-clamp-1">
                  {site.title || new URL(site.url).hostname}
                </a>
                <p className="text-[11px] md:text-xs text-fg-dim mt-0.5 truncate">{site.url}</p>
                {site.text && <p className="text-[11px] md:text-xs text-fg-muted mt-1 line-clamp-2">{site.text.slice(0, 150)}</p>}
                {site.score && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-[10px] text-fg-dim">Relevance:</span>
                    <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${Math.min(site.score * 100, 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-accent-light">{(site.score * 100).toFixed(0)}%</span>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        ) : !exaLoading ? (
          <p className="text-xs md:text-sm text-fg-muted text-center py-6">No similar sites found</p>
        ) : null}
      </DataCard>

      {/* Aggregated competitors from multiple sources */}
      {aggregated?.competitors && aggregated.competitors.length > 0 && (
        <DataCard title="Cross-Source Competitor Data" sources={activeSources}>
          {/* Mobile card view */}
          <div className="md:hidden space-y-2.5">
            {aggregated.competitors.map((c, i) => (
              <div key={i} className="p-3.5 bg-bg-darkest rounded-lg border border-border card-glow">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-medium text-fg">{c.domain}</p>
                  <span className="text-[10px] bg-accent/10 text-accent-light px-1.5 py-0.5 rounded touch-target-reset">{c.source}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-fg-dim">
                  <span>Common KWs: <span className="text-fg-muted font-medium">{c.commonKeywords?.toLocaleString() || '—'}</span></span>
                  <span>Traffic: <span className="text-fg-muted font-medium">{c.organicTraffic?.toLocaleString() || '—'}</span></span>
                  <span>DR: <span className="text-fg-muted font-medium">{c.dr || '—'}</span></span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-fg-dim font-medium">Domain</th>
                  <th className="text-right py-2 px-3 text-fg-dim font-medium">Common KWs</th>
                  <th className="text-right py-2 px-3 text-fg-dim font-medium">Traffic</th>
                  <th className="text-right py-2 px-3 text-fg-dim font-medium">DR</th>
                  <th className="text-right py-2 px-3 text-fg-dim font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {aggregated.competitors.map((c, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3 text-fg font-medium">{c.domain}</td>
                    <td className="py-2.5 px-3 text-right text-fg-muted">{c.commonKeywords?.toLocaleString() || '—'}</td>
                    <td className="py-2.5 px-3 text-right text-fg-muted">{c.organicTraffic?.toLocaleString() || '—'}</td>
                    <td className="py-2.5 px-3 text-right text-fg-muted">{c.dr || '—'}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="text-[10px] bg-accent/10 text-accent-light px-1.5 py-0.5 rounded touch-target-reset">{c.source}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataCard>
      )}

      {/* Keyword Gap */}
      <DataCard title="Keyword Gap Analysis" sources={['SEMrush', 'Ahrefs']}>
        <div className="text-center py-8 text-fg-muted">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mx-auto mb-3 opacity-30">
            <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2" />
            <path d="M13 20h14M20 13v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p className="text-xs md:text-sm">Enter a competitor domain to see keyword gaps</p>
          <input
            type="text"
            placeholder="competitor.com"
            value={gapDomain}
            onChange={e => setGapDomain(e.target.value)}
            className="mt-3 bg-bg-card border border-border rounded-lg px-3 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent w-full sm:w-64"
          />
        </div>
      </DataCard>
    </div>
  )
}
