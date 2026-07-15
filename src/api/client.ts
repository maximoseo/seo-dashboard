import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authToken'
import { normalizeSemrush, normalizeAhrefs, normalizeOverview } from './normalize'
import { assertPayloadDomain, canonicalizeDomain } from '@/lib/domain'

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

/** Drop payloads that don't match the requested domain. */
function guardDomain<T extends { domain?: string; canonicalDomain?: string; requestedDomain?: string }>(
  data: T,
  domain: string,
): T {
  const check = assertPayloadDomain(data, domain)
  if (!check.ok) {
    throw new Error(`Domain integrity: ${check.reason}`)
  }
  return check.data
}

export function useOverview(domain: string | null, market?: string | null) {
  const marketParam = market?.trim() || ''
  const clean = canonicalizeDomain(domain)
  return useQuery({
    queryKey: ['overview', clean, marketParam],
    queryFn: async () => {
      const params: Record<string, string> = { domain: clean }
      if (marketParam) params.market = marketParam
      const data = await fetchAPI('overview', params)
      const safe = guardDomain(data, clean)
      const semrush = normalizeSemrush(safe?.sources?.semrush)
      const ahrefs = normalizeAhrefs(safe?.sources?.ahrefs)
      const dfs = safe?.sources?.dataforseo
      return { ...normalizeOverview(semrush, ahrefs, dfs), domain: clean, integrity: safe.integrity, raw: safe }
    },
    enabled: !!clean,
    staleTime: 5 * 60 * 1000,
  })
}

export function useKeywords(domain: string | null, market?: string | null) {
  const marketParam = market?.trim() || ''
  const clean = canonicalizeDomain(domain)
  return useQuery({
    queryKey: ['keywords', clean, marketParam],
    queryFn: async () => {
      const params: Record<string, string> = { domain: clean, limit: '100' }
      if (marketParam) params.market = marketParam
      const data = await fetchAPI('keywords/aggregated', params)
      return guardDomain(data, clean)
    },
    enabled: !!clean,
    staleTime: 10 * 60 * 1000,
  })
}

/** Force live re-fetch of keywords (bypasses server snapshot). */
export async function refreshKeywords(domain: string, market?: string | null) {
  const clean = canonicalizeDomain(domain)
  const params: Record<string, string> = { domain: clean, limit: '100', refresh: '1' }
  if (market?.trim()) params.market = market.trim()
  return guardDomain(await fetchAPI('keywords/aggregated', params), clean)
}

export function usePages(domain: string | null, market?: string | null) {
  const marketParam = market?.trim() || ''
  const clean = canonicalizeDomain(domain)
  return useQuery({
    queryKey: ['pages', clean, marketParam],
    queryFn: async () => {
      const params: Record<string, string> = { domain: clean, limit: '100' }
      if (marketParam) params.market = marketParam
      return guardDomain(await fetchAPI('pages/aggregated', params), clean)
    },
    enabled: !!clean,
    staleTime: 10 * 60 * 1000,
  })
}

/** Force live re-fetch of top pages. */
export async function refreshPages(domain: string, market?: string | null) {
  const clean = canonicalizeDomain(domain)
  const params: Record<string, string> = { domain: clean, limit: '100', refresh: '1' }
  if (market?.trim()) params.market = market.trim()
  return guardDomain(await fetchAPI('pages/aggregated', params), clean)
}

export function useBacklinksAgg(domain: string | null, market?: string | null) {
  const marketParam = market?.trim() || ''
  const clean = canonicalizeDomain(domain)
  return useQuery({
    queryKey: ['backlinks', clean, marketParam],
    queryFn: async () => {
      const params: Record<string, string> = { domain: clean }
      if (marketParam) params.market = marketParam
      return guardDomain(await fetchAPI('backlinks/aggregated', params), clean)
    },
    enabled: !!clean,
    staleTime: 10 * 60 * 1000,
  })
}

/** Force live re-fetch of backlinks aggregate. */
export async function refreshBacklinks(domain: string, market?: string | null) {
  const clean = canonicalizeDomain(domain)
  const params: Record<string, string> = { domain: clean, refresh: '1' }
  if (market?.trim()) params.market = market.trim()
  return guardDomain(await fetchAPI('backlinks/aggregated', params), clean)
}

export function useCompetitors(domain: string | null, market?: string | null) {
  const marketParam = market?.trim() || ''
  const clean = canonicalizeDomain(domain)
  return useQuery({
    queryKey: ['competitors', clean, marketParam],
    queryFn: async () => {
      const params: Record<string, string> = { domain: clean }
      if (marketParam) params.market = marketParam
      return guardDomain(await fetchAPI('competitors/aggregated', params), clean)
    },
    enabled: !!clean,
    staleTime: 10 * 60 * 1000,
  })
}

export async function refreshCompetitors(domain: string, market?: string | null) {
  const clean = canonicalizeDomain(domain)
  const params: Record<string, string> = { domain: clean, refresh: '1' }
  if (market?.trim()) params.market = market.trim()
  return guardDomain(await fetchAPI('competitors/aggregated', params), clean)
}

export function useAlerts(domain: string | null) {
  const clean = canonicalizeDomain(domain)
  return useQuery({
    queryKey: ['alerts', clean],
    queryFn: async () => guardDomain(await fetchAPI('alerts/aggregated', { domain: clean }), clean),
    enabled: !!clean,
    staleTime: 2 * 60 * 1000,
  })
}

export async function refreshAlerts(domain: string) {
  const clean = canonicalizeDomain(domain)
  return guardDomain(await fetchAPI('alerts/aggregated', { domain: clean, refresh: '1' }), clean)
}

export function useSiteAudit(
  domain: string | null,
  market?: string | null,
  maxPages: number = 20,
) {
  const marketParam = market?.trim() || ''
  const clean = canonicalizeDomain(domain)
  const crawlLimit = Math.min(Math.max(Number(maxPages) || 20, 5), 50)
  return useQuery({
    queryKey: ['site-audit', clean, marketParam, crawlLimit],
    queryFn: async () => {
      const params: Record<string, string> = {
        domain: clean,
        max_pages: String(crawlLimit),
      }
      if (marketParam) params.market = marketParam
      return guardDomain(await fetchAPI('site-audit/aggregated', params), clean)
    },
    enabled: !!clean,
    staleTime: 30 * 60 * 1000,
  })
}

/** Force live re-fetch of technical site audit. */
export async function refreshSiteAudit(
  domain: string,
  market?: string | null,
  maxPages: number = 20,
) {
  const clean = canonicalizeDomain(domain)
  const crawlLimit = Math.min(Math.max(Number(maxPages) || 20, 5), 50)
  const params: Record<string, string> = {
    domain: clean,
    refresh: '1',
    max_pages: String(crawlLimit),
  }
  if (market?.trim()) params.market = market.trim()
  return guardDomain(await fetchAPI('site-audit/aggregated', params), clean)
}
