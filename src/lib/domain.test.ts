import { describe, expect, it } from 'vitest'
import {
  assertPayloadDomain,
  brandStem,
  canonicalizeDomain,
  domainsEqual,
  hostBelongsToDomain,
  hostOf,
} from './domain'
import {
  filterBacklinkRowsForDomain,
  filterCompetitorRowsForDomain,
  filterKeywordRowsForDomain,
  filterPageRowsForDomain,
  isGiantCompetitor,
} from './dataIntegrity'

describe('canonicalizeDomain', () => {
  it('strips protocol, www, path and port', () => {
    expect(canonicalizeDomain('https://www.NYG.co.il/he/page?x=1')).toBe('nyg.co.il')
    expect(canonicalizeDomain('http://selanahari.co.il:443/')).toBe('selanahari.co.il')
    expect(canonicalizeDomain('www.yeziravaetz.co.il.')).toBe('yeziravaetz.co.il')
  })

  it('compares domains safely', () => {
    expect(domainsEqual('https://www.a.com', 'a.com')).toBe(true)
    expect(domainsEqual('a.com', 'b.com')).toBe(false)
    expect(domainsEqual('', 'a.com')).toBe(false)
  })

  it('detects host membership', () => {
    expect(hostOf('https://blog.nyg.co.il/x')).toBe('blog.nyg.co.il')
    expect(hostBelongsToDomain('https://blog.nyg.co.il/x', 'nyg.co.il')).toBe(true)
    expect(hostBelongsToDomain('https://evil.com', 'nyg.co.il')).toBe(false)
    expect(brandStem('nyg.co.il')).toBe('nyg')
  })
})

describe('assertPayloadDomain', () => {
  it('rejects foreign payloads', () => {
    const bad = assertPayloadDomain({ domain: 'other.com', normalized: [] }, 'nyg.co.il')
    expect(bad.ok).toBe(false)
  })
  it('accepts matching payloads', () => {
    const good = assertPayloadDomain({ domain: 'www.nyg.co.il', normalized: [] }, 'nyg.co.il')
    expect(good.ok).toBe(true)
  })
})

describe('row filters', () => {
  it('drops foreign keyword/page urls', () => {
    const kw = filterKeywordRowsForDomain(
      [
        { keyword: 'a', url: 'https://nyg.co.il/x' },
        { keyword: 'b', url: 'https://spam.com/y' },
        { keyword: 'c', url: '' },
      ],
      'nyg.co.il',
    )
    expect(kw.rows.map((r) => r.keyword)).toEqual(['a', 'c'])
    expect(kw.foreignDropped).toBe(1)

    const pages = filterPageRowsForDomain(
      [{ url: 'https://nyg.co.il/' }, { url: 'https://other.com/' }],
      'nyg.co.il',
    )
    expect(pages.rows).toHaveLength(1)
    expect(pages.foreignDropped).toBe(1)
  })

  it('filters backlinks to target domain and drops self', () => {
    const r = filterBacklinkRowsForDomain(
      [
        { domain_from: 'a.com', url_to: 'https://nyg.co.il/' },
        { domain_from: 'b.com', url_to: 'https://other.com/' },
        { domain_from: 'nyg.co.il', url_to: 'https://nyg.co.il/' },
      ],
      'nyg.co.il',
    )
    expect(r.rows).toHaveLength(1)
    expect(r.foreignDropped).toBe(1)
    expect(r.selfDropped).toBe(1)
  })

  it('drops giant competitors and self', () => {
    expect(isGiantCompetitor('facebook.com')).toBe(true)
    const r = filterCompetitorRowsForDomain(
      [
        { domain: 'facebook.com' },
        { domain: 'wikipedia.org' },
        { domain: 'nyg.co.il' },
        { domain: 'luxury-homes-il.com' },
      ],
      'nyg.co.il',
    )
    expect(r.rows.map((x) => x.domain)).toEqual(['luxury-homes-il.com'])
    expect(r.giantsDropped).toBe(2)
    expect(r.selfDropped).toBe(1)
  })
})
