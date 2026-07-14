/**
 * Client-side row integrity filters — defense in depth if a stale/foreign payload slips through.
 */
import { brandStem, canonicalizeDomain, hostBelongsToDomain, hostOf } from '@/lib/domain'

export const COMPETITOR_GIANT_DENYLIST = new Set([
  'facebook.com',
  'fb.com',
  'instagram.com',
  'wikipedia.org',
  'youtube.com',
  'youtu.be',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'tiktok.com',
  'google.com',
  'google.co.il',
  'apple.com',
  'amazon.com',
  'amazon.co.uk',
  'microsoft.com',
  'bing.com',
  'yahoo.com',
  'reddit.com',
  'pinterest.com',
  'whatsapp.com',
  't.me',
  'telegram.org',
  'play.google.com',
  'apps.apple.com',
  'maps.google.com',
  'goo.gl',
  'bit.ly',
  'wix.com',
  'wordpress.com',
  'blogger.com',
  'medium.com',
  'ebay.com',
  'etsy.com',
  'netflix.com',
  'spotify.com',
])

export function isGiantCompetitor(domain?: string | null): boolean {
  const d = canonicalizeDomain(domain)
  if (!d) return true
  if (COMPETITOR_GIANT_DENYLIST.has(d)) return true
  for (const giant of COMPETITOR_GIANT_DENYLIST) {
    if (d === giant || d.endsWith(`.${giant}`)) return true
  }
  return false
}

export function filterKeywordRowsForDomain<T extends { url?: string; keyword?: string }>(
  rows: T[] | undefined,
  domain: string,
): { rows: T[]; foreignDropped: number } {
  if (!Array.isArray(rows) || !rows.length) return { rows: [], foreignDropped: 0 }
  const d = canonicalizeDomain(domain)
  let foreignDropped = 0
  const next: T[] = []
  for (const row of rows) {
    const url = row.url || ''
    if (url && !hostBelongsToDomain(url, d)) {
      foreignDropped += 1
      continue
    }
    next.push(row)
  }
  return { rows: next, foreignDropped }
}

export function filterPageRowsForDomain<T extends { url?: string }>(
  rows: T[] | undefined,
  domain: string,
): { rows: T[]; foreignDropped: number } {
  if (!Array.isArray(rows) || !rows.length) return { rows: [], foreignDropped: 0 }
  const d = canonicalizeDomain(domain)
  let foreignDropped = 0
  const next: T[] = []
  for (const row of rows) {
    if (!row.url || !hostBelongsToDomain(row.url, d)) {
      foreignDropped += 1
      continue
    }
    next.push(row)
  }
  return { rows: next, foreignDropped }
}

export function filterBacklinkRowsForDomain<T extends { url_to?: string; domain_from?: string; url_from?: string }>(
  rows: T[] | undefined,
  domain: string,
): { rows: T[]; foreignDropped: number; selfDropped: number } {
  if (!Array.isArray(rows) || !rows.length) return { rows: [], foreignDropped: 0, selfDropped: 0 }
  const d = canonicalizeDomain(domain)
  let foreignDropped = 0
  let selfDropped = 0
  const next: T[] = []
  for (const row of rows) {
    const from = hostOf(row.domain_from || row.url_from)
    if (from && hostBelongsToDomain(from, d)) {
      selfDropped += 1
      continue
    }
    if (row.url_to && !hostBelongsToDomain(row.url_to, d)) {
      foreignDropped += 1
      continue
    }
    next.push(row)
  }
  return { rows: next, foreignDropped, selfDropped }
}

export function filterCompetitorRowsForDomain<T extends { domain?: string }>(
  rows: T[] | undefined,
  domain: string,
  opts: { dropGiants?: boolean } = { dropGiants: true },
): { rows: T[]; giantsDropped: number; selfDropped: number } {
  if (!Array.isArray(rows) || !rows.length) return { rows: [], giantsDropped: 0, selfDropped: 0 }
  const d = canonicalizeDomain(domain)
  let giantsDropped = 0
  let selfDropped = 0
  const next: T[] = []
  for (const row of rows) {
    const cd = canonicalizeDomain(row.domain)
    if (!cd) continue
    if (cd === d || cd.endsWith(`.${d}`) || d.endsWith(`.${cd}`)) {
      selfDropped += 1
      continue
    }
    if (opts.dropGiants !== false && isGiantCompetitor(cd)) {
      giantsDropped += 1
      continue
    }
    next.push(row)
  }
  // Prefer domain-looking names with shared stem only as soft score later; keep order
  const stem = brandStem(d)
  next.sort((a, b) => {
    const ad = canonicalizeDomain(a.domain)
    const bd = canonicalizeDomain(b.domain)
    const as = stem && ad.includes(stem) ? 1 : 0
    const bs = stem && bd.includes(stem) ? 1 : 0
    return bs - as
  })
  return { rows: next, giantsDropped, selfDropped }
}
