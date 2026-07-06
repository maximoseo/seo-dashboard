export type DataState = 'live' | 'cached' | 'loading' | 'demo' | 'unavailable' | 'unauthorized' | 'planned'
export type ProjectStatus = 'active' | 'ready' | 'planned' | 'paused' | 'archived'
export type ProjectPriority = 'primary' | 'high' | 'medium' | 'low'

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

export interface ProjectModuleSummary {
  slug: ProjectModuleSlug
  label: string
  state: DataState
  href: string
  description: string
}

export interface ProjectSummary {
  id: string
  clientId: string
  clientName: string
  name: string
  domain: string
  market: string
  status: ProjectStatus
  priority: ProjectPriority
  healthScore: number | null
  alertCount: number
  taskCount: number
  dataState: DataState
  connectedSources: string[]
  lastFetchedAt: string | null
  modules: ProjectModuleSummary[]
}

export interface ProjectListResponse {
  projects: ProjectSummary[]
  source: 'supabase' | 'local-seed' | 'fallback'
  fetchedAt: string
}

export interface ProjectResponse {
  project: ProjectSummary
  source: string
  fetchedAt: string
}

export interface ProjectSummaryResponse {
  domain: string
  project: ProjectSummary
  healthScore: number | null
  alertCount: number
  taskCount: number
  connectedSources: string[]
  modules: ProjectModuleSummary[]
  source: string
  fetchedAt: string
}
