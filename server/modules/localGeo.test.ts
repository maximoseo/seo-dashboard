import { describe, expect, it } from 'vitest'
import {
  buildGeoAiOverview,
  buildLocalSeoOverview,
  summarizeKeywordSerpSignals,
} from './localGeo.js'

describe('local + GEO modules', () => {
  it('summarizes AI Overview and local pack SERP flags', () => {
    const summary = summarizeKeywordSerpSignals([
      { keyword: 'עורך דין תל אביב', position: 3, serpFeatures: ['local_pack', 'ai_overview'] },
      { keyword: 'brand', position: 1, serpFeatures: [] },
    ])
    expect(summary.keywordsCount).toBe(2)
    expect(summary.aiOverviewCount).toBe(1)
    expect(summary.rankingLocalFeatures).toBe(1)
    expect(summary.topKeywords[0].keyword).toBe('brand')
  })

  it('marks IL local domains as chain-ready with partial depth', () => {
    const local = buildLocalSeoOverview({
      domain: 'mor-lawyers.co.il',
      market: 'Israel',
      snapshotMeta: {
        keywordsCount: 20,
        rankingLocalFeatures: 4,
        lastFetchedAt: '2026-07-13T00:00:00.000Z',
      },
    })
    expect(local.market.code).toBe('il')
    expect(local.dataState).toBe('partial')
    expect(local.readinessScore).toBeGreaterThan(0)
    expect(local.checks.some((c) => c.name === 'Local rank grid' && c.status === 'partial')).toBe(true)
  })

  it('scores GEO higher when AI Overview flags exist', () => {
    const geo = buildGeoAiOverview({
      domain: 'maximo-seo.ai',
      market: 'United States',
      snapshotMeta: {
        keywordsCount: 12,
        aiOverviewCount: 5,
        topKeywords: [{ keyword: 'seo agency', position: 4 }],
      },
    })
    expect(geo.checks.find((c) => c.name === 'AI Overview visibility')?.status).toBe('live')
    expect(geo.readinessScore).toBeGreaterThanOrEqual(60)
    expect(geo.checks.find((c) => c.name === 'llms.txt expectation')?.status).toBe('live')
  })
})
