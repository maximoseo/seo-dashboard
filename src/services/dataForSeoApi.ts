// Frontend service for DataForSEO — calls Express backend endpoints
const CACHE_TTL_SHORT = 5 * 60 * 1000
const CACHE_TTL_LONG = 24 * 60 * 60 * 1000

function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`dfs_cache_${key}`)
    if (!raw) return null
    const { data, expiry } = JSON.parse(raw)
    if (Date.now() > expiry) { localStorage.removeItem(`dfs_cache_${key}`); return null }
    return data as T
  } catch { return null }
}

function setCache<T>(key: string, data: T, ttl: number): void {
  try { localStorage.setItem(`dfs_cache_${key}`, JSON.stringify({ data, expiry: Date.now() + ttl })) } catch {}
}

export interface SerpResult {
  keyword: string
  position: number
  title: string
  url: string
  description: string
  type: string
}

export interface DfsDomainSummary {
  backlinks: number
  referring_domains: number
  broken_backlinks: number
  referring_pages: number
  rank: number
}

export async function fetchSerpResults(keyword: string, locationCode = 2840): Promise<SerpResult[]> {
  const cacheKey = `serp_${keyword}_${locationCode}`
  const cached = getCached<SerpResult[]>(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch('/api/dataforseo/serp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, location_code: locationCode }),
    })
    if (!res.ok) throw new Error(`DataForSEO error: ${res.status}`)
    const json = await res.json()
    const items = json?.tasks?.[0]?.result?.[0]?.items || []
    const results = items.filter((i: any) => i.type === 'organic').map((i: any) => ({
      keyword,
      position: i.rank_absolute || 0,
      title: i.title || '',
      url: i.url || '',
      description: i.description || '',
      type: i.type || 'organic',
    }))
    setCache(cacheKey, results, CACHE_TTL_LONG)
    return results
  } catch {
    return []
  }
}

export async function fetchDomainSummary(target: string): Promise<DfsDomainSummary | null> {
  const cacheKey = `domain_${target}`
  const cached = getCached<DfsDomainSummary>(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch('/api/dataforseo/domain-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    })
    if (!res.ok) throw new Error(`DataForSEO error: ${res.status}`)
    const json = await res.json()
    const result = json?.tasks?.[0]?.result?.[0]
    if (!result) return null
    const summary: DfsDomainSummary = {
      backlinks: result.backlinks || 0,
      referring_domains: result.referring_domains || 0,
      broken_backlinks: result.broken_backlinks || 0,
      referring_pages: result.referring_pages || 0,
      rank: result.rank || 0,
    }
    setCache(cacheKey, summary, CACHE_TTL_SHORT)
    return summary
  } catch {
    return null
  }
}

export async function fetchOnPageAudit(target: string): Promise<any> {
  const cacheKey = `onpage_${target}`
  const cached = getCached<any>(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch('/api/dataforseo/onpage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, max_crawl_pages: 10 }),
    })
    if (!res.ok) throw new Error(`DataForSEO error: ${res.status}`)
    const json = await res.json()
    setCache(cacheKey, json, CACHE_TTL_LONG)
    return json
  } catch {
    return null
  }
}

export function clearDfsCache(): void {
  Object.keys(localStorage).filter(k => k.startsWith('dfs_cache_')).forEach(k => localStorage.removeItem(k))
}
