// Frontend service for GTmetrix — calls Express backend
const CACHE_TTL = 24 * 60 * 60 * 1000

function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`gtm_cache_${key}`)
    if (!raw) return null
    const { data, expiry } = JSON.parse(raw)
    if (Date.now() > expiry) { localStorage.removeItem(`gtm_cache_${key}`); return null }
    return data as T
  } catch { return null }
}

function setCache<T>(key: string, data: T): void {
  try { localStorage.setItem(`gtm_cache_${key}`, JSON.stringify({ data, expiry: Date.now() + CACHE_TTL })) } catch {}
}

export interface GtmetrixReport {
  id: string
  url: string
  grade: string
  performance_score: number
  structure_score: number
  lcp: number
  tbt: number
  cls: number
  fully_loaded_time: number
  page_bytes: number
  page_elements: number
  report_url: string
  source: 'gtmetrix'
}

export async function fetchGtmetrixReport(url: string): Promise<GtmetrixReport | null> {
  const cacheKey = `report_${url}`
  const cached = getCached<GtmetrixReport>(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch('/api/gtmetrix/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (!res.ok) throw new Error(`GTmetrix error: ${res.status}`)
    const json = await res.json()
    const attrs = json?.data?.attributes || {}

    const result: GtmetrixReport = {
      id: json?.data?.id || '',
      url,
      grade: attrs.gtmetrix_grade || 'N/A',
      performance_score: attrs.performance_score || 0,
      structure_score: attrs.structure_score || 0,
      lcp: attrs.largest_contentful_paint || 0,
      tbt: attrs.total_blocking_time || 0,
      cls: attrs.cumulative_layout_shift || 0,
      fully_loaded_time: attrs.fully_loaded_time || 0,
      page_bytes: attrs.page_bytes || 0,
      page_elements: attrs.page_elements || 0,
      report_url: attrs.report_url || '',
      source: 'gtmetrix',
    }

    setCache(cacheKey, result)
    return result
  } catch {
    return null
  }
}

export function clearGtmCache(): void {
  Object.keys(localStorage).filter(k => k.startsWith('gtm_cache_')).forEach(k => localStorage.removeItem(k))
}
