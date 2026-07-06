import { useState, useEffect, useCallback } from 'react'
import { DataCard } from '@/components/DataCard'
import { fetchApiHealth, clearApiCache, type ApiHealthStatus } from '@/services/seoApi'
import { useSEO } from '@/contexts/SEOContext'

const apiSources = [
  { key: 'ahrefs', name: 'Ahrefs', description: 'DR, backlinks, organic keywords, traffic', color: 'orange' },
  { key: 'semrush', name: 'SEMrush', description: 'Domain analytics, keyword data, competitors', color: 'orange' },
  { key: 'dataforseo', name: 'DataForSEO', description: 'SERP tracking, on-page audit, backlinks', color: 'purple' },
  { key: 'pagespeed', name: 'PageSpeed Insights', description: 'Core Web Vitals, performance scores', color: 'green' },
  { key: 'gtmetrix', name: 'GTmetrix', description: 'Performance scores, waterfall analysis', color: 'blue' },
  { key: 'seranking', name: 'SE Ranking', description: 'Keyword tracking, competitor analysis, backlinks', color: 'cyan' },
  { key: 'exa', name: 'Exa Search', description: 'Semantic web search, competitive content, similar sites', color: 'indigo' },
  { key: 'browserless', name: 'Browserless', description: 'Live page scraping, Lighthouse audits, screenshots', color: 'teal' },
  { key: 'thorbit', name: 'Thorbit', description: 'Content optimization, SEO analysis, suggestions', color: 'pink' },
]

const colorMap: Record<string, string> = {
  orange: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  green: 'bg-green-500/20 text-green-300 border-green-500/30',
  blue: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  cyan: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  pink: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  yellow: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  indigo: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  teal: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
}

