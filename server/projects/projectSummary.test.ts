import { describe, expect, it } from 'vitest'
import { buildProjectSummaries, getProjectByDomain } from './projectSummary'

describe('project summary builders', () => {
  it('adds health, counters, module statuses and data state to seed projects', () => {
    const projects = buildProjectSummaries([
      { id: 'maximo', clientId: 'client-maximo', clientName: 'Maximo SEO', name: 'Maximo SEO', domain: 'maximo-seo.ai', market: 'Israel / Global', status: 'active', priority: 'primary' },
      { id: 'galoz', clientId: 'client-galoz', clientName: 'Galoz', name: 'Galoz', domain: 'galoz.co.il', market: 'Israel', status: 'ready', priority: 'high' },
    ], 'local-seed')

    expect(projects).toHaveLength(2)
    expect(projects[0]).toMatchObject({
      domain: 'maximo-seo.ai',
      dataState: 'cached',
      healthScore: expect.any(Number),
      alertCount: expect.any(Number),
      taskCount: expect.any(Number),
      connectedSources: expect.arrayContaining(['Rules Engine']),
    })
    expect(projects[0].modules.map(module => module.slug)).toContain('keywords')
    expect(projects[0].modules.map(module => module.slug)).toContain('geo-ai')
    expect(projects[0].modules.find(module => module.slug === 'local-seo')?.state).toBe('planned')
  })

  it('finds a project by decoded domain regardless of case', () => {
    const projects = buildProjectSummaries([
      { id: 'maximo', clientId: 'client-maximo', clientName: 'Maximo SEO', name: 'Maximo SEO', domain: 'maximo-seo.ai', market: 'Israel / Global', status: 'active', priority: 'primary' },
    ], 'local-seed')

    expect(getProjectByDomain(projects, 'MAXIMO-SEO.AI')?.id).toBe('maximo')
    expect(getProjectByDomain(projects, 'missing.co.il')).toBeNull()
  })

  it('does not invent alert/task counters for durable supabase portfolio missing overlays', () => {
    const projects = buildProjectSummaries([
      { id: 'uuid-1', clientId: 'c1', clientName: 'NYG', name: 'NYG', domain: 'nyg.co.il', market: 'Israel', status: 'active', priority: 'high' },
    ], 'supabase')

    expect(projects[0].alertCount).toBe(0)
    expect(projects[0].taskCount).toBe(0)
    expect(projects[0].dataState).toBe('live')
  })
})
