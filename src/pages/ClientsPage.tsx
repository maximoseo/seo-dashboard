import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DataCard } from '@/components/DataCard'
import DataStateBadge from '@/components/DataStateBadge'
import { useSEO } from '@/contexts/SEOContext'
import { authFetch } from '@/lib/authToken'

interface ClientDomain {
  id: string
  name: string
  domain: string
  market: string
  priority: string
  status: string
}

const fallbackClients: ClientDomain[] = [
  { id: 'maximo', name: 'Maximo SEO', domain: 'maximo-seo.ai', market: 'Israel / Global', priority: 'Primary', status: 'active' },
  { id: 'galoz', name: 'Galoz', domain: 'galoz.co.il', market: 'Israel', priority: 'Client', status: 'ready' },
]

async function fetchClients(): Promise<{ clients: ClientDomain[]; source: string; fetchedAt: string }> {
  const res = await authFetch('/api/clients')
  if (!res.ok) throw new Error(`Clients API failed: ${res.status}`)
  return res.json()
}

export default function ClientsPage() {
  const { domain, setDomain } = useSEO()
  const { data, isLoading, error } = useQuery({ queryKey: ['clients'], queryFn: fetchClients, staleTime: 10 * 60 * 1000 })
  const clients = data ? data.clients : fallbackClients
  const active = useMemo(() => clients.find(c => c.domain === domain) || clients[0] || {
    id: 'empty',
    name: 'No clients configured',
    domain,
    market: 'API returned an empty portfolio',
    priority: 'n/a',
    status: 'empty',
  }, [clients, domain])
  const dataState = error ? 'unavailable' : data ? 'live' : isLoading ? 'loading' : 'cached'

  return (
    <div className="space-y-4 lg:space-y-5 max-w-[1400px]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Clients / Domains</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">Portfolio selector and per-domain monitoring readiness</p>
        </div>
        <DataStateBadge state={dataState} source={data?.source || 'local fallback'} fetchedAt={data?.fetchedAt} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DataCard title="Active Domain" dataState={dataState} fetchedAt={data?.fetchedAt} className="lg:col-span-1">
          <p className="text-3xl font-bold text-fg">{active.domain}</p>
          <p className="mt-2 text-sm text-fg-muted">{active.name} • {active.market}</p>
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-fg-muted">
            This value powers dashboard API requests and persists to browser storage for the current operator.
          </div>
          {error && <p className="mt-3 text-xs text-yellow">API unavailable, showing local fallback portfolio.</p>}
        </DataCard>

        <DataCard title="Portfolio Domains" dataState={dataState} className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {clients.map(client => (
              <button
                key={client.domain}
                onClick={() => setDomain(client.domain)}
                className={`rounded-xl border p-4 text-left transition-colors ${domain === client.domain ? 'border-accent bg-accent/10' : 'border-border bg-bg-darkest hover:border-border-light'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-fg">{client.name}</p>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-wide text-fg-dim">{client.status}</span>
                </div>
                <p className="mt-1 text-sm text-accent-light">{client.domain}</p>
                <p className="mt-2 text-xs text-fg-muted">{client.market} • {client.priority}</p>
              </button>
            ))}
          </div>
        </DataCard>
      </div>

      <DataCard title="Next portfolio foundation" dataState="planned">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          {[
            ['Supabase table', 'seo_clients + seo_domains with RLS by user role.'],
            ['Google Sheet import', 'Seed existing Maximo clients without storing secrets in the frontend.'],
            ['Per-domain SLA', 'Freshness thresholds, provider budgets and alert routing.'],
          ].map(([title, body]) => (
            <div key={title} className="rounded-xl border border-border bg-bg-darkest p-4">
              <p className="font-semibold text-fg">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-fg-muted">{body}</p>
            </div>
          ))}
        </div>
      </DataCard>
    </div>
  )
}
