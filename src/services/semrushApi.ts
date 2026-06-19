// Frontend service for SEMrush — calls Express backend endpoints
const CACHE_TTL_SHORT = 5 * 60 * 1000
const CACHE_TTL_LONG = 24 * 60 * 60 * 1000

function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`sem_cache_${key}`)
    if (!raw) return null
    const { data, expiry } = JSON.parse(raw)
    if (Date.now() > expiry) { localStorage.removeItem(`sem_cache_${key}`); return null }
    return data as T
  } catch { return null }
}

function setCache<T>(key: string, data: T, ttl: number): void {
  try { localStorage.setItem(`sem_cache_${key}`, JSON.stringify({ data, expiry: Date.now() + ttl })) } catch {}
}

export interface SemrushDomainOverview {
  domain: string
  rank: number
  organic_keywords: number
  organic_traffic: number
  organic_cost: number
  adwords_keywords: number
  adwords_traffic: number
  adwords_cost: number
}

export interface SemrushKeyword {
  keyword: string
  position: number
  previous_position: number
  search_volume: number
  cpc: number
  url: string
  traffic_percent: number
  traffic_cost: number
  competition: number
  trends: string
}

export interface SemrushCompetitor {
  domain: string
  common_keywords: number
  organic_keywords: number
  organic_traffic: number
  organic_cost: number
  adwords_keywords: number
}

export async function fetchDomainOverview(domain: string): Promise<SemrushDomainOverview | null> {
  const cacheKey = `overview_${domain}`
  const cached = getCached<SemrushDomainOverview>(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch(`/api/semrush/domain-overview?domain=${encodeURIComponent(domain)}`)
    if (!res.ok) throw new Error(`SEMrush error: ${res.status}`)
    const data = await res.json()
    if (!data) return null
    const result: SemrushDomainOverview = {
      domain: data.Dn || domain,
      rank: parseInt(data.Rk || '0'),
      organic_keywords: parseInt(data.Or || '0'),
      organic_traffic: parseInt(data.Ot || '0'),
      organic_cost: parseFloat(data.Oc || '0'),
      adwords_keywords: parseInt(data.Ad || '0'),
      adwords_traffic: parseInt(data.At || '0'),
      adwords_cost: parseFloat(data.Ac || '0'),
    }
    setCache(cacheKey, result, CACHE_TTL_SHORT)
    return result
  } catch {
    return null
  }
}

export async function fetchCompetitors(domain: string): Promise<SemrushCompetitor[]> {
  const cacheKey = `competitors_${domain}`
  const cached = getCached<SemrushCompetitor[]>(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch(`/api/semrush/competitors?domain=${encodeURIComponent(domain)}`)
    if (!res.ok) throw new Error(`SEMrush error: ${res.status}`)
    const data = await res.json()
    if (!Array.isArray(data)) return []
    const results = data.map((r: any) => ({
      domain: r.Dn || '',
      common_keywords: parseInt(r.Np || '0'),
      organic_keywords: parseInt(r.Or || '0'),
      organic_traffic: parseInt(r.Ot || '0'),
      organic_cost: parseFloat(r.Oc || '0'),
      adwords_keywords: parseInt(r.Ad || '0'),
    }))
    setCache(cacheKey, results, CACHE_TTL_LONG)
    return results
  } catch {
    return []
  }
}

export async function fetchKeywordOverview(keyword: string): Promise<any> {
  const cacheKey = `kw_${keyword}`
  const cached = getCached<any>(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch(`/api/semrush/keyword-overview?keyword=${encodeURIComponent(keyword)}`)
    if (!res.ok) throw new Error(`SEMrush error: ${res.status}`)
    const data = await res.json()
    setCache(cacheKey, data, CACHE_TTL_LONG)
    return data
  } catch {
    return null
  }
}

export function clearSemrushCache(): void {
  Object.keys(localStorage).filter(k => k.startsWith('sem_cache_')).forEach(k => localStorage.removeItem(k))
}
