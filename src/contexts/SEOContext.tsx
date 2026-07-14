import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { fetchOverview, fetchApiHealth, type OverviewData, type ApiHealthStatus } from '@/services/seoApi'
import { useProject } from '@/contexts/ProjectContext'
import { canonicalizeDomain } from '@/lib/domain'

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
  domain: '',
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
  const { activeDomain, activeProject, setActiveProject, workspaceEpoch } = useProject()
  // Bound to the open project / portfolio domain — never invent a stub domain.
  const domain = canonicalizeDomain(activeDomain || activeProject?.domain || '')
  const market = activeProject?.market || null
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [apiHealth, setApiHealth] = useState<ApiHealthStatus | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)

  // Hard reset overview when domain/workspace changes — prevent painting previous site KPIs
  useEffect(() => {
    setOverview(null)
    setOverviewError(null)
  }, [domain, workspaceEpoch])

  const loadOverview = useCallback(async () => {
    if (!domain) {
      setOverview(null)
      setOverviewLoading(false)
      setOverviewError(null)
      return
    }
    setOverviewLoading(true)
    setOverviewError(null)
    try {
      const data = await fetchOverview(domain, market)
      // Drop late responses for a previous domain
      const claimed = canonicalizeDomain((data as any)?.domain)
      if (claimed && claimed !== domain) {
        setOverview(null)
        setOverviewError(`Overview domain mismatch (${claimed})`)
        return
      }
      setOverview(data)
    } catch (e) {
      setOverviewError(e instanceof Error ? e.message : 'Failed to load overview')
    } finally {
      setOverviewLoading(false)
    }
  }, [domain, market])

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

  const setDomain = useCallback((d: string) => {
    setActiveProject(d, { preserveModule: true })
  }, [setActiveProject])

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
