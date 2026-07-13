// Unified SEO data aggregator — combines all API sources
import { fetchDomainRating, fetchSiteMetrics, getToday } from './ahrefsApi'
import { fetchDomainOverview as fetchSemrushOverview } from './semrushApi'
import { fetchPageSpeed } from './pagespeedApi'
import { fetchDomainSummary } from './dataForSeoApi'

export interface UnifiedOverview {
  sources: string[]
  ahrefs: { domainRating: number; organicTraffic: number; organicKeywords: number } | null
  semrush: { rank: number; organicKeywords: number; organicTraffic: number; organicCost: number } | null
  pagespeed: { performance: number; accessibility: number; seo: number; bestPractices: number } | null
  dataforseo: { backlinks: number; refDomains: number; rank: number } | null
  timestamp: string
}

export async function fetchUnifiedOverview(domain: string, market?: string | null): Promise<UnifiedOverview> {
  const date = getToday()
  const sources: string[] = []
  const result: UnifiedOverview = {
    sources: [],
    ahrefs: null,
    semrush: null,
    pagespeed: null,
    dataforseo: null,
    timestamp: new Date().toISOString(),
  }

  const [ahrefsDR, ahrefsMetrics, semOverview, psiDesktop, dfsSummary] = await Promise.allSettled([
    fetchDomainRating(domain, date),
    fetchSiteMetrics(domain, date),
    fetchSemrushOverview(domain, market),
    fetchPageSpeed(`https://${domain}`, 'desktop'),
    fetchDomainSummary(domain),
  ])

  if (ahrefsDR.status === 'fulfilled' && ahrefsMetrics.status === 'fulfilled') {
    const dr = ahrefsDR.value
    const m = ahrefsMetrics.value
    if (dr.domain_rating > 0) {
      result.ahrefs = {
        domainRating: dr.domain_rating,
        organicTraffic: m.org_traffic || 0,
        organicKeywords: m.org_keywords || 0,
      }
      sources.push('Ahrefs')
    }
  }

  if (semOverview.status === 'fulfilled' && semOverview.value) {
    result.semrush = {
      rank: semOverview.value.rank,
      organicKeywords: semOverview.value.organic_keywords,
      organicTraffic: semOverview.value.organic_traffic,
      organicCost: semOverview.value.organic_cost,
    }
    sources.push('SEMrush')
  }

  if (psiDesktop.status === 'fulfilled' && psiDesktop.value) {
    result.pagespeed = {
      performance: psiDesktop.value.lighthouse.performance_score,
      accessibility: psiDesktop.value.lighthouse.accessibility_score,
      seo: psiDesktop.value.lighthouse.seo_score,
      bestPractices: psiDesktop.value.lighthouse.best_practices_score,
    }
    sources.push('PageSpeed')
  }

  if (dfsSummary.status === 'fulfilled' && dfsSummary.value) {
    result.dataforseo = {
      backlinks: dfsSummary.value.backlinks,
      refDomains: dfsSummary.value.referring_domains,
      rank: dfsSummary.value.rank,
    }
    sources.push('DataForSEO')
  }

  result.sources = sources
  return result
}

export function clearAllCaches(): void {
  const prefixes = ['ahrefs_cache_', 'dfs_cache_', 'sem_cache_', 'psi_cache_', 'gtm_cache_', 'seo_cache_']
  Object.keys(localStorage)
    .filter(k => prefixes.some(p => k.startsWith(p)))
    .forEach(k => localStorage.removeItem(k))
}
