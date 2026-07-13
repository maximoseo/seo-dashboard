// Multi-source SEO API service
// All calls go through the backend at /api/*

import { authFetch, createAuthorizedHeaders } from '@/lib/authToken'

const CACHE_TTL_REALTIME = 5 * 60 * 1000 // 5 minutes
const CACHE_TTL_HISTORICAL = 24 * 60 * 60 * 1000 // 24 hours
const API_BASE = import.meta.env.VITE_API_URL || ''

function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}

function getCached<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(`seo_cache_${key}`)
    if (!raw) return null
    const { data, expiry } = JSON.parse(raw)
    if (Date.now() > expiry) {
      sessionStorage.removeItem(`seo_cache_${key}`)
      return null
    }
    return data as T
  } catch {
    return null
  }
}

function setCache<T>(key: string, data: T, ttl = CACHE_TTL_REALTIME): void {
  try {
    sessionStorage.setItem(`seo_cache_${key}`, JSON.stringify({ data, expiry: Date.now() + ttl }))
  } catch {
    // storage full
  }
}

async function apiFetch<T>(url: string, options?: RequestInit & { cacheTtl?: number }): Promise<T> {
  const cacheKey = url + JSON.stringify(options?.body || '')
  const cached = getCached<T>(cacheKey)
  if (cached) return cached

  const { cacheTtl, ...fetchOptions } = options || {}
  const res = await authFetch(apiUrl(url), {
    ...fetchOptions,
    headers: createAuthorizedHeaders(fetchOptions.headers),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  setCache(cacheKey, data, cacheTtl || CACHE_TTL_REALTIME)
  return data
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OverviewData {
  domain: string
  activeSources?: string[]
  sources: {
    ahrefs?: {
      domain_rating?: { domain_rating: number; ahrefs_rank: number }
      metrics?: Record<string, any>
    }
    semrush?: Record<string, string>
    dataforseo?: Record<string, any>
    seranking?: Record<string, any>
    exa?: Record<string, any>
  }
}

export interface PageSpeedData {
  lighthouseResult?: {
    categories: {
      performance?: { score: number }
      accessibility?: { score: number }
      'best-practices'?: { score: number }
      seo?: { score: number }
    }
    audits: Record<string, {
      id: string
      title: string
      description: string
      score: number | null
      displayValue?: string
      numericValue?: number
    }>
  }
  loadingExperience?: {
    metrics: {
      FIRST_CONTENTFUL_PAINT_MS?: { percentile: number; category: string }
      FIRST_INPUT_DELAY_MS?: { percentile: number; category: string }
      LARGEST_CONTENTFUL_PAINT_MS?: { percentile: number; category: string }
      CUMULATIVE_LAYOUT_SHIFT_SCORE?: { percentile: number; category: string }
    }
  }
}

export interface AggregatedKeywords {
  activeSources: string[]
  softDegraded?: string[]
  market?: { code?: string; label?: string; semrushDatabase?: string } | null
  normalized?: Array<{
    keyword: string
    volume: number | null
    position: number | null
    previousPosition?: number | null
    url: string | null
    difficulty: number | null
    cpc: number | null
    traffic: number | null
    source: string
    trend?: string | null
  }>
  movements?: {
    improved?: any[]
    declined?: any[]
    newEntries?: any[]
    lost?: any[]
  }
  keywords?: Array<{
    keyword: string
    volume: number | null
    position: number | null
    change: number | null
    url: string | null
    difficulty: number | null
    cpc: number | null
    traffic: number | null
    source: string
    serpFeatures?: string[]
    intent?: string
  }>
  totalCount?: number
  dataState?: string
  fetchedAt?: string
}

export interface AggregatedBacklinks {
  activeSources: string[]
  summary: {
    totalBacklinks: number
    referringDomains: number
    dofollowRatio: number
    newLast30d: number
    lostLast30d: number
  }
  referringDomains: Array<{
    domain: string
    dr: number
    backlinks: number
    firstSeen: string
    source: string
  }>
}

export interface AggregatedVitals {
  activeSources: string[]
  pagespeed?: PageSpeedData
  gtmetrix?: {
    grade: string
    performance: number
    structure: number
    lcp: number
    tbt: number
    cls: number
  }
  browserless?: {
    performance: number
    accessibility: number
    bestPractices: number
    seo: number
  }
}

export interface AggregatedCompetitors {
  activeSources: string[]
  softDegraded?: string[]
  market?: { code?: string; label?: string; semrushDatabase?: string } | null
  normalized?: Array<{
    domain: string
    commonKeywords?: number | null
    traffic?: number | null
    competitionLevel?: number | null
    relevance?: number | null
    topCountry?: string | null
    source: string
  }>
  gaps?: Array<{
    competitor: string
    ourMissingEstimate?: number | null
    note?: string
  }>
  competitors?: Array<{
    domain: string
    commonKeywords?: number
    organicTraffic?: number
    dr?: number
    source: string
  }>
  dataState?: string
  fetchedAt?: string
}

export interface ContentAnalysis {
  activeSources: string[]
  exa?: {
    results: Array<{
      title: string
      url: string
      score: number
      text?: string
    }>
  }
  thorbit?: {
    suggestions: string[]
    score?: number
  }
  dataforseo?: {
    onPage: Record<string, any>
  }
}

export interface AggregatedAlerts {
  activeSources: string[]
  alerts: Array<{
    id: string
    severity: 'critical' | 'warning' | 'info'
    title: string
    description: string
    detail: string
    module: string
    source: string
    time: string
    timestamp: number
  }>
}

export interface ApiHealthStatus {
  statuses: Record<string, { ok: boolean; latency?: number; error?: string; configured?: boolean }>
  cacheStats: {
    realtime: Record<string, number>
    historical: Record<string, number>
  }
}

// ─── Core API calls ───────────────────────────────────────────────────────────

export async function fetchOverview(domain: string, market?: string | null): Promise<OverviewData> {
  const params = new URLSearchParams({ domain })
  if (market?.trim()) params.set('market', market.trim())
  return apiFetch<OverviewData>(`/api/overview?${params.toString()}`)
}

export async function fetchPageSpeed(url: string, strategy: 'mobile' | 'desktop' = 'mobile'): Promise<PageSpeedData> {
  return apiFetch<PageSpeedData>(`/api/pagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}`)
}

export async function fetchSemrushOverview(domain: string, market?: string | null) {
  const params = new URLSearchParams({ domain })
  if (market?.trim()) params.set('market', market.trim())
  return apiFetch<Record<string, string>>(`/api/semrush/domain-overview?${params.toString()}`)
}

export async function fetchSemrushCompetitors(domain: string, market?: string | null) {
  const params = new URLSearchParams({ domain })
  if (market?.trim()) params.set('market', market.trim())
  return apiFetch<Record<string, string>[]>(`/api/semrush/competitors?${params.toString()}`)
}

export async function fetchDataForSeoBacklinks(target: string, limit = 50) {
  return apiFetch<any>('/api/dataforseo/backlinks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, limit }),
  })
}

export async function fetchDataForSeoDomainSummary(target: string) {
  return apiFetch<any>('/api/dataforseo/domain-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target }),
  })
}

// ─── Aggregated multi-source endpoints ────────────────────────────────────────

export async function fetchAggregatedKeywords(domain: string, limit = 50, market?: string | null): Promise<AggregatedKeywords> {
  const params = new URLSearchParams({ domain, limit: String(limit) })
  if (market?.trim()) params.set('market', market.trim())
  return apiFetch<AggregatedKeywords>(`/api/keywords/aggregated?${params.toString()}`)
}

export async function fetchAggregatedBacklinks(domain: string, limit = 50): Promise<AggregatedBacklinks> {
  return apiFetch<AggregatedBacklinks>(`/api/backlinks/aggregated?domain=${encodeURIComponent(domain)}&limit=${limit}`)
}

export async function fetchAggregatedVitals(domain: string): Promise<AggregatedVitals> {
  return apiFetch<AggregatedVitals>('/api/vitals/aggregated', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `https://${domain}` }),
  })
}

