import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  fetchDomainRating,
  fetchSiteMetrics,
  fetchBacklinksStats,
  fetchOrganicKeywords,
  fetchRefDomains,
  getToday,
  type DomainRating,
  type SiteMetrics,
  type BacklinksStats,
  type OrganicKeyword,
  type RefDomain,
} from '@/services/ahrefsApi'
import { fetchDomainOverview, type SemrushDomainOverview } from '@/services/semrushApi'
import { fetchPageSpeed, type PageSpeedResult } from '@/services/pagespeedApi'
import { useProject } from '@/contexts/ProjectContext'

interface AhrefsData {
  loading: boolean
  error: string | null
  domainRating: DomainRating | null
  siteMetrics: SiteMetrics | null
  backlinksStats: BacklinksStats | null
  organicKeywords: OrganicKeyword[]
  refDomains: RefDomain[]
  semrushOverview: SemrushDomainOverview | null
  pagespeedDesktop: PageSpeedResult | null
  pagespeedMobile: PageSpeedResult | null
  activeSources: string[]
  target: string
  setTarget: (t: string) => void
  refresh: () => void
}

const AhrefsContext = createContext<AhrefsData>({
  loading: false,
  error: null,
  domainRating: null,
  siteMetrics: null,
  backlinksStats: null,
  organicKeywords: [],
  refDomains: [],
  semrushOverview: null,
  pagespeedDesktop: null,
  pagespeedMobile: null,
  activeSources: [],
  target: 'maximo-seo.ai',
  setTarget: () => {},
  refresh: () => {},
})

export function useAhrefs() {
  return useContext(AhrefsContext)
}

export function AhrefsProvider({ children }: { children: ReactNode }) {
  const { activeDomain, activeProject } = useProject()
  const target = activeDomain || 'maximo-seo.ai'
  const market = activeProject?.market || null
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [domainRating, setDomainRating] = useState<DomainRating | null>(null)
  const [siteMetrics, setSiteMetrics] = useState<SiteMetrics | null>(null)
  const [backlinksStats, setBacklinksStats] = useState<BacklinksStats | null>(null)
  const [organicKeywords, setOrganicKeywords] = useState<OrganicKeyword[]>([])
  const [refDomains, setRefDomains] = useState<RefDomain[]>([])
  const [semrushOverview, setSemrushOverview] = useState<SemrushDomainOverview | null>(null)
  const [pagespeedDesktop, setPagespeedDesktop] = useState<PageSpeedResult | null>(null)
  const [pagespeedMobile, setPagespeedMobile] = useState<PageSpeedResult | null>(null)
  const [activeSources, setActiveSources] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      setLoading(true)
      setError(null)
      const date = getToday()
      const sources: string[] = []

      try {
        const results = await Promise.allSettled([
          fetchDomainRating(target, date),
          fetchSiteMetrics(target, date),
          fetchBacklinksStats(target),
          fetchOrganicKeywords(target, date, 50),
          fetchRefDomains(target, 20),
          fetchDomainOverview(target, market),
          fetchPageSpeed(`https://${target}`, 'desktop'),
          fetchPageSpeed(`https://${target}`, 'mobile'),
        ])

        if (cancelled) return

        const [dr, metrics, blStats, keywords, domains, semOv, psiD, psiM] = results

        if (dr.status === 'fulfilled') { setDomainRating(dr.value); sources.push('Ahrefs') }
        if (metrics.status === 'fulfilled') setSiteMetrics(metrics.value)
        if (blStats.status === 'fulfilled') setBacklinksStats(blStats.value)
        if (keywords.status === 'fulfilled') setOrganicKeywords(keywords.value)
        if (domains.status === 'fulfilled') setRefDomains(domains.value)
        if (semOv.status === 'fulfilled' && semOv.value) { setSemrushOverview(semOv.value); sources.push('SEMrush') }
        if (psiD.status === 'fulfilled' && psiD.value) { setPagespeedDesktop(psiD.value); sources.push('PageSpeed') }
        if (psiM.status === 'fulfilled') setPagespeedMobile(psiM.value)

        setActiveSources([...new Set(sources)])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [target, market])

  const refresh = async () => {
    setLoading(true)
    setError(null)
    const date = getToday()
    const sources: string[] = []

    try {
      const results = await Promise.allSettled([
        fetchDomainRating(target, date),
        fetchSiteMetrics(target, date),
        fetchBacklinksStats(target),
        fetchOrganicKeywords(target, date, 50),
        fetchRefDomains(target, 20),
        fetchDomainOverview(target, market),
        fetchPageSpeed(`https://${target}`, 'desktop'),
        fetchPageSpeed(`https://${target}`, 'mobile'),
      ])

      const [dr, metrics, blStats, keywords, domains, semOv, psiD, psiM] = results

      if (dr.status === 'fulfilled') { setDomainRating(dr.value); sources.push('Ahrefs') }
      if (metrics.status === 'fulfilled') setSiteMetrics(metrics.value)
      if (blStats.status === 'fulfilled') setBacklinksStats(blStats.value)
      if (keywords.status === 'fulfilled') setOrganicKeywords(keywords.value)
      if (domains.status === 'fulfilled') setRefDomains(domains.value)
      if (semOv.status === 'fulfilled' && semOv.value) { setSemrushOverview(semOv.value); sources.push('SEMrush') }
      if (psiD.status === 'fulfilled' && psiD.value) { setPagespeedDesktop(psiD.value); sources.push('PageSpeed') }
      if (psiM.status === 'fulfilled') setPagespeedMobile(psiM.value)

      setActiveSources([...new Set(sources)])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AhrefsContext.Provider
      value={{
        loading, error,
        domainRating, siteMetrics, backlinksStats, organicKeywords, refDomains,
        semrushOverview, pagespeedDesktop, pagespeedMobile,
        activeSources, target, setTarget: () => {}, refresh,
      }}
    >
      {children}
    </AhrefsContext.Provider>
  )
}
