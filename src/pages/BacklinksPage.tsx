import { useState, useEffect } from 'react'
import { DataCard } from '@/components/DataCard'
import { fetchDataForSeoBacklinks, fetchDataForSeoDomainSummary } from '@/services/seoApi'
import { useSEO } from '@/contexts/SEOContext'
import { useAhrefs } from '@/contexts/AhrefsContext'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface Backlink {
  url_from?: string
  domain_from?: string
  url_to?: string
  rank?: number
  dofollow?: boolean
  anchor?: string
  first_seen?: string
}

export default function BacklinksPage() {
  const { domain } = useSEO()
  const { domainRating, backlinksStats, loading: ahrefsLoading } = useAhrefs()
  const [backlinks, setBacklinks] = useState<Backlink[]>([])
  const [domainSummary, setDomainSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'dofollow' | 'nofollow'>('all')

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.allSettled([
      fetchDataForSeoBacklinks(domain, 50).then(d => {
        const items = d?.tasks?.[0]?.result?.[0]?.items || []
        setBacklinks(items)
      }),
      fetchDataForSeoDomainSummary(domain).then(d => {
        setDomainSummary(d?.tasks?.[0]?.result?.[0])
      }),
    ])
      .finally(() => setLoading(false))
  }, [domain])

  const filtered = backlinks.filter(bl => {
    if (filter === 'dofollow') return bl.dofollow
    if (filter === 'nofollow') return !bl.dofollow
    return true
  })

  // Anchor text distribution
  const anchorMap: Record<string, number> = {}
  backlinks.forEach(bl => {
    const anchor = bl.anchor || 'No anchor'
    anchorMap[anchor] = (anchorMap[anchor] || 0) + 1
  })
  const anchorData = Object.entries(anchorMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name: name.slice(0, 20), count }))

  return (
    <div className="space-y-5 pt-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-bg-card border border-border rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-fg-dim">Total Backlinks</span>
            <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded">DataForSEO</span>
          </div>
          <p className="text-2xl font-bold text-fg">{(domainSummary?.backlinks || backlinks.length).toLocaleString()}</p>
        </div>
        <div className="bg-bg-card border border-border rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-fg-dim">Ref. Domains</span>
            <span className="text-[10px] bg-orange-500/20 text-orange-300 border border-orange-500/30 px-1.5 py-0.5 rounded">Ahrefs</span>
          </div>
          <p className="text-2xl font-bold text-fg">
            {ahrefsLoading ? '...' : (backlinksStats?.live_refdomains ?? domainSummary?.referring_domains ?? '—').toLocaleString?.() ?? '—'}
          </p>
        </div>
        <div className="bg-bg-card border border-border rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-fg-dim">Dofollow</span>
            <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded">DataForSEO</span>
          </div>
          <p className="text-2xl font-bold text-fg">{backlinks.filter(b => b.dofollow).length}</p>
        </div>
        <div className="bg-bg-card border border-border rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-fg-dim">Domain Rating</span>
            <span className="text-[10px] bg-orange-500/20 text-orange-300 border border-orange-500/30 px-1.5 py-0.5 rounded">Ahrefs</span>
          </div>
          <p className="text-2xl font-bold text-fg">
            {ahrefsLoading ? '...' : domainRating?.domain_rating ?? '—'}
          </p>
        </div>
      </div>

      {/* Anchor Text Chart */}
      <DataCard title="Anchor Text Distribution" sources={['DataForSEO']} loading={loading} error={error}>
        {anchorData.length > 0 ? (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={anchorData} layout="vertical" margin={{ left: 10, right: 10 }}>
                <XAxis type="number" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94A3B8', fontSize: 11 }} width={120} />
                <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 8 }} />
                <Bar dataKey="count" fill="#3B82F6" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-fg-muted text-center py-6">No anchor data available — DataForSEO backlinks loading</p>
        )}
      </DataCard>

      {/* Backlinks Table */}
      <DataCard
        title="Backlink Profile"
        sources={['DataForSEO', 'Ahrefs']}
        loading={loading}
        error={error}
        headerRight={
          <div className="flex gap-1">
            {(['all', 'dofollow', 'nofollow'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-2 py-1 rounded transition-colors capitalize ${
                  filter === f ? 'bg-accent text-white' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        }
      >
        {filtered.length === 0 && !loading ? (
          <p className="text-sm text-fg-muted text-center py-8">No backlinks found — API may require authentication</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-fg-dim font-medium">Source</th>
                  <th className="text-left py-2 px-3 text-fg-dim font-medium">Anchor</th>
                  <th className="text-right py-2 px-3 text-fg-dim font-medium">Rank</th>
                  <th className="text-right py-2 px-3 text-fg-dim font-medium">Type</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 30).map((bl, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3">
                      <p className="text-fg font-medium truncate max-w-[200px]">{bl.domain_from || '—'}</p>
                      <p className="text-xs text-fg-dim truncate max-w-[200px]">{bl.url_from?.slice(0, 50) || ''}</p>
                    </td>
                    <td className="py-2.5 px-3 text-fg-muted truncate max-w-[150px]">{bl.anchor || '—'}</td>
                    <td className="py-2.5 px-3 text-right text-fg-muted">{bl.rank || '—'}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${bl.dofollow ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'}`}>
                        {bl.dofollow ? 'dofollow' : 'nofollow'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataCard>
    </div>
  )
}
