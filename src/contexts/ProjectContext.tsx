import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { fetchProjects } from '@/services/projectsApi'
import type { ProjectListResponse, ProjectSummary } from '@/types/project'
import {
  buildProjectPath,
  getDomainFromProjectPathname,
  getModuleFromPathname,
  legacyRouteToProjectModule,
  type ProjectModule,
} from '@/lib/projectRoutes'

interface ProjectContextData {
  activeDomain: string
  activeProject: ProjectSummary | null
  projects: ProjectSummary[]
  source: string | null
  fetchedAt: string | null
  loading: boolean
  error: string | null
  setActiveProject: (domain: string, options?: { preserveModule?: boolean; module?: ProjectModule | null }) => void
  refreshProjects: () => Promise<void>
}

const ProjectContext = createContext<ProjectContextData | null>(null)

function getStoredDomain(): string | null {
  try {
    return localStorage.getItem('maximo:activeDomain')
  } catch {
    return null
  }
}

function storeDomain(domain: string) {
  try {
    localStorage.setItem('maximo:activeDomain', domain)
  } catch {
    // Ignore storage failures in private browsing or locked-down contexts.
  }
}

function getQueryDomain(search: string): string | null {
  const value = new URLSearchParams(search).get('domain')
  return value || null
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const initialDomain = getDomainFromProjectPathname(location.pathname) || getQueryDomain(location.search) || getStoredDomain() || ''
  const [activeDomain, setActiveDomain] = useState(initialDomain)
  const [projectList, setProjectList] = useState<ProjectListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestSeq = useRef(0)

  const refreshProjects = useCallback(async () => {
    const requestId = requestSeq.current + 1
    requestSeq.current = requestId
    setLoading(true)
    setError(null)
    try {
      const data = await fetchProjects()
      if (requestSeq.current === requestId) {
        setProjectList(data)
      }
    } catch (e) {
      if (requestSeq.current === requestId) {
        setError(e instanceof Error ? e.message : 'Project list unavailable')
      }
    } finally {
      if (requestSeq.current === requestId) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    refreshProjects()
  }, [refreshProjects])

  useEffect(() => {
    const domainFromRoute = getDomainFromProjectPathname(location.pathname)
    const domainFromQuery = getQueryDomain(location.search)
    const nextDomain = domainFromRoute || domainFromQuery
    if (nextDomain && nextDomain !== activeDomain) {
      setActiveDomain(nextDomain)
      storeDomain(nextDomain)
    }
  }, [activeDomain, location.pathname, location.search])

  const projects = projectList?.projects ?? []

  // Prefer route domain → stored → first portfolio project. Never invent a domain
  // that is not in the user's portfolio (e.g. maximo-seo.ai system stub).
  useEffect(() => {
    if (!projectList) return
    const routeDomain = getDomainFromProjectPathname(location.pathname)
    if (routeDomain) return
    if (activeDomain && projects.some(p => (p.domain || '').toLowerCase() === activeDomain.toLowerCase())) {
      return
    }
    const fallback = projects[0]?.domain
    if (fallback) {
      setActiveDomain(fallback)
      storeDomain(fallback)
    }
  }, [activeDomain, location.pathname, projectList, projects])

  const activeProject = useMemo(() => {
    if (!activeDomain) return null
    const needle = activeDomain.toLowerCase()
    return projects.find(project => (project.domain || '').toLowerCase() === needle) ?? null
  }, [activeDomain, projects])

  const setActiveProject = useCallback((domain: string, options: { preserveModule?: boolean; module?: ProjectModule | null } = {}) => {
    const module = options.module !== undefined
      ? options.module
      : options.preserveModule
        ? getModuleFromPathname(location.pathname) || legacyRouteToProjectModule(location.pathname)
        : null
    setActiveDomain(domain)
    storeDomain(domain)
    navigate(buildProjectPath(domain, module))
  }, [location.pathname, navigate])

  const value = useMemo<ProjectContextData>(() => ({
    activeDomain: activeProject?.domain || activeDomain || projects[0]?.domain || '',
    activeProject,
    projects,
    source: projectList?.source ?? null,
    fetchedAt: projectList?.fetchedAt ?? null,
    loading,
    error,
    setActiveProject,
    refreshProjects,
  }), [activeDomain, activeProject, error, loading, projectList?.fetchedAt, projectList?.source, projects, refreshProjects, setActiveProject])

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export function useProject() {
  const context = useContext(ProjectContext)
  if (!context) throw new Error('useProject must be used within ProjectProvider')
  return context
}
