import { useQuery } from '@tanstack/react-query'
import { DataCard } from '@/components/DataCard'
import DataStateBadge from '@/components/DataStateBadge'
import { useSEO } from '@/contexts/SEOContext'
import { authFetch } from '@/lib/authToken'

interface GeoCheck { name: string; status: string; detail?: string }

const fallbackChecks: GeoCheck[] = [
  { name: 'AI Overview visibility', status: 'planned', detail: 'Track whether target queries trigger AI Overviews and whether the brand is cited.' },
  { name: 'Entity completeness', status: 'planned', detail: 'Schema, author, organization, services and topical entity coverage.' },
  { name: 'Citation opportunities', status: 'planned', detail: 'Content and source pages likely to improve LLM/answer-engine citations.' },
  { name: 'Prompt snapshots', status: 'planned', detail: 'Repeatable checks for branded/non-branded prompts with evidence history.' },
]

async function fetchGeoAi(domain: string): Promise<{ checks: GeoCheck[]; source: string }> {
  const res = await authFetch(`/api/geo-ai/overview?domain=${encodeURIComponent(domain)}`)
  if (!res.ok) throw new Error(`GEO API failed: ${res.status}`)
  return res.json()
}

export default function GeoAIPage() {
  const { domain } = useSEO()
  const { data, isLoading, error } = useQuery({ queryKey: ['geo-ai', domain], queryFn: () => fetchGeoAi(domain), staleTime: 10 * 60 * 1000 })
  const checks = data?.checks?.length ? data.checks : fallbackChecks
  const state = error ? 'unavailable' : data ? 'live' : isLoading ? 'loading' : 'planned'

  return (
    <div className="space-y-4 lg:space-y-5 max-w-[1400px]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">GEO / AI Search</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">Generative search visibility and entity readiness for {domain}</p>
        </div>
        <DataStateBadge state={state} source={data?.source || 'GEO fallback'} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {checks.map(check => (
          <DataCard key={check.name} title={check.name} dataState={check.status === 'planned' ? 'planned' : state}>
            <p className="text-sm leading-relaxed text-fg-muted">{check.detail || 'Connect provider evidence to activate this GEO check.'}</p>
            <span className="mt-3 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-wide text-fg-dim">{check.status}</span>
          </DataCard>
        ))}
      </div>
    </div>
  )
}
