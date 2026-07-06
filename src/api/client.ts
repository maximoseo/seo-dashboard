import { useQuery } from '@tanstack/react-query'
import { normalizeSemrush, normalizeAhrefs, normalizeOverview } from './normalize'

const API_BASE = import.meta.env.VITE_API_URL || ''

async function fetchAPI(endpoint: string, params?: Record<string, string>) {
  const url = new URL(`${API_BASE}/api/${endpoint}`)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  
  const token = localStorage.getItem('maximo:auth_token')
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
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
    queryFn: async () => {
      const data = await fetchAPI('keywords/aggregated', { domain: domain!, limit: '50' })
      return data
    },
    enabled: !!domain,
    staleTime: 10 * 60 * 1000,
  })
}

export function useAlerts(domain: string | null) {
  return useQuery({
    queryKey: ['alerts', domain],
    queryFn: async () => {
      const data = await fetchAPI('alerts/aggregated', { domain: domain! })
      return data
    },
    enabled: !!domain,
    staleTime: 2 * 60 * 1000,
  })
}
