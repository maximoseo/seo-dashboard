import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { fetchOverview, fetchApiHealth, type OverviewData, type ApiHealthStatus } from '@/services/seoApi'

interface SEOContextData {
  domain: string
  setDomain: (d: string) => void
  overview: OverviewData | null
  overviewLoading: boolean
  overviewError: string | null
  apiHealth: ApiHealthStatus | null
  healthLoading: boolean
  refresh: () => void
  refreshHealth: () => void
}

const SEOContext = createContext<SEOContextData>({
  domain: 'maximo-seo.ai',
  setDomain: () => {},
  overview: null,
  overviewLoading: false,
  overviewError: null,
  apiHealth: null,
  healthLoading: false,
  refresh: () => {},
  refreshHealth: () => {},
})

export function useSEO() {
  return useContext(SEOContext)
}

export function SEOProvider({ children }: { children: ReactNode }) {
  const [domain, setDomain] = useState('maximo-seo.ai')
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [apiHealth, setApiHealth] = useState<ApiHealthStatus | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true)
    setOverviewError(null)
    try {
      const data = await fetchOverview(domain)
      setOverview(data)
    } catch (e) {
      setOverviewError(e instanceof Error ? e.message : 'Failed to load overview')
    } finally {
      setOverviewLoading(false)
    }
  }, [domain])

  const loadHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      const data = await fetchApiHealth()
      setApiHealth(data)
    } catch {
      // health check failed silently
    } finally {
      setHealthLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOverview()
  }, [loadOverview])

  return (
    <SEOContext.Provider value={{
      domain,
      setDomain,
      overview,
      overviewLoading,
      overviewError,
      apiHealth,
      healthLoading,
      refresh: loadOverview,
      refreshHealth: loadHealth,
    }}>
      {children}
    </SEOContext.Provider>
  )
}
