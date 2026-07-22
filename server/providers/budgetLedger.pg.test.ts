import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

/**
 * Atomicity proof for the durable budget ledger against a REAL Postgres.
 * Gated on TEST_DATABASE_URL so `npm test` / CI stay green without a database; run locally with:
 *   TEST_DATABASE_URL=postgres://... npx vitest run server/providers/budgetLedger.pg.test.ts
 *
 * This is the guarantee behind KPI "Global budget overrun: 0": concurrent reservations must not lose
 * updates, i.e. N parallel reserves of 1 must yield exactly the totals {1..N}.
 */
const CONN = process.env.TEST_DATABASE_URL
const maybe = CONN ? describe : describe.skip

maybe('durable budget ledger is atomic under concurrency', () => {
  // A real connection POOL so reservations hit Postgres in parallel (a single Client would serialize).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any

  beforeAll(async () => {
    const { Pool } = await import('pg')
    client = new Pool({ connectionString: CONN, max: 20 })
    const root = fileURLToPath(new URL('../../', import.meta.url))
    const sql = readFileSync(join(root, 'supabase', 'migrations', '004_provider_budget_ledger.sql'), 'utf8')
    await client.query(sql)
    await client.query('delete from seo_provider_budget')
  })

  afterAll(async () => { if (client) await client.end() })

  it('N concurrent reserves yield exactly {1..N} with no lost updates', async () => {
    const N = 200
    const provider = 'ahrefs'
    const day = '2026-07-22'

    const totals: number[] = await Promise.all(
      Array.from({ length: N }, () =>
        client
          .query('select reserve_provider_budget($1,$2,1) as used', [provider, day])
          .then((r: { rows: Array<{ used: string }> }) => Number(r.rows[0].used)),
      ),
    )

    // No two callers saw the same total => no lost updates.
    expect(new Set(totals).size).toBe(N)
    // Highest observed total equals N => every increment landed.
    expect(Math.max(...totals)).toBe(N)

    const { rows } = await client.query(
      'select used from seo_provider_budget where provider=$1 and budget_day=$2',
      [provider, day],
    )
    expect(Number(rows[0].used)).toBe(N)
  })

  it('release never drives the counter below zero', async () => {
    const provider = 'exa'
    const day = '2026-07-22'
    await client.query('select reserve_provider_budget($1,$2,1)', [provider, day])
    await client.query('select release_provider_budget($1,$2,5)', [provider, day])
    const { rows } = await client.query(
      'select used from seo_provider_budget where provider=$1 and budget_day=$2',
      [provider, day],
    )
    expect(Number(rows[0].used)).toBe(0)
  })
})
