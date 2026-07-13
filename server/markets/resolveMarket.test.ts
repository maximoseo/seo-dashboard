import { describe, expect, it } from 'vitest'
import { resolveMarket, serankingResearchUrl } from './resolveMarket'

describe('resolveMarket', () => {
  it('defaults .co.il domains to Israel pack', () => {
    const m = resolveMarket({ domain: 'nyg.co.il' })
    expect(m.code).toBe('il')
    expect(m.semrushDatabase).toBe('il')
    expect(m.dfsLocationCode).toBe(2376)
  })

  it('honors explicit IL market labels', () => {
    const m = resolveMarket({ market: 'Israel / Global', domain: 'maximo-seo.ai' })
    expect(m.code).toBe('il')
  })

  it('supports US override', () => {
    const m = resolveMarket({ domain: 'nyg.co.il', override: 'us' })
    expect(m.code).toBe('us')
    expect(m.dfsLocationCode).toBe(2840)
  })

  it('builds regional SE Ranking research URLs', () => {
    expect(serankingResearchUrl(resolveMarket({ domain: 'galoz.co.il' }), 'competitors')).toContain('/research/il/competitors/')
  })
})
