import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authToken'
import { normalizeSemrush, normalizeAhrefs, normalizeOverview } from './normalize'

const API_BASE = import.meta.env.VITE_API_URL || ''

async function fetchAPI(endpoint: string, params?: Record<string, string>) {
  const url = new URL(`${API_BASE}/api/${endpoint}`, window.location.origin)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await authFetch(url)
  if (!res.ok) throw new Error(`${endpoint} failed: ${res.status}`)
  return res.json()
}

export function useOverview(domain: string | null) {
  return useQuery({
    queryKey: ['overview', domain],
    queryFn: async () => {
      const data = await fetchAPI('overview', { domain: domain! })
      const semrush = normalizeSemrush(data?.sources?.semrush)
      const ahrefs = normalizeAhrefs(data?.sources?.ahrefs)
      const dfs = data?.sources?.dataforseo
      return normalizeOverview(semrush, ahrefs, dfs)
    },
    enabled: !!domain,
    staleTime: 5 * 60 * 1000,
  })
}

export function useKeywords(domain: string | null) {
  return useQuery({
    queryKey: ['keywords', domain],
    queryFn: async () => fetchAPI('keywords/aggregated', { domain: domain!, limit: '50' }),
    enabled: !!domain,
    staleTime: 10 * 60 * 1000,
  })
}

export function useAlerts(domain: string | null) {
  return useQuery({
    queryKey: ['alerts', domain],
    queryFn: async () => fetchAPI('alerts/aggregated', { domain: domain! }),
    enabled: !!domain,
    staleTime: 2 * 60 * 1000,
  })
}
