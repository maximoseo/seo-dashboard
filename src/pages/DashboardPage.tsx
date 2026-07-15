import { useState } from 'react'
import SEOHealthScore from '@/components/SEOHealthScore'
import MetricCards from '@/components/MetricCards'
import OrganicTrafficChart from '@/components/OrganicTrafficChart'
import TopPages from '@/components/TopPages'
import KeywordRankings from '@/components/KeywordRankings'
import CoreWebVitals from '@/components/CoreWebVitals'
import AlertsPanel from '@/components/AlertsPanel'
import DomainIntegrityBar from '@/components/DomainIntegrityBar'
import { useSEO } from '@/contexts/SEOContext'
import { useProject } from '@/contexts/ProjectContext'
import { canonicalizeDomain } from '@/lib/domain'
import { useDomainSwitchCleanup } from '@/lib/useDomainQuery'

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState('6M')
  const { domain, overview, overviewLoading, overviewError } = useSEO()
  const { activeProject } = useProject()
  const clean = canonicalizeDomain(domain)
  useDomainSwitchCleanup(domain)

  const dr = overview?.sources?.ahrefs?.domain_rating?.domain_rating
  const ahrefsRank = overview?.sources?.ahrefs?.domain_rating?.ahrefs_rank
  const semrush = overview?.sources?.semrush
  const semrushKeywords = semrush?.['Organic Keywords'] || semrush?.Or
  const semrushTraffic = semrush?.['Organic Traffic'] || semrush?.Ot
  const bl = overview?.sources?.dataforseo?.backlinks
  const hasStrip = dr !== undefined || !!semrushKeywords || !!semrushTraffic || bl != null

  return (
    <div className="space-y-4 lg:space-y-5 max-w-[1400px]">
      <DomainIntegrityBar
        activeDomain={clean}
        payloadDomain={canonicalizeDomain((overview as any)?.domain) || clean}
        dataState={overviewError ? 'unavailable' : overviewLoading ? 'loading' : overview ? 'live' : 'unavailable'}
        extra={activeProject?.name || clean || 'no domain'}
      />

      {!clean && (
        <div className="rounded-xl border border-border bg-bg-card p-5 text-sm text-fg-muted text-center">
          Choose a project domain to load live overview widgets.
        </div>
      )}

      {/* Multi-source overview strip — only real values */}
      {hasStrip && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 md:gap-3">
          {dr !== undefined && (
            <div className="bg-bg-card border border-border rounded-xl p-3 md:p-3.5 hover:border-border-light transition-all card-glow relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent pointer-events-none" />
              <div className="relative">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] md:text-xs text-fg-dim">Domain Rating</span>
                  <span className="text-[9px] md:text-[10px] bg-orange-500/20 text-orange-300 border border-orange-500/30 px-1.5 py-0.5 rounded-md font-medium touch-target-reset">Ahrefs</span>
                </div>
                <p className="text-xl md:text-2xl font-bold text-fg">{dr}</p>
                {ahrefsRank != null && <p className="text-[11px] text-fg-dim mt-0.5">AR #{Number(ahrefsRank).toLocaleString()}</p>}
              </div>
            </div>
          )}
          {semrushKeywords && (
            <div className="bg-bg-card border border-border rounded-xl p-3 md:p-3.5 hover:border-border-light transition-all card-glow relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-400/5 to-transparent pointer-events-none" />
              <div className="relative">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] md:text-xs text-fg-dim">Organic Keywords</span>
                  <span className="text-[9px] md:text-[10px] bg-orange-400/20 text-orange-200 border border-orange-400/30 px-1.5 py-0.5 rounded-md font-medium touch-target-reset">SEMrush</span>
                </div>
                <p className="text-xl md:text-2xl font-bold text-fg">{Number(semrushKeywords || 0).toLocaleString()}</p>
              </div>
            </div>
          )}
          {semrushTraffic && (
            <div className="bg-bg-card border border-border rounded-xl p-3 md:p-3.5 hover:border-border-light transition-all card-glow relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-400/5 to-transparent pointer-events-none" />
              <div className="relative">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] md:text-xs text-fg-dim">Organic Traffic</span>
                  <span className="text-[9px] md:text-[10px] bg-orange-400/20 text-orange-200 border border-orange-400/30 px-1.5 py-0.5 rounded-md font-medium touch-target-reset">SEMrush</span>
                </div>
                <p className="text-xl md:text-2xl font-bold text-fg">{Number(semrushTraffic || 0).toLocaleString()}</p>
              </div>
            </div>
          )}
          {bl != null && (
            <div className="bg-bg-card border border-border rounded-xl p-3 md:p-3.5 hover:border-border-light transition-all card-glow relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none" />
              <div className="relative">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] md:text-xs text-fg-dim">Backlinks</span>
                  <span className="text-[9px] md:text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-md font-medium touch-target-reset">DataForSEO</span>
                </div>
                <p className="text-xl md:text-2xl font-bold text-fg">{Number(bl || 0).toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-5 gap-3 md:gap-4 lg:gap-5">
        <div className="col-span-2 md:col-span-2 xl:col-span-1">
          <SEOHealthScore />
        </div>
        <div className="col-span-2 md:col-span-2 xl:col-span-4 grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 lg:gap-5">
          <MetricCards />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 md:gap-4 lg:gap-5">
        <div className="xl:col-span-2">
          <OrganicTrafficChart dateRange={dateRange} onDateRangeChange={setDateRange} />
        </div>
        <TopPages />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4 lg:gap-5">
        <KeywordRankings />
        <CoreWebVitals />
        <div className="md:col-span-2 xl:col-span-1">
          <AlertsPanel />
        </div>
      </div>
    </div>
  )
}
