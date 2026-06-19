// Frontend service for PageSpeed Insights — calls Express backend
const CACHE_TTL = 24 * 60 * 60 * 1000

function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`psi_cache_${key}`)
    if (!raw) return null
    const { data, expiry } = JSON.parse(raw)
    if (Date.now() > expiry) { localStorage.removeItem(`psi_cache_${key}`); return null }
    return data as T
  } catch { return null }
}

function setCache<T>(key: string, data: T): void {
  try { localStorage.setItem(`psi_cache_${key}`, JSON.stringify({ data, expiry: Date.now() + CACHE_TTL })) } catch {}
}

export interface PageSpeedMetrics {
  performance_score: number
  accessibility_score: number
  best_practices_score: number
  seo_score: number
  fcp: number
  lcp: number
  tbt: number
  cls: number
  si: number
  tti: number
  fcp_display: string
  lcp_display: string
  tbt_display: string
  cls_display: string
  si_display: string
  tti_display: string
}

export interface CruxMetrics {
  lcp_ms: number
  lcp_category: string
  fid_ms: number
  fid_category: string
  inp_ms: number
  inp_category: string
  cls_score: number
  cls_category: string
  fcp_ms: number
  fcp_category: string
  ttfb_ms: number
  ttfb_category: string
  overall_category: string
}

export interface PageSpeedResult {
  url: string
  strategy: 'mobile' | 'desktop'
  lighthouse: PageSpeedMetrics
  crux: CruxMetrics | null
  timestamp: string
  source: 'pagespeed'
}

function extractCrux(exp: any): CruxMetrics | null {
  if (!exp?.metrics) return null
  const m = exp.metrics
  const get = (key: string) => ({
    val: m[key]?.percentile ?? 0,
    cat: m[key]?.category ?? 'N/A',
  })
  const lcp = get('LARGEST_CONTENTFUL_PAINT_MS')
  const fid = get('FIRST_INPUT_DELAY_MS')
  const inp = get('INTERACTION_TO_NEXT_PAINT')
  const cls = get('CUMULATIVE_LAYOUT_SHIFT_SCORE')
  const fcp = get('FIRST_CONTENTFUL_PAINT_MS')
  const ttfb = get('EXPERIMENTAL_TIME_TO_FIRST_BYTE')
  return {
    lcp_ms: lcp.val, lcp_category: lcp.cat,
    fid_ms: fid.val, fid_category: fid.cat,
    inp_ms: inp.val, inp_category: inp.cat,
    cls_score: cls.val / 100, cls_category: cls.cat,
    fcp_ms: fcp.val, fcp_category: fcp.cat,
    ttfb_ms: ttfb.val, ttfb_category: ttfb.cat,
    overall_category: exp.overall_category || 'N/A',
  }
}

export async function fetchPageSpeed(url: string, strategy: 'mobile' | 'desktop' = 'desktop'): Promise<PageSpeedResult | null> {
  const cacheKey = `${url}_${strategy}`
  const cached = getCached<PageSpeedResult>(cacheKey)
  if (cached) return cached

  try {
    const apiUrl = `/api/pagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}`
    const res = await fetch(apiUrl)
    if (!res.ok) throw new Error(`PageSpeed error: ${res.status}`)
    const json = await res.json()

    const lh = json.lighthouseResult
    const audits = lh?.audits || {}
    const cats = lh?.categories || {}

    const result: PageSpeedResult = {
      url,
      strategy,
      lighthouse: {
        performance_score: Math.round((cats.performance?.score || 0) * 100),
        accessibility_score: Math.round((cats.accessibility?.score || 0) * 100),
        best_practices_score: Math.round((cats['best-practices']?.score || 0) * 100),
        seo_score: Math.round((cats.seo?.score || 0) * 100),
        fcp: audits['first-contentful-paint']?.numericValue || 0,
        lcp: audits['largest-contentful-paint']?.numericValue || 0,
        tbt: audits['total-blocking-time']?.numericValue || 0,
        cls: audits['cumulative-layout-shift']?.numericValue || 0,
        si: audits['speed-index']?.numericValue || 0,
        tti: audits['interactive']?.numericValue || 0,
        fcp_display: audits['first-contentful-paint']?.displayValue || '',
        lcp_display: audits['largest-contentful-paint']?.displayValue || '',
        tbt_display: audits['total-blocking-time']?.displayValue || '',
        cls_display: audits['cumulative-layout-shift']?.displayValue || '',
        si_display: audits['speed-index']?.displayValue || '',
        tti_display: audits['interactive']?.displayValue || '',
      },
      crux: extractCrux(json.loadingExperience),
      timestamp: json.analysisUTCTimestamp || new Date().toISOString(),
      source: 'pagespeed',
    }

    setCache(cacheKey, result)
    return result
  } catch {
    return null
  }
}

export function clearPsiCache(): void {
  Object.keys(localStorage).filter(k => k.startsWith('psi_cache_')).forEach(k => localStorage.removeItem(k))
}
