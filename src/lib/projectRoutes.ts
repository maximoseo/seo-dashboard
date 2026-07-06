import type { ProjectModuleSlug } from '@/types/project'

export type ProjectModule = Exclude<ProjectModuleSlug, 'overview'>

const legacyRouteByModule: Record<ProjectModule, string> = {
  keywords: '/keywords',
  backlinks: '/backlinks',
  pages: '/pages',
  vitals: '/vitals',
  alerts: '/alerts',
  competitors: '/competitors',
  content: '/content',
  'local-seo': '/local-seo',
  'geo-ai': '/geo-ai',
  tasks: '/tasks',
  reports: '/reports',
  settings: '/settings',
}

const moduleByLegacyRoute = Object.fromEntries(
  Object.entries(legacyRouteByModule).map(([module, route]) => [route, module]),
) as Record<string, ProjectModule>

export const projectModules = Object.keys(legacyRouteByModule) as ProjectModule[]

export function normalizeDomainParam(domainParam: string | undefined | null): string | null {
  if (!domainParam) return null
  try {
    return decodeURIComponent(domainParam)
  } catch {
    return domainParam
  }
}

export function buildProjectPath(domain: string, module?: ProjectModule | null): string {
  const encodedDomain = encodeURIComponent(domain)
  return module ? `/projects/${encodedDomain}/${module}` : `/projects/${encodedDomain}`
}

export function legacyRouteToProjectModule(pathname: string): ProjectModule | null {
  return moduleByLegacyRoute[pathname] ?? null
}

export function projectModuleToLegacyRoute(module: ProjectModule | null | undefined): string {
  return module ? legacyRouteByModule[module] : '/'
}

export function getDomainFromProjectPathname(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/?#]+)/)
  return normalizeDomainParam(match?.[1])
}

export function getModuleFromPathname(pathname: string): ProjectModule | null {
  const match = pathname.match(/^\/projects\/[^/]+(?:\/([^/?#]+))?/)
  const maybeModule = match?.[1]
  if (!maybeModule) return null
  return projectModules.includes(maybeModule as ProjectModule) ? (maybeModule as ProjectModule) : null
}
