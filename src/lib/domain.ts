/**
 * Domain identity helpers — single source of truth for canonicalize / compare / host checks.
 * Used by UI, React Query guards and integrity bars.
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
  // strip credentials leftovers
  if (s.includes('@')) s = s.split('@').pop() || s
  return s
}

export function domainsEqual(a?: string | null, b?: string | null): boolean {
  const ca = canonicalizeDomain(a)
  const cb = canonicalizeDomain(b)
  if (!ca || !cb) return false
  return ca === cb
}

/** Hostname from a URL or bare host, without www. */
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

/** True when host is the target domain or a subdomain of it. */
export function hostBelongsToDomain(hostOrUrl?: string | null, domain?: string | null): boolean {
  const host = hostOf(hostOrUrl)
  const d = canonicalizeDomain(domain)
  if (!host || !d) return false
  return host === d || host.endsWith(`.${d}`)
}

export function brandStem(domain?: string | null): string {
  const d = canonicalizeDomain(domain)
  if (!d) return ''
  return d.split('.')[0] || ''
}

export type PayloadIntegrity = {
  ok: boolean
  foreignRowsDropped: number
  selfRowsDropped?: number
  emptyReason?: string
}

export type DomainBoundPayload = {
  domain?: string
  requestedDomain?: string
  canonicalDomain?: string
  integrity?: PayloadIntegrity
  [key: string]: unknown
}

/**
 * Reject payloads that don't belong to the active domain.
 * Returns null when the payload must not be rendered.
 */
export function assertPayloadDomain<T extends DomainBoundPayload>(
  payload: T | null | undefined,
  activeDomain: string | null | undefined,
): { ok: true; data: T } | { ok: false; reason: string } {
  if (!payload) return { ok: false, reason: 'empty-payload' }
  const active = canonicalizeDomain(activeDomain)
  if (!active) return { ok: false, reason: 'no-active-domain' }

  const claimed =
    canonicalizeDomain(payload.canonicalDomain) ||
    canonicalizeDomain(payload.domain) ||
    canonicalizeDomain(payload.requestedDomain)

  if (claimed && claimed !== active) {
    return { ok: false, reason: `domain-mismatch:${claimed}!=${active}` }
  }

  if (payload.integrity && payload.integrity.ok === false && payload.integrity.emptyReason === 'domain-mismatch') {
    return { ok: false, reason: 'integrity-failed' }
  }

  return { ok: true, data: payload }
}
