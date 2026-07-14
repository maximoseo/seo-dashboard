import { describe, expect, it } from 'vitest'
import {
  buildProjectPath,
  getModuleFromPathname,
  legacyRouteToProjectModule,
  normalizeDomainParam,
  projectModuleToLegacyRoute,
} from './projectRoutes'

describe('project route helpers', () => {
  it('builds canonical project workspace paths with encoded domains', () => {
    expect(buildProjectPath('maximo-seo.ai')).toBe('/projects/maximo-seo.ai')
    expect(buildProjectPath('galoz.co.il', 'keywords')).toBe('/projects/galoz.co.il/keywords')
    expect(buildProjectPath('www.example.com/path', 'reports')).toBe('/projects/www.example.com%2Fpath/reports')
  })

  it('normalizes encoded route params back into domains', () => {
    expect(normalizeDomainParam('maximo-seo.ai')).toBe('maximo-seo.ai')
    expect(normalizeDomainParam('www.example.com%2Fpath')).toBe('www.example.com/path')
    expect(normalizeDomainParam(undefined)).toBe(null)
  })

  it('maps legacy module routes to project modules and back', () => {
    expect(legacyRouteToProjectModule('/keywords')).toBe('keywords')
    expect(legacyRouteToProjectModule('/local-seo')).toBe('local-seo')
    expect(legacyRouteToProjectModule('/')).toBe(null)
    expect(projectModuleToLegacyRoute('geo-ai')).toBe('/geo-ai')
    expect(projectModuleToLegacyRoute(null)).toBe('/')
  })

  it('extracts project module from nested project pathnames', () => {
    expect(getModuleFromPathname('/projects/maximo-seo.ai')).toBe(null)
    expect(getModuleFromPathname('/projects/maximo-seo.ai/tasks')).toBe('tasks')
    expect(getModuleFromPathname('/projects/galoz.co.il/geo-ai')).toBe('geo-ai')
    expect(getModuleFromPathname('/projects/galoz.co.il/site-audit')).toBe('site-audit')
    expect(legacyRouteToProjectModule('/site-audit')).toBe('site-audit')
    expect(getModuleFromPathname('/settings')).toBe(null)
  })
})
