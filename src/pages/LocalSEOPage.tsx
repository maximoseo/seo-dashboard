import { useQuery } from '@tanstack/react-query'
import { DataCard } from '@/components/DataCard'
import DataStateBadge from '@/components/DataStateBadge'
import { useSEO } from '@/contexts/SEOContext'
import { authFetch } from '@/lib/authToken'

interface LocalCheck { name: string; status: string; detail: string }

const fallbackChecks: LocalCheck[] = [
  { name: 'GBP health', status: 'planned', detail: 'Profile completeness, categories, photos and service areas.' },
  { name: 'Reviews velocity', status: 'planned', detail: 'New reviews, response SLA and sentiment anomalies.' },
  { name: 'Local rank grid', status: 'planned', detail: 'City/device/keyword grid tracking for Hebrew + English.' },
  { name: 'NAP consistency', status: 'planned', detail: 'Name/address/phone citation consistency checks.' },
]

async function fetchLocalSeo(domain: string): Promise<{ checks: LocalCheck[]; source: string }> {
  const res = await authFetch(`/api/local-seo/overview?domain=${encodeURIComponent(domain)}`)
  if (!res.ok) throw new Error(`Local SEO API failed: ${res.status}`)
  return res.json()
}

export default function LocalSEOPage() {
  const { domain } = useSEO()
  const { data, isLoading, error } = useQuery({ queryKey: ['local-seo', domain], queryFn: () => fetchLocalSeo(domain), staleTime: 10 * 60 * 1000 })
  const checks = data?.checks?.length ? data.checks : fallbackChecks
  const state = error ? 'unavailable' : data ? 'live' : isLoading ? 'loading' : 'planned'

  return (
    <div className="space-y-4 lg:space-y-5 max-w-[1400px]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Local SEO</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">GBP, local rank grid and NAP quality for {domain}</p>
        </div>
        <DataStateBadge state={state} source={data?.source || 'local fallback'} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {checks.map(check => (
          <DataCard key={check.name} title={check.name} dataState={check.status === 'planned' ? 'planned' : state}>
            <p className="text-sm leading-relaxed text-fg-muted">{check.detail}</p>
            <span className="mt-3 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-wide text-fg-dim">{check.status}</span>
          </DataCard>
        ))}
      </div>
    </div>
  )
}
