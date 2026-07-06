import { describe, expect, it } from 'vitest'
import { formatMetric, normalizeAhrefs, normalizeDataForSEOKeywords, normalizeSemrush, num } from './normalize'

describe('normalization helpers', () => {
  it('distinguishes missing numbers from real zeros', () => {
    expect(num(null)).toBeNull()
    expect(num('')).toBe(0)
    expect(num('1,234')).toBe(1234)
    expect(num('not-a-number')).toBeNull()
  })

  it('normalizes SEMrush compact keys', () => {
    const result = normalizeSemrush({ Or: '1,247', Ot: '45,200', Rk: '123' })
    expect(result.organicKeywords).toBe(1247)
    expect(result.organicTraffic).toBe(45200)
    expect(result.domainRank).toBe(123)
  })

  it('normalizes Ahrefs nested metrics', () => {
    const result = normalizeAhrefs({ domain_rating: { rating: 62 }, metrics: { org_traffic: 45200, refdomains: 847 } })
    expect(result.domainRating).toBe(62)
    expect(result.organicTraffic).toBe(45200)
    expect(result.refDomains).toBe(847)
  })

  it('normalizes DataForSEO keyword tasks safely', () => {
    const rows = normalizeDataForSEOKeywords({ tasks: [{ result: [{ items: [{ keyword: 'seo agency', rank: 4, search_volume: '500' }] }] }] })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ keyword: 'seo agency', position: 4, volume: 500, source: 'dataforseo' })
  })

  it('formats metrics for cards', () => {
    expect(formatMetric(null)).toBe('—')
    expect(formatMetric(999)).toBe('999')
    expect(formatMetric(12500)).toBe('12.5K')
  })
})