export default function SettingsPage() {
  const { domain, setDomain } = useSEO()
  const [health, setHealth] = useState<ApiHealthStatus | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [cacheCleared, setCacheCleared] = useState(false)
  const [domainInput, setDomainInput] = useState(domain)

  const checkHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      const data = await fetchApiHealth()
      setHealth(data)
    } catch {
      // silently fail
    } finally {
      setHealthLoading(false)
    }
  }, [])

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  const handleClearCache = async () => {
    await clearApiCache()
    setCacheCleared(true)
    setTimeout(() => setCacheCleared(false), 3000)
  }

  const handleDomainSave = () => {
    setDomain(domainInput.replace(/^https?:\/\//, '').replace(/\/$/, ''))
  }

  const connectedCount = health ? Object.values(health.statuses).filter(s => s.ok).length : 0
  const totalCount = apiSources.length

  return (
    <div className="space-y-4 lg:space-y-5 pt-4">
      {/* Domain Config */}
      <DataCard title="Domain Configuration">
        <div className="space-y-3">
          <div>
            <label className="text-[11px] md:text-xs text-fg-dim mb-1.5 block">Target Domain</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={domainInput}
                onChange={e => setDomainInput(e.target.value)}
                placeholder="example.com"
                className="flex-1 bg-bg-darkest border border-border rounded-lg px-3 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleDomainSave}
                className="bg-accent hover:bg-accent/80 text-white text-sm px-4 py-2.5 rounded-lg transition-colors touch-target-reset"
              >
                Save
              </button>
            </div>
            <p className="text-[11px] md:text-xs text-fg-dim mt-1">Current: <span className="text-accent">{domain}</span></p>
          </div>
        </div>
      </DataCard>

      {/* Tools Status Panel */}
      <DataCard
        title="Tools Status"
        loading={healthLoading}
        headerRight={
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-[11px] md:text-xs text-fg-dim">
              {health ? `${connectedCount}/${totalCount} connected` : 'Checking...'}
            </span>
            <button
              onClick={checkHealth}
              className="text-[11px] md:text-xs text-accent hover:text-accent-light transition-colors touch-target-reset"
            >
              Refresh
            </button>
          </div>
        }
      >
        {/* Summary bar */}
        {health && (
          <div className="mb-4 p-3.5 md:p-3 bg-bg-darkest rounded-lg border border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] md:text-xs text-fg-dim">Connection Health</span>
              <span className={`text-[11px] md:text-xs font-medium ${connectedCount >= 7 ? 'text-green-400' : connectedCount >= 4 ? 'text-yellow-400' : 'text-red-400'}`}>
                {connectedCount >= 7 ? 'Excellent' : connectedCount >= 4 ? 'Good' : 'Limited'}
              </span>
            </div>
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${connectedCount >= 7 ? 'bg-green-400' : connectedCount >= 4 ? 'bg-yellow-400' : 'bg-red-400'}`}
                style={{ width: `${(connectedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {apiSources.map(source => {
            const status = health?.statuses?.[source.key]
            const isChecked = health !== null
            return (
              <div key={source.key} className="flex items-start gap-3 p-3.5 md:p-3 bg-bg-darkest rounded-lg border border-border card-glow">
                <div className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${
                  !isChecked ? 'bg-fg-dim animate-pulse' :
                  status?.ok ? 'bg-green-400' :
                  (status as any)?.configured === false ? 'bg-gray-500' : 'bg-red-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs md:text-sm font-medium text-fg">{source.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border touch-target-reset ${colorMap[source.color]}`}>
                      {!isChecked ? '...' : status?.ok ? `${status.latency}ms` : (status as any)?.configured === false ? 'Not Set' : 'Error'}
                    </span>
                  </div>
                  <p className="text-[11px] md:text-xs text-fg-dim mt-0.5 truncate">{source.description}</p>
                  {status?.error && (status as any)?.configured !== false && (
                    <p className="text-[11px] md:text-xs text-red-400 mt-0.5 truncate">{status.error.slice(0, 60)}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </DataCard>

      {/* Cache Management */}
      <DataCard title="Cache Management">
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div className="bg-bg-darkest rounded-lg border border-border p-3.5 md:p-3 card-glow">
              <p className="text-[11px] md:text-xs text-fg-dim">Realtime Cache</p>
              <p className="text-base md:text-lg font-semibold text-fg mt-1">5 min TTL</p>
              <p className="text-[11px] md:text-xs text-fg-dim">Keywords, backlinks, overview, vitals</p>
            </div>
            <div className="bg-bg-darkest rounded-lg border border-border p-3.5 md:p-3 card-glow">
              <p className="text-[11px] md:text-xs text-fg-dim">Historical Cache</p>
              <p className="text-base md:text-lg font-semibold text-fg mt-1">24 hr TTL</p>
              <p className="text-[11px] md:text-xs text-fg-dim">Competitors, content, Exa search</p>
            </div>
          </div>
          <button
            onClick={handleClearCache}
            className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors touch-target-reset ${
              cacheCleared
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20'
            }`}
          >
            {cacheCleared ? 'Cache Cleared!' : 'Clear All Caches'}
          </button>
        </div>
      </DataCard>

      {/* Data Sources per Page */}
      <DataCard title="Data Sources by Page">
        <div className="space-y-2">
          {[
            { page: 'Overview', sources: ['Ahrefs', 'SEMrush', 'DataForSEO', 'SE Ranking', 'Exa'] },
            { page: 'Keywords', sources: ['Ahrefs', 'SEMrush', 'DataForSEO', 'SE Ranking'] },
            { page: 'Backlinks', sources: ['Ahrefs', 'DataForSEO', 'SE Ranking'] },
            { page: 'Pages', sources: ['DataForSEO', 'Browserless'] },
            { page: 'Vitals', sources: ['PageSpeed', 'GTmetrix', 'Browserless'] },
            { page: 'Alerts', sources: ['Ahrefs', 'PageSpeed', 'SE Ranking', 'DataForSEO'] },
            { page: 'Content', sources: ['Exa', 'Thorbit', 'DataForSEO'] },
            { page: 'Competitors', sources: ['SEMrush', 'DataForSEO', 'SE Ranking', 'Exa'] },
          ].map(item => (
            <div key={item.page} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 p-3 md:p-2.5 bg-bg-darkest rounded-lg border border-border card-glow">
              <span className="text-xs md:text-sm font-medium text-fg">{item.page}</span>
              <div className="flex gap-1 flex-wrap">
                {item.sources.map(s => {
                  const src = apiSources.find(a => a.name.startsWith(s))
                  return (
                    <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded border touch-target-reset ${colorMap[src?.color || 'blue']}`}>
                      {s}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </DataCard>

      {/* API Keys Info */}
      <DataCard title="API Keys">
        <div className="space-y-2">
          <p className="text-xs md:text-sm text-fg-muted">API keys are configured as environment variables on the server. Never expose them in the frontend.</p>
          <div className="bg-bg-darkest rounded-lg border border-border p-3.5 md:p-3 font-mono text-[11px] md:text-xs text-fg-dim space-y-1 overflow-x-auto">
            <p>AHREFS_API_KEY=••••••••••••••••</p>
            <p>SEMRUSH_API=••••••••••••••••</p>
            <p>DATAFORSEO_LOGIN=••••••••••••••••</p>
            <p>PAGESPEED_API_KEY=••••••••••••••••</p>
            <p>GTMETRIX_API=••••••••••••••••</p>
            <p>SE_RANKING_API=••••••••••••••••</p>
            <p>EXA_API_KEY=••••••••••••••••</p>
            <p>BROWSERLESS_API_KEY=••••••••••••••••</p>
            <p>THORBIT_API_KEY=••••••••••••••••</p>
          </div>
          <p className="text-[11px] md:text-xs text-fg-dim">Set these in your <code className="text-accent">.env</code> file or Render environment variables.</p>
        </div>
      </DataCard>
    </div>
  )
}
