// Multi-source SEO API service
// All calls go through the Express backend at /api/*

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

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

function setCache<T>(key: string, data: T, ttl = CACHE_TTL): void {
  try {
    sessionStorage.setItem(`seo_cache_${key}`, JSON.stringify({ data, expiry: Date.now() + ttl }))
  } catch {
    // storage full
  }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const cacheKey = url + JSON.stringify(options?.body || '')
  const cached = getCached<T>(cacheKey)
  if (cached) return cached

  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  setCache(cacheKey, data)
  return data
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OverviewData {
  domain: string
  sources: {
    ahrefs?: {
      domain_rating?: { domain_rating: number; ahrefs_rank: number }
    }
    semrush?: Record<string, string>
    dataforseo?: Record<string, any>
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

export interface ApiHealthStatus {
  statuses: Record<string, { ok: boolean; latency?: number; error?: string }>
  cacheStats: {
    realtime: Record<string, number>
    historical: Record<string, number>
  }
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function fetchOverview(domain: string): Promise<OverviewData> {
  return apiFetch<OverviewData>(`/api/overview?domain=${encodeURIComponent(domain)}`)
}

export async function fetchPageSpeed(url: string, strategy: 'mobile' | 'desktop' = 'mobile'): Promise<PageSpeedData> {
  return apiFetch<PageSpeedData>(`/api/pagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}`)
}

export async function fetchSemrushOverview(domain: string) {
  return apiFetch<Record<string, string>>(`/api/semrush/domain-overview?domain=${encodeURIComponent(domain)}`)
}

export async function fetchSemrushCompetitors(domain: string) {
  return apiFetch<Record<string, string>[]>(`/api/semrush/competitors?domain=${encodeURIComponent(domain)}`)
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

export async function fetchSerpstatDomain(domain: string) {
  return apiFetch<any>('/api/serpstat/domain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain }),
  })
}

export async function fetchKeywordsEverywhere(keywords: string[]) {
  return apiFetch<any>('/api/keywords-everywhere', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords }),
  })
}

export async function fetchApiHealth(): Promise<ApiHealthStatus> {
  const res = await fetch('/api/health')
  return res.json()
}

export async function clearApiCache(): Promise<void> {
  await fetch('/api/cache/clear', { method: 'POST' })
  // Also clear frontend session cache
  const keys = Object.keys(sessionStorage).filter(k => k.startsWith('seo_cache_'))
  keys.forEach(k => sessionStorage.removeItem(k))
}

export function getToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
