/**
 * Durable, global provider budget ledger (P1.2 / near-P0 money control).
 *
 * The legacy per-process counter cannot cap spend once the API scales to multiple serverless
 * instances — each instance keeps its own count, so the real daily total can reach N× the cap on
 * paid providers. This module reserves budget atomically in Postgres (via a service-role RPC) so the
 * cap is enforced globally. When no durable store is configured it degrades to the old per-process
 * guard, clearly flagged as non-authoritative, so local/dev still works.
 */

export type BudgetStore = 'durable' | 'memory'

export type BudgetDecision = {
  allowed: boolean
  used: number
  limit: number
  store: BudgetStore
}

// Minimal shape we need from the Supabase service-role client (avoids coupling to its generics).
export type BudgetRpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

const memory: Record<string, { count: number; date: string }> = {}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

/** Per-process fallback — NOT authoritative across serverless instances. */
function reserveMemory(provider: string, limit: number, amount = 1): BudgetDecision {
  const day = today()
  const tracker = memory[provider]
  if (!tracker || tracker.date !== day) {
    memory[provider] = { count: amount, date: day }
    return { allowed: amount <= limit, used: amount, limit, store: 'memory' }
  }
  if (tracker.count >= limit) {
    return { allowed: false, used: tracker.count, limit, store: 'memory' }
  }
  tracker.count += amount
  return { allowed: tracker.count <= limit, used: tracker.count, limit, store: 'memory' }
}

/**
 * Reserve `amount` units of a provider's daily budget. Durable when `admin` is provided, otherwise a
 * per-process fallback. Reserve-before-call: an over-cap reservation is released and denied.
 */
export async function reserveProviderBudget(
  admin: BudgetRpc | null | undefined,
  provider: string,
  limit: number,
  amount = 1,
): Promise<BudgetDecision> {
  if (!admin) return reserveMemory(provider, limit, amount)

  const day = today()
  try {
    const { data, error } = await admin.rpc('reserve_provider_budget', {
      p_provider: provider,
      p_day: day,
      p_amount: amount,
    })
    if (error || typeof data !== 'number') {
      throw error || new Error('reserve_provider_budget returned a non-numeric total')
    }
    const used = Number(data)
    if (used > limit) {
      // Over the cap — undo the reservation we just made so it does not permanently inflate the day.
      await admin
        .rpc('release_provider_budget', { p_provider: provider, p_day: day, p_amount: amount })
        .catch(() => {})
      return { allowed: false, used: used - amount, limit, store: 'durable' }
    }
    return { allowed: true, used, limit, store: 'durable' }
  } catch (err) {
    console.error('[budget] durable ledger unavailable, falling back to per-process guard:', err)
    return reserveMemory(provider, limit, amount)
  }
}

/** Release a previously reserved amount (e.g. the paid call failed before it was made). */
export async function releaseProviderBudget(
  admin: BudgetRpc | null | undefined,
  provider: string,
  amount = 1,
): Promise<void> {
  if (!admin) {
    const tracker = memory[provider]
    if (tracker) tracker.count = Math.max(0, tracker.count - amount)
    return
  }
  await admin
    .rpc('release_provider_budget', { p_provider: provider, p_day: today(), p_amount: amount })
    .catch(() => {})
}

/** Test-only reset of the in-process fallback map. */
export function __resetMemoryBudget(): void {
  for (const k of Object.keys(memory)) delete memory[k]
}
