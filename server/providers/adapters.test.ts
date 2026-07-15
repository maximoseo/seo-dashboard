import { describe, expect, it } from 'vitest'
import {
  competitorsFromSemrush,
  computeKeywordIntel,
  computeLinkIntel,
  buildKeywordGapMatrix,
  keywordsFromSemrush,
  mergeCompetitors,
  mergeKeywordRows,
  keywordMovements,
} from './adapters'

describe('provider adapters', () => {
  it('normalizes SEMrush keywords with movement', () => {
    const rows = keywordsFromSemrush([
      { Ph: 'מנעולן', Po: '3', Pp: '7', Nq: '1,200', Kd: '28', Ur: 'https://nyg.co.il/', Tr: '90' },
    ])
    expect(rows[0]).toMatchObject({ keyword: 'מנעולן', position: 3, previousPosition: 7, volume: 1200, trend: 'up', source: 'semrush' })
  })

  it('merges keyword sources without duplicates', () => {
    const merged = mergeKeywordRows([
      keywordsFromSemrush([{ Ph: 'a', Po: '2', Nq: '100' }]),
      [{ keyword: 'a', position: 5, previousPosition: null, volume: 200, difficulty: null, traffic: null, url: null, cpc: null, trend: null, source: 'ahrefs' }],
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].position).toBe(2)
    expect(merged[0].source).toContain('semrush')
  })

  it('merges competitor domains', () => {
    const rows = mergeCompetitors([
      competitorsFromSemrush([{ Domain: 'comp.co.il', Ot: '5000', Np: '40' }]),
      [{ domain: 'comp.co.il', commonKeywords: 12, traffic: null, competitionLevel: null, relevance: 0.5, topCountry: 'IL', source: 'exa' }],
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].traffic).toBe(5000)
    expect(rows[0].source).toContain('semrush')
  })

  it('buckets movements', () => {
    const m = keywordMovements([
      { keyword: 'x', position: 2, previousPosition: 5, volume: 10, difficulty: null, traffic: null, url: null, cpc: null, trend: 'up', source: 'semrush' },
      { keyword: 'y', position: 20, previousPosition: 8, volume: 10, difficulty: null, traffic: null, url: null, cpc: null, trend: 'down', source: 'semrush' },
    ])
    expect(m.improved).toHaveLength(1)
    expect(m.declined).toHaveLength(1)
  })

  it('builds Ahrefs-style keyword intel from real rows', () => {
    const intel = computeKeywordIntel([
      { keyword: 'near top', position: 12, previousPosition: 15, volume: 400, difficulty: 25, traffic: 12, url: 'https://a.example/a', cpc: 1.2, trend: 'up', source: 'semrush' },
      { keyword: 'near top', position: 14, previousPosition: null, volume: 400, difficulty: 25, traffic: 5, url: 'https://a.example/b', cpc: 1.2, trend: null, source: 'ahrefs' },
      { keyword: 'win', position: 5, previousPosition: 8, volume: 900, difficulty: 20, traffic: 80, url: 'https://a.example/a', cpc: 0.4, trend: 'up', source: 'semrush' },
      { keyword: 'deep', position: 70, previousPosition: 40, volume: 200, difficulty: 50, traffic: 1, url: 'https://a.example/c', cpc: 2.5, trend: 'down', source: 'dataforseo' },
    ])
    expect(intel.positionDistribution.find((b) => b.key === '11-20')?.count).toBe(2)
    expect(intel.opportunities.some((o) => o.kind === 'striking_distance')).toBe(true)
    expect(intel.cannibalization.some((c) => c.keyword === 'near top' && c.urls.length >= 2)).toBe(true)
    expect(intel.pageClusters[0].keywords).toBeGreaterThanOrEqual(1)
    expect(intel.kpis.top10).toBe(1)
  })

  it('builds real keyword gap matrix without inventing rows', () => {
    const matrix = buildKeywordGapMatrix(
      [{ keyword: 'shared', position: 12, previousPosition: null, volume: 100, difficulty: null, traffic: null, url: 'https://us/', cpc: 1, trend: null, source: 'us' }],
      [
        {
          competitor: 'comp.co.il',
          keywords: [
            { keyword: 'shared', position: 3, previousPosition: null, volume: 100, difficulty: null, traffic: 10, url: 'https://comp/', cpc: 1, trend: null, source: 'comp' },
            { keyword: 'missing term', position: 5, previousPosition: null, volume: 500, difficulty: 20, traffic: 40, url: 'https://comp/m', cpc: 2, trend: null, source: 'comp' },
          ],
        },
      ],
    )
    expect(matrix.summary.missing).toBe(1)
    expect(matrix.summary.outranked).toBe(1)
    expect(matrix.rows.some((r) => r.kind === 'missing' && r.keyword === 'missing term')).toBe(true)
  })

  it('builds link opportunities from quality inventory', () => {
    const intel = computeLinkIntel({
      domain: 'nyg.co.il',
      refdomains: [
        { domain: 'partner.co.il', rank: 45, backlinks: 1, quality: 'relevant', source: 'ahrefs' },
        { domain: 'spam-shop.shop', rank: 5, backlinks: 3, quality: 'spam', source: 'dataforseo' },
      ],
      normalizedLinks: [{ domain_from: 'authority.com', rank: 60, dofollow: false, quality: 'relevant', source: 'ahrefs' }],
    })
    expect(intel.opportunities.some((o) => o.kind === 'locale_authority')).toBe(true)
    expect(intel.opportunities.some((o) => o.kind === 'cleanup_spam')).toBe(true)
    expect(intel.summary.spam).toBe(1)
  })
})
