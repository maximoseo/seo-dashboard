import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { fetchProjects } from '@/services/projectsApi'
import type { ProjectListResponse, ProjectSummary } from '@/types/project'
import {
  buildProjectPath,
  getDomainFromProjectPathname,
  getModuleFromPathname,
  legacyRouteToProjectModule,
  type ProjectModule,
} from '@/lib/projectRoutes'
import { canonicalizeDomain, domainsEqual } from '@/lib/domain'

interface ProjectContextData {
  activeDomain: string
  activeProject: ProjectSummary | null
  projects: ProjectSummary[]
  source: string | null
  fetchedAt: string | null
  loading: boolean
  error: string | null
  workspaceEpoch: number
  setActiveProject: (domain: string, options?: { preserveModule?: boolean; module?: ProjectModule | null }) => void
  refreshProjects: () => Promise<void>
}

const ProjectContext = createContext<ProjectContextData | null>(null)

function getStoredDomain(): string | null {
  try {
    const raw = localStorage.getItem('maximo:activeDomain')
    return canonicalizeDomain(raw) || null
  } catch {
    return null
  }
}

function storeDomain(domain: string) {
  try {
    const clean = canonicalizeDomain(domain)
    if (clean) localStorage.setItem('maximo:activeDomain', clean)
  } catch {
    // Ignore storage failures in private browsing or locked-down contexts.
  }
}

function getQueryDomain(search: string): string | null {
  const value = new URLSearchParams(search).get('domain')
  return canonicalizeDomain(value) || null
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const initialDomain =
    canonicalizeDomain(getDomainFromProjectPathname(location.pathname)) ||
    getQueryDomain(location.search) ||
    getStoredDomain() ||
    ''
  const [activeDomain, setActiveDomain] = useState(initialDomain)
  const [projectList, setProjectList] = useState<ProjectListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workspaceEpoch, setWorkspaceEpoch] = useState(0)
  const requestSeq = useRef(0)

  const hardSwitchDomain = useCallback((nextRaw: string) => {
    const next = canonicalizeDomain(nextRaw)
    setActiveDomain((prev) => {
      if (domainsEqual(prev, next)) return canonicalizeDomain(prev) || next
      // Invalidate ALL module caches that don't belong to the new domain — prevent bleed.
      queryClient.cancelQueries()
      queryClient.removeQueries({
        predicate: (q) => {
          const key = q.queryKey as unknown[]
          const keyDomain = typeof key[1] === 'string' ? canonicalizeDomain(String(key[1])) : ''
          // Keep portfolio-level queries without domain slot; drop foreign domain slots.
          return Boolean(keyDomain && keyDomain !== next)
        },
      })
      setWorkspaceEpoch((e) => e + 1)
      return next
    })
    if (next) storeDomain(next)
  }, [queryClient])

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
    const domainFromRoute = canonicalizeDomain(getDomainFromProjectPathname(location.pathname))
    const domainFromQuery = getQueryDomain(location.search)
    const nextDomain = domainFromRoute || domainFromQuery
    if (nextDomain && !domainsEqual(nextDomain, activeDomain)) {
      hardSwitchDomain(nextDomain)
    }
  }, [activeDomain, hardSwitchDomain, location.pathname, location.search])

  const projects = projectList?.projects ?? []

  // Prefer route domain → stored domain if it belongs to portfolio.
  // NEVER silently fall back to projects[0] while a route/query domain intent exists.
  // Only bootstrap first portfolio domain when nothing is selected yet (empty workspace).
  useEffect(() => {
    if (!projectList) return
    const routeDomain = canonicalizeDomain(getDomainFromProjectPathname(location.pathname))
    if (routeDomain) return
    if (activeDomain && projects.some(p => domainsEqual(p.domain, activeDomain))) {
      return
    }
    // If user has a stored domain not in portfolio, clear it — don't invent another site.
    if (activeDomain && projects.length && !projects.some(p => domainsEqual(p.domain, activeDomain))) {
      hardSwitchDomain('')
      return
    }
    if (!activeDomain && projects[0]?.domain) {
      hardSwitchDomain(projects[0].domain)
    }
  }, [activeDomain, hardSwitchDomain, location.pathname, projectList, projects])

  const activeProject = useMemo(() => {
    if (!activeDomain) return null
    return projects.find(project => domainsEqual(project.domain, activeDomain)) ?? null
  }, [activeDomain, projects])

  const setActiveProject = useCallback((domain: string, options: { preserveModule?: boolean; module?: ProjectModule | null } = {}) => {
    const clean = canonicalizeDomain(domain)
    const module = options.module !== undefined
      ? options.module
      : options.preserveModule
        ? getModuleFromPathname(location.pathname) || legacyRouteToProjectModule(location.pathname)
        : null
    hardSwitchDomain(clean)
    if (clean) navigate(buildProjectPath(clean, module))
    else navigate('/projects')
  }, [hardSwitchDomain, location.pathname, navigate])

  const value = useMemo<ProjectContextData>(() => ({
    // Never fall through to projects[0] when activeDomain intentionally empty.
    activeDomain: activeProject?.domain
      ? canonicalizeDomain(activeProject.domain)
      : canonicalizeDomain(activeDomain),
    activeProject,
    projects,
    source: projectList?.source ?? null,
    fetchedAt: projectList?.fetchedAt ?? null,
    loading,
    error,
    workspaceEpoch,
    setActiveProject,
    refreshProjects,
  }), [activeDomain, activeProject, error, loading, projectList?.fetchedAt, projectList?.source, projects, refreshProjects, setActiveProject, workspaceEpoch])

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export function useProject() {
  const context = useContext(ProjectContext)
  if (!context) throw new Error('useProject must be used within ProjectProvider')
  return context
}
