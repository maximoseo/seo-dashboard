export type DataState = 'live' | 'cached' | 'loading' | 'demo' | 'unavailable' | 'unauthorized' | 'planned'
export type ProjectStatus = 'active' | 'ready' | 'planned' | 'paused' | 'archived'
export type ProjectPriority = 'primary' | 'high' | 'medium' | 'low'

export type SeedProject = {
  id: string
  clientId: string
  clientName: string
  name: string
  domain: string
  market: string
  status: ProjectStatus
  priority: ProjectPriority
  screenshotUrl?: string
}

export type ProjectModuleSlug =
  | 'overview'
  | 'keywords'
  | 'backlinks'
  | 'pages'
  | 'vitals'
  | 'alerts'
  | 'competitors'
  | 'content'
  | 'local-seo'
  | 'geo-ai'
  | 'tasks'
  | 'reports'
  | 'settings'

export type ProjectModuleSummary = {
  slug: ProjectModuleSlug
  label: string
  state: DataState
  href: string
  description: string
}

export type ProjectSummary = SeedProject & {
  healthScore: number | null
  alertCount: number
  taskCount: number
  dataState: DataState
  connectedSources: string[]
  lastFetchedAt: string | null
  modules: ProjectModuleSummary[]
  screenshotUrl?: string
}

const moduleDefinitions: Array<Omit<ProjectModuleSummary, 'href'>> = [
  { slug: 'overview', label: 'Overview', state: 'cached', description: 'Cross-module SEO health and next actions.' },
  { slug: 'keywords', label: 'Keywords', state: 'cached', description: 'Organic rankings, opportunities and keyword movement.' },
  { slug: 'backlinks', label: 'Backlinks', state: 'cached', description: 'Authority, referring domains and link risk.' },
  { slug: 'pages', label: 'Pages', state: 'cached', description: 'Technical SEO page inventory and priorities.' },
  { slug: 'vitals', label: 'Vitals', state: 'cached', description: 'Core Web Vitals and Lighthouse performance.' },
  { slug: 'alerts', label: 'Alerts', state: 'live', description: 'Rules engine anomalies and provider warnings.' },
  { slug: 'competitors', label: 'Competitors', state: 'cached', description: 'Competitive visibility and gap discovery.' },
  { slug: 'content', label: 'Content', state: 'cached', description: 'Content decay, competitive briefs and topic gaps.' },
  { slug: 'local-seo', label: 'Local SEO', state: 'planned', description: 'GBP, review velocity and NAP consistency.' },
  { slug: 'geo-ai', label: 'GEO / AI', state: 'planned', description: 'AI Overview visibility and entity readiness.' },
  { slug: 'tasks', label: 'Tasks / Agents', state: 'live', description: 'Implementation queue generated from SEO risks.' },
  { slug: 'reports', label: 'Reports', state: 'live', description: 'Client-ready markdown reports and exports.' },
  { slug: 'settings', label: 'Settings', state: 'live', description: 'Project connections and provider status.' },
]

function stableProjectScore(project: SeedProject): number {
  const base = project.status === 'active' ? 82 : project.status === 'ready' ? 72 : 55
  const priorityBoost = project.priority === 'primary' ? 6 : project.priority === 'high' ? 3 : 0
  const hash = [...project.domain].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 7
  return Math.min(98, base + priorityBoost + hash)
}

function stableCount(project: SeedProject, seed: number, max: number): number {
  const hash = [...`${project.domain}:${seed}`].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return hash % max
}

export type ProjectOverlayInput = {
  healthScore?: number | null
  alertCount?: number
  taskCount?: number
  lastFetchedAt?: string | null
  connectedSources?: string[]
  dataState?: DataState
}

export function buildProjectSummaries(
  seedProjects: SeedProject[],
  source: 'supabase' | 'local-seed' | 'fallback',
  overlays?: Map<string, ProjectOverlayInput> | Record<string, ProjectOverlayInput>,
): ProjectSummary[] {
  const fetchedAt = new Date().toISOString()
  const dataState: DataState = source === 'supabase' ? 'live' : 'cached'
  const getOverlay = (project: SeedProject): ProjectOverlayInput | undefined => {
    if (!overlays) return undefined
    if (overlays instanceof Map) {
      return overlays.get(project.id) || overlays.get(project.domain)
    }
    return overlays[project.id] || overlays[project.domain]
  }

  return seedProjects.map(project => {
    const overlay = getOverlay(project)
    const hasRealSpine = Boolean(overlay && (overlay.lastFetchedAt || overlay.healthScore != null || (overlay.alertCount ?? 0) > 0))
    return {
      ...project,
      healthScore: overlay?.healthScore ?? (hasRealSpine ? null : stableProjectScore(project)),
      alertCount: overlay?.alertCount ?? (hasRealSpine ? 0 : stableCount(project, 11, 6)),
      taskCount: overlay?.taskCount ?? (hasRealSpine ? 0 : stableCount(project, 17, 9) + 1),
      dataState: overlay?.dataState ?? dataState,
      connectedSources: overlay?.connectedSources?.length
        ? overlay.connectedSources
        : (source === 'supabase' ? ['Supabase roster'] : ['Rules Engine', 'SEMrush', 'DataForSEO', 'PageSpeed']),
      lastFetchedAt: overlay?.lastFetchedAt ?? (hasRealSpine ? null : fetchedAt),
      modules: moduleDefinitions.map(module => ({
        ...module,
        // Prefer live when durable snapshots exist for overview family.
        state: hasRealSpine && ['overview', 'alerts', 'tasks', 'reports', 'settings'].includes(module.slug)
          ? ('live' as DataState)
          : module.state,
        href: module.slug === 'overview'
          ? `/projects/${encodeURIComponent(project.domain)}`
          : `/projects/${encodeURIComponent(project.domain)}/${module.slug}`,
      })),
    }
  })
}

export function getProjectByDomain(projects: ProjectSummary[], domain: string | null | undefined): ProjectSummary | null {
  if (!domain) return null
  const normalized = domain.toLowerCase()
  return projects.find(project => project.domain.toLowerCase() === normalized) ?? null
}

export function summarizeProjectModules(project: ProjectSummary) {
  return {
    domain: project.domain,
    modules: project.modules,
    source: project.dataState,
    fetchedAt: project.lastFetchedAt,
  }
}
