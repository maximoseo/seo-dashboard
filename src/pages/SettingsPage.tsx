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
  { key: 'seranking', name: 'SE Ranking', description: 'Keyword tracking, site audit', color: 'cyan' },
  { key: 'serpstat', name: 'Serpstat', description: 'Domain analysis, keyword research', color: 'pink' },
  { key: 'keywords_everywhere', name: 'Keywords Everywhere', description: 'Search volume, CPC, competition', color: 'yellow' },
]

const colorMap: Record<string, string> = {
  orange: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  green: 'bg-green-500/20 text-green-300 border-green-500/30',
  blue: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  cyan: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  pink: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  yellow: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
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

  return (
    <div className="space-y-6 pt-4">
      {/* Domain Config */}
      <DataCard title="Domain Configuration">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-fg-dim mb-1.5 block">Target Domain</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={domainInput}
                onChange={e => setDomainInput(e.target.value)}
                placeholder="example.com"
                className="flex-1 bg-bg-darkest border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleDomainSave}
                className="bg-accent hover:bg-accent/80 text-white text-sm px-4 py-2 rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
            <p className="text-xs text-fg-dim mt-1">Current: <span className="text-accent">{domain}</span></p>
          </div>
        </div>
      </DataCard>

      {/* API Status */}
      <DataCard
        title="API Connection Status"
        loading={healthLoading}
        headerRight={
          <button
            onClick={checkHealth}
            className="text-xs text-accent hover:text-accent-light transition-colors"
          >
            Refresh
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {apiSources.map(source => {
            const status = health?.statuses?.[source.key]
            const isChecked = health !== null
            return (
              <div key={source.key} className="flex items-start gap-3 p-3 bg-bg-darkest rounded-lg border border-border">
                <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                  !isChecked ? 'bg-fg-dim' :
                  status?.ok ? 'bg-green-400' : 'bg-red-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-fg">{source.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${colorMap[source.color]}`}>
                      {!isChecked ? 'Checking...' : status?.ok ? `${status.latency}ms` : 'Error'}
                    </span>
                  </div>
                  <p className="text-xs text-fg-dim mt-0.5 truncate">{source.description}</p>
                  {status?.error && (
                    <p className="text-xs text-red-400 mt-0.5 truncate">{status.error.slice(0, 60)}</p>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-bg-darkest rounded-lg border border-border p-3">
              <p className="text-xs text-fg-dim">Realtime Cache</p>
              <p className="text-lg font-semibold text-fg mt-1">5 min TTL</p>
              <p className="text-xs text-fg-dim">Keywords, backlinks, overview</p>
            </div>
            <div className="bg-bg-darkest rounded-lg border border-border p-3">
              <p className="text-xs text-fg-dim">Historical Cache</p>
              <p className="text-lg font-semibold text-fg mt-1">24 hr TTL</p>
              <p className="text-xs text-fg-dim">Competitors, content gaps</p>
            </div>
          </div>
          <button
            onClick={handleClearCache}
            className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
              cacheCleared
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20'
            }`}
          >
            {cacheCleared ? 'Cache Cleared!' : 'Clear All Caches'}
          </button>
        </div>
      </DataCard>

      {/* API Keys Info */}
      <DataCard title="API Keys">
        <div className="space-y-2">
          <p className="text-sm text-fg-muted">API keys are configured as environment variables on the server. Never expose them in the frontend.</p>
          <div className="bg-bg-darkest rounded-lg border border-border p-3 font-mono text-xs text-fg-dim space-y-1">
            <p>AHREFS_API_KEY=••••••••••••••••</p>
            <p>SEMRUSH_API=••••••••••••••••</p>
            <p>DATAFORSEO_LOGIN=service@maximo-seo.com</p>
            <p>PAGESPEED_API_KEY=••••••••••••••••</p>
            <p>GTMETRIX_API=••••••••••••••••</p>
            <p>SE_RANKING_API=••••••••••••••••</p>
            <p>SERPSTAT_API=••••••••••••••••</p>
            <p>KEYWORDS_EVERYWHERE_API=••••••••••••••••</p>
          </div>
          <p className="text-xs text-fg-dim">Set these in your <code className="text-accent">.env</code> file or Render environment variables.</p>
        </div>
      </DataCard>
    </div>
  )
}
