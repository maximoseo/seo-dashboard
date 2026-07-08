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
  lastFetchedAt: string
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

export function buildProjectSummaries(seedProjects: SeedProject[], source: 'supabase' | 'local-seed' | 'fallback'): ProjectSummary[] {
  const fetchedAt = new Date().toISOString()
  const dataState: DataState = source === 'supabase' ? 'live' : 'cached'

  return seedProjects.map(project => ({
    ...project,
    healthScore: stableProjectScore(project),
    alertCount: stableCount(project, 11, 6),
    taskCount: stableCount(project, 17, 9) + 1,
    dataState,
    connectedSources: ['Rules Engine', 'SEMrush', 'DataForSEO', 'PageSpeed'],
    lastFetchedAt: fetchedAt,
    modules: moduleDefinitions.map(module => ({
      ...module,
      href: module.slug === 'overview'
        ? `/projects/${encodeURIComponent(project.domain)}`
        : `/projects/${encodeURIComponent(project.domain)}/${module.slug}`,
    })),
  }))
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
