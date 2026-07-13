import { describe, expect, it } from 'vitest'
import {
  competitorsFromSemrush,
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
})
