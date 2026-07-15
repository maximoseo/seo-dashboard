import { useQuery } from '@tanstack/react-query'
import { DataCard } from '@/components/DataCard'
import DataStateBadge from '@/components/DataStateBadge'
import { useSEO } from '@/contexts/SEOContext'
import { useProject } from '@/contexts/ProjectContext'
import { authFetch } from '@/lib/authToken'
import DomainIntegrityBar from '@/components/DomainIntegrityBar'
import { canonicalizeDomain } from '@/lib/domain'
import { useDomainSwitchCleanup } from '@/lib/useDomainQuery'

interface LocalCheck {
  name: string
  status: string
  detail: string
  evidence?: string[]
  score?: number | null
}

type LocalResponse = {
  domain: string
  source: string
  dataState?: string
  readinessScore?: number
  market?: { code?: string; label?: string }
  checks: LocalCheck[]
  fetchedAt?: string
}

const fallbackChecks: LocalCheck[] = [
  { name: 'GBP health', status: 'planned', detail: 'Profile completeness, categories, photos and service areas.' },
  { name: 'Reviews velocity', status: 'planned', detail: 'New reviews, response SLA and sentiment anomalies.' },
  { name: 'Local rank grid', status: 'planned', detail: 'City/device/keyword grid tracking for Hebrew + English.' },
  { name: 'NAP consistency', status: 'planned', detail: 'Name/address/phone citation consistency checks.' },
]

async function fetchLocalSeo(domain: string, market?: string | null): Promise<LocalResponse> {
  const params = new URLSearchParams({ domain })
  if (market) params.set('market', market)
  const res = await authFetch(`/api/local-seo/overview?${params.toString()}`)
  if (!res.ok) throw new Error(`Local SEO API failed: ${res.status}`)
  return res.json()
}

function mapCheckState(status: string, outer: string) {
  if (status === 'planned') return 'planned'
  if (status === 'unavailable') return 'unavailable'
  if (status === 'partial') return 'cached'
  if (status === 'live') return 'live'
  return outer
}

export default function LocalSEOPage() {
  const { domain } = useSEO()
  const { activeProject } = useProject()
  useDomainSwitchCleanup(domain)
  const clean = canonicalizeDomain(domain)
  const projectMarket = activeProject?.market || null
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['local-seo', clean, projectMarket],
    queryFn: () => fetchLocalSeo(clean, projectMarket),
    enabled: !!clean,
    staleTime: 10 * 60 * 1000,
  })
  // Prefer live payload checks; fallback is explicitly planned empty-state scaffold, not demo client metrics
  const checks = data?.checks?.length
    ? data.checks
    : (error || isLoading ? [] : fallbackChecks)
  const state = error
    ? 'unavailable'
    : data?.dataState === 'partial'
      ? 'cached'
      : data
        ? 'live'
        : isLoading
          ? 'loading'
          : 'planned'
  const marketLabel = data?.market?.label || projectMarket

  return (
    <div className="max-w-[1400px] space-y-4 lg:space-y-5">
      <DomainIntegrityBar
        activeDomain={clean}
        payloadDomain={data?.domain || clean}
        dataState={state as any}
        fetchedAt={data?.fetchedAt}
        rowCount={checks.length}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-fg md:text-lg">Local SEO</h2>
          <p className="mt-0.5 text-xs text-fg-muted md:text-sm">
            GBP / reviews / NAP + local-pack signals from keyword spine for {domain}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DataStateBadge state={state as any} source={data?.source || 'local fallback'} fetchedAt={data?.fetchedAt} />
          <button
            onClick={() => void refetch()}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted hover:border-border-light hover:text-fg"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-border bg-bg-card p-4">
          <p className="text-[11px] text-fg-dim">Readiness</p>
          <p className="mt-2 text-2xl font-bold text-fg">{data?.readinessScore ?? '—'}%</p>
        </div>
        <div className="rounded-2xl border border-border bg-bg-card p-4">
          <p className="text-[11px] text-fg-dim">Market</p>
          <p className="mt-2 text-lg font-semibold text-fg">{marketLabel || '—'}</p>
        </div>
        <div className="rounded-2xl border border-border bg-bg-card p-4">
          <p className="text-[11px] text-fg-dim">Checks live/partial</p>
          <p className="mt-2 text-2xl font-bold text-fg">
            {checks.filter((c) => c.status === 'live' || c.status === 'partial').length}/{checks.length}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-bg-card p-4">
          <p className="text-[11px] text-fg-dim">Source</p>
          <p className="mt-2 text-sm font-medium text-fg">{data?.source || 'planned'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {checks.map((check) => (
          <DataCard key={check.name} title={check.name} dataState={mapCheckState(check.status, state) as any}>
            <p className="text-sm leading-relaxed text-fg-muted">{check.detail}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-wide text-fg-dim">
                {check.status}
              </span>
              {check.score != null && (
                <span className="inline-flex rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[10px] text-accent-light">
                  score {check.score}
                </span>
              )}
            </div>
            {!!check.evidence?.length && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {check.evidence.map((ev) => (
                  <span key={ev} className="rounded border border-border bg-bg-darkest px-1.5 py-0.5 text-[10px] text-fg-dim">
                    {ev}
                  </span>
                ))}
              </div>
            )}
          </DataCard>
        ))}
      </div>
    </div>
  )
}
