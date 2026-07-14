/**
 * Server-side domain integrity helpers shared by aggregated modules.
 */

export function canonicalizeDomain(input?: string | null): string {
  if (!input) return ''
  let s = String(input).trim().toLowerCase()
  if (!s) return ''
  s = s.replace(/^https?:\/\//, '')
  s = s.replace(/\/.*$/, '')
  s = s.replace(/:\d+$/, '')
  s = s.replace(/^www\./, '')
  s = s.replace(/\.$/, '')
  if (s.includes('@')) s = s.split('@').pop() || s
  return s
}

export function hostOf(raw?: string | null): string {
  if (!raw) return ''
  const s = String(raw).trim()
  if (!s) return ''
  try {
    const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`
    return new URL(withScheme).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return canonicalizeDomain(s.split('/')[0])
  }
}

export function hostBelongsToDomain(hostOrUrl: string | null | undefined, domain: string | null | undefined): boolean {
  const host = hostOf(hostOrUrl)
  const d = canonicalizeDomain(domain)
  if (!host || !d) return false
  return host === d || host.endsWith(`.${d}`)
}

export const COMPETITOR_GIANT_DENYLIST = new Set([
  'facebook.com', 'fb.com', 'instagram.com', 'wikipedia.org', 'youtube.com', 'youtu.be',
  'twitter.com', 'x.com', 'linkedin.com', 'tiktok.com', 'google.com', 'google.co.il',
  'apple.com', 'amazon.com', 'amazon.co.uk', 'microsoft.com', 'bing.com', 'yahoo.com',
  'reddit.com', 'pinterest.com', 'whatsapp.com', 'telegram.org', 'wix.com', 'wordpress.com',
  'blogger.com', 'medium.com', 'ebay.com', 'etsy.com', 'netflix.com', 'spotify.com',
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

export type IntegrityMeta = {
  ok: boolean
  foreignRowsDropped: number
  selfRowsDropped: number
  giantsDropped: number
  emptyReason?: string
}

export function stampPayload<T extends Record<string, any>>(
  payload: T,
  domain: string,
  integrity: Partial<IntegrityMeta> = {},
): T {
  const canonical = canonicalizeDomain(domain)
  return {
    ...payload,
    domain: canonical,
    requestedDomain: domain,
    canonicalDomain: canonical,
    integrity: {
      ok: integrity.ok !== false,
      foreignRowsDropped: integrity.foreignRowsDropped || 0,
      selfRowsDropped: integrity.selfRowsDropped || 0,
      giantsDropped: integrity.giantsDropped || 0,
      emptyReason: integrity.emptyReason,
    },
  }
}

export function filterKeywordsForDomain(rows: any[], domain: string) {
  const d = canonicalizeDomain(domain)
  let foreignRowsDropped = 0
  const next: any[] = []
  for (const row of rows || []) {
    const url = row?.url || row?.best_position_url || ''
    if (url && !hostBelongsToDomain(url, d)) {
      foreignRowsDropped += 1
      continue
    }
    next.push({ ...row, evidenceDomain: d })
  }
  return { rows: next, foreignRowsDropped, selfRowsDropped: 0, giantsDropped: 0 }
}

export function filterPagesForDomain(rows: any[], domain: string) {
  const d = canonicalizeDomain(domain)
  let foreignRowsDropped = 0
  const next: any[] = []
  for (const row of rows || []) {
    if (!row?.url || !hostBelongsToDomain(row.url, d)) {
      foreignRowsDropped += 1
      continue
    }
    next.push({ ...row, evidenceDomain: d })
  }
  return { rows: next, foreignRowsDropped, selfRowsDropped: 0, giantsDropped: 0 }
}

export function filterCompetitorsForDomain(rows: any[], domain: string) {
  const d = canonicalizeDomain(domain)
  let giantsDropped = 0
  let selfRowsDropped = 0
  const next: any[] = []
  for (const row of rows || []) {
    const cd = canonicalizeDomain(row?.domain || row?.Dn || row?.Domain)
    if (!cd) continue
    if (cd === d || cd.endsWith(`.${d}`) || d.endsWith(`.${cd}`)) {
      selfRowsDropped += 1
      continue
    }
    if (isGiantCompetitor(cd)) {
      giantsDropped += 1
      continue
    }
    next.push({ ...row, domain: cd, evidenceDomain: d })
  }
  return { rows: next, foreignRowsDropped: 0, selfRowsDropped, giantsDropped }
}

/**
 * Validate a cached snapshot belongs to the requested domain.
 * Returns null when the snapshot must be ignored.
 */
export function acceptSnapshotForDomain(cached: any, domain: string): any | null {
  if (!cached?.data) return null
  const claimed =
    canonicalizeDomain(cached.data.canonicalDomain) ||
    canonicalizeDomain(cached.data.domain) ||
    canonicalizeDomain(cached.data.requestedDomain)
  const want = canonicalizeDomain(domain)
  if (claimed && claimed !== want) return null
  return cached
}
