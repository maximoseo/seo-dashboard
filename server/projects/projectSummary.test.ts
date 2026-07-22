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

  it('never synthesizes health/counters/live for a durable supabase roster project without a measured spine', () => {
    const projects = buildProjectSummaries([
      { id: 'uuid-1', clientId: 'c1', clientName: 'NYG', name: 'NYG', domain: 'nyg.co.il', market: 'Israel', status: 'active', priority: 'high' },
    ], 'supabase')

    const p = projects[0]
    // P0 truth: no invented score, no live label, no fabricated counters.
    expect(p.healthScore).toBeNull()
    expect(typeof p.healthScore).not.toBe('number')
    expect(p.alertCount).toBe(0)
    expect(p.taskCount).toBe(0)
    expect(p.lastFetchedAt).toBeNull()
    expect(p.dataState).toBe('unavailable')
    // Modules must not claim live/cached without evidence; scaffolds stay planned.
    expect(p.modules.find(m => m.slug === 'overview')?.state).toBe('unavailable')
    expect(p.modules.find(m => m.slug === 'keywords')?.state).toBe('unavailable')
    expect(p.modules.find(m => m.slug === 'alerts')?.state).toBe('unavailable')
    expect(p.modules.find(m => m.slug === 'local-seo')?.state).toBe('planned')
    expect(p.modules.find(m => m.slug === 'geo-ai')?.state).toBe('planned')
  })

  it('marks a supabase project live only when a measured snapshot overlay is present', () => {
    const overlays = {
      'uuid-1': { healthScore: 71, alertCount: 2, taskCount: 3, lastFetchedAt: '2026-07-22T00:00:00.000Z', connectedSources: ['SEMrush', 'DataForSEO'] },
    }
    const projects = buildProjectSummaries([
      { id: 'uuid-1', clientId: 'c1', clientName: 'NYG', name: 'NYG', domain: 'nyg.co.il', market: 'Israel', status: 'active', priority: 'high' },
    ], 'supabase', overlays)

    const p = projects[0]
    expect(p.healthScore).toBe(71)
    expect(p.alertCount).toBe(2)
    expect(p.taskCount).toBe(3)
    expect(p.dataState).toBe('live')
    expect(p.lastFetchedAt).toBe('2026-07-22T00:00:00.000Z')
    expect(p.modules.find(m => m.slug === 'overview')?.state).toBe('live')
    expect(p.modules.find(m => m.slug === 'keywords')?.state).toBe('cached')
    expect(p.modules.find(m => m.slug === 'local-seo')?.state).toBe('planned')
  })
})
