import { describe, it, expect, beforeEach } from 'vitest'
import { reserveProviderBudget, __resetMemoryBudget, type BudgetRpc } from './budgetLedger'

beforeEach(() => __resetMemoryBudget())

describe('budget ledger — per-process fallback', () => {
  it('allows up to the limit then denies', async () => {
    let last
    for (let i = 0; i < 5; i++) last = await reserveProviderBudget(null, 'memtest', 3)
    expect(last!.store).toBe('memory')
    expect(last!.allowed).toBe(false)
    expect(last!.limit).toBe(3)
  })
})

describe('budget ledger — durable path', () => {
  function fakeAdmin(): BudgetRpc & { total: () => number } {
    let used = 0
    return {
      total: () => used,
      rpc: async (fn, args) => {
        const amount = Number((args as any).p_amount)
        if (fn === 'reserve_provider_budget') { used += amount; return { data: used, error: null } }
        if (fn === 'release_provider_budget') { used = Math.max(0, used - amount); return { data: used, error: null } }
        return { data: null, error: null }
      },
    }
  }

  it('allows under cap and reports durable store', async () => {
    const admin = fakeAdmin()
    expect(await reserveProviderBudget(admin, 'p', 2)).toMatchObject({ allowed: true, used: 1, store: 'durable' })
    expect(await reserveProviderBudget(admin, 'p', 2)).toMatchObject({ allowed: true, used: 2, store: 'durable' })
  })

  it('denies over cap AND releases the over-cap reservation', async () => {
    const admin = fakeAdmin()
    await reserveProviderBudget(admin, 'p', 2)
    await reserveProviderBudget(admin, 'p', 2)
    const denied = await reserveProviderBudget(admin, 'p', 2)
    expect(denied.allowed).toBe(false)
    expect(admin.total()).toBe(2) // reservation #3 was rolled back, not left inflating the day
  })

  it('falls back to the per-process guard when the durable rpc errors', async () => {
    const admin: BudgetRpc = { rpc: async () => ({ data: null, error: new Error('db down') }) }
    const decision = await reserveProviderBudget(admin, 'fb', 10)
    expect(decision.store).toBe('memory')
    expect(decision.allowed).toBe(true)
  })
})
