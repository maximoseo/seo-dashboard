/**
 * Domain-bound React Query helpers: never paint foreign payloads.
 */
import { useEffect } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { assertPayloadDomain, canonicalizeDomain } from '@/lib/domain'

/** Cancel and drop module caches that belong to other domains after a switch. */
export function useDomainSwitchCleanup(activeDomain: string | null | undefined) {
  const qc = useQueryClient()
  const domain = canonicalizeDomain(activeDomain)

  useEffect(() => {
    if (!domain) return
    // Cancel in-flight; keep matching domain caches for snappy back-navigation.
    void qc.cancelQueries({
      predicate: (q) => {
        const key = q.queryKey as QueryKey
        // keys shaped like [module, domain, market]
        const keyDomain = typeof key[1] === 'string' ? canonicalizeDomain(key[1]) : ''
        return Boolean(keyDomain && keyDomain !== domain)
      },
    })
  }, [domain, qc])
}

export function selectDomainPayload<T extends { domain?: string; canonicalDomain?: string; requestedDomain?: string }>(
  payload: T | undefined,
  activeDomain: string | null | undefined,
): T | undefined {
  if (!payload) return undefined
  const check = assertPayloadDomain(payload, activeDomain)
  if (!check.ok) return undefined
  return check.data
}
