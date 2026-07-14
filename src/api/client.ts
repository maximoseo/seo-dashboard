import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authToken'
import { normalizeSemrush, normalizeAhrefs, normalizeOverview } from './normalize'

const API_BASE = import.meta.env.VITE_API_URL || ''

async function fetchAPI(endpoint: string, params?: Record<string, string>) {
  const url = new URL(`${API_BASE}/api/${endpoint}`, window.location.origin)
  if (params) Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
  })

  const res = await authFetch(url)
  if (!res.ok) throw new Error(`${endpoint} failed: ${res.status}`)
  return res.json()
}

export function useOverview(domain: string | null, market?: string | null) {
  const marketParam = market?.trim() || ''
  return useQuery({
    queryKey: ['overview', domain, marketParam],
    queryFn: async () => {
      const params: Record<string, string> = { domain: domain! }
      if (marketParam) params.market = marketParam
      const data = await fetchAPI('overview', params)
      const semrush = normalizeSemrush(data?.sources?.semrush)
      const ahrefs = normalizeAhrefs(data?.sources?.ahrefs)
      const dfs = data?.sources?.dataforseo
      return normalizeOverview(semrush, ahrefs, dfs)
    },
    enabled: !!domain,
    staleTime: 5 * 60 * 1000,
  })
}

export function useKeywords(domain: string | null, market?: string | null) {
  const marketParam = market?.trim() || ''
  return useQuery({
    queryKey: ['keywords', domain, marketParam],
    queryFn: async () => {
      const params: Record<string, string> = { domain: domain!, limit: '100' }
      if (marketParam) params.market = marketParam
      return fetchAPI('keywords/aggregated', params)
    },
    enabled: !!domain,
    staleTime: 10 * 60 * 1000,
  })
}

/** Force live re-fetch of keywords (bypasses server snapshot). */
export async function refreshKeywords(domain: string, market?: string | null) {
  const params: Record<string, string> = { domain, limit: '100', refresh: '1' }
  if (market?.trim()) params.market = market.trim()
  return fetchAPI('keywords/aggregated', params)
}

export function usePages(domain: string | null, market?: string | null) {
  const marketParam = market?.trim() || ''
  return useQuery({
    queryKey: ['pages', domain, marketParam],
    queryFn: async () => {
      const params: Record<string, string> = { domain: domain!, limit: '100' }
      if (marketParam) params.market = marketParam
      return fetchAPI('pages/aggregated', params)
    },
    enabled: !!domain,
    staleTime: 10 * 60 * 1000,
  })
}

/** Force live re-fetch of top pages. */
export async function refreshPages(domain: string, market?: string | null) {
  const params: Record<string, string> = { domain, limit: '100', refresh: '1' }
  if (market?.trim()) params.market = market.trim()
  return fetchAPI('pages/aggregated', params)
}

export function useBacklinksAgg(domain: string | null, market?: string | null) {
  const marketParam = market?.trim() || ''
  return useQuery({
    queryKey: ['backlinks', domain, marketParam],
    queryFn: async () => {
      const params: Record<string, string> = { domain: domain! }
      if (marketParam) params.market = marketParam
      return fetchAPI('backlinks/aggregated', params)
    },
    enabled: !!domain,
    staleTime: 10 * 60 * 1000,
  })
}

/** Force live re-fetch of backlinks aggregate. */
export async function refreshBacklinks(domain: string, market?: string | null) {
  const params: Record<string, string> = { domain, refresh: '1' }
  if (market?.trim()) params.market = market.trim()
  return fetchAPI('backlinks/aggregated', params)
}

export function useCompetitors(domain: string | null, market?: string | null) {
  const marketParam = market?.trim() || ''
  return useQuery({
    queryKey: ['competitors', domain, marketParam],
    queryFn: async () => {
      const params: Record<string, string> = { domain: domain! }
      if (marketParam) params.market = marketParam
      return fetchAPI('competitors/aggregated', params)
    },
    enabled: !!domain,
    staleTime: 10 * 60 * 1000,
  })
}

export async function refreshCompetitors(domain: string, market?: string | null) {
  const params: Record<string, string> = { domain, refresh: '1' }
  if (market?.trim()) params.market = market.trim()
  return fetchAPI('competitors/aggregated', params)
}

export function useAlerts(domain: string | null) {
  return useQuery({
    queryKey: ['alerts', domain],
    queryFn: async () => fetchAPI('alerts/aggregated', { domain: domain! }),
    enabled: !!domain,
    staleTime: 2 * 60 * 1000,
  })
}

export async function refreshAlerts(domain: string) {
  return fetchAPI('alerts/aggregated', { domain, refresh: '1' })
}

export function useSiteAudit(domain: string | null, market?: string | null) {
  const marketParam = market?.trim() || ''
  return useQuery({
    queryKey: ['site-audit', domain, marketParam],
    queryFn: async () => {
      const params: Record<string, string> = { domain: domain!, max_pages: '20' }
      if (marketParam) params.market = marketParam
      return fetchAPI('site-audit/aggregated', params)
    },
    enabled: !!domain,
    staleTime: 30 * 60 * 1000,
  })
}

/** Force live re-fetch of technical site audit. */
export async function refreshSiteAudit(domain: string, market?: string | null) {
  const params: Record<string, string> = { domain, refresh: '1', max_pages: '20' }
  if (market?.trim()) params.market = market.trim()
  return fetchAPI('site-audit/aggregated', params)
}