export async function fetchAggregatedCompetitors(domain: string, market?: string | null): Promise<AggregatedCompetitors> {
  const params = new URLSearchParams({ domain })
  if (market?.trim()) params.set('market', market.trim())
  return apiFetch<AggregatedCompetitors>(`/api/competitors/aggregated?${params.toString()}`, {
    cacheTtl: CACHE_TTL_HISTORICAL,
  })
}

export async function fetchContentAnalysis(domain: string, keyword?: string): Promise<ContentAnalysis> {
  return apiFetch<ContentAnalysis>('/api/content/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain, keyword: keyword || domain }),
    cacheTtl: CACHE_TTL_HISTORICAL,
  })
}

export async function fetchAggregatedAlerts(domain: string): Promise<AggregatedAlerts> {
  return apiFetch<AggregatedAlerts>(`/api/alerts/aggregated?domain=${encodeURIComponent(domain)}`)
}

// ─── Exa search (for content/competitor research) ─────────────────────────────

export async function fetchExaSearch(query: string, numResults = 10) {
  return apiFetch<any>('/api/exa/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, numResults }),
    cacheTtl: CACHE_TTL_HISTORICAL,
  })
}

export async function fetchExaFetch(urls: string[]) {
  return apiFetch<any>('/api/exa/contents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
    cacheTtl: CACHE_TTL_HISTORICAL,
  })
}

// ─── Browserless (Lighthouse, scraping) ───────────────────────────────────────

export async function fetchBrowserlessLighthouse(url: string) {
  return apiFetch<any>('/api/browserless/lighthouse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
}

export async function fetchBrowserlessScrape(url: string) {
  return apiFetch<any>('/api/browserless/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    cacheTtl: CACHE_TTL_HISTORICAL,
  })
}

// ─── Health & Cache ───────────────────────────────────────────────────────────

export async function fetchApiHealth(): Promise<ApiHealthStatus> {
  const res = await authFetch(apiUrl('/api/status'))
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`)
  return res.json()
}

export async function clearApiCache(): Promise<void> {
  const res = await authFetch(apiUrl('/api/cache/clear'), { method: 'POST' })
  if (!res.ok) throw new Error(`Cache clear failed: ${res.status}`)
  // Also clear frontend session cache
  const keys = Object.keys(sessionStorage).filter(k => k.startsWith('seo_cache_'))
  keys.forEach(k => sessionStorage.removeItem(k))
}

export function getToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
