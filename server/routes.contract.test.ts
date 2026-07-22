import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

/**
 * Serverless routing contract (P0.4).
 *
 * On Vercel every /api/* request is served by an Express-wrapper function that imports the single
 * shared app. This test fails closed if:
 *   1. a route the UI/cron depends on is removed from the Express app, or
 *   2. an api/ wrapper stops forwarding to the shared app (divergent handler / drift).
 */
const root = fileURLToPath(new URL('..', import.meta.url))
const serverSrc = readFileSync(join(root, 'server', 'index.ts'), 'utf8')

const REQUIRED_ROUTES: Array<[string, string]> = [
  ['get', '/api/health'],
  ['get', '/api/version'],
  ['get', '/api/status'],
  ['get', '/api/projects'],
  ['post', '/api/projects'],
  ['get', '/api/projects/:domain'],
  ['get', '/api/projects/:domain/summary'],
  ['get', '/api/projects/:domain/modules'],
  ['get', '/api/cron/nightly-sync'],
  ['post', '/api/cron/nightly-sync'],
  ['get', '/api/cron/report-schedules'],
  ['get', '/api/cron/health'],
]

function isRegistered(method: string, path: string): boolean {
  // Matches app.get('/api/x', ...) / app.post("/api/x", ...) regardless of quote style or extra middleware args.
  const re = new RegExp(`app\\.${method}\\(\\s*['"\`]${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`)
  return re.test(serverSrc)
}

function listWrappers(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listWrappers(full))
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

describe('serverless route contract', () => {
  it.each(REQUIRED_ROUTES)('registers %s %s on the shared Express app', (method, path) => {
    expect(isRegistered(method, path)).toBe(true)
  })

  it('routes every api/ wrapper to the shared server app (no divergent handler)', () => {
    const wrappers = listWrappers(join(root, 'api'))
    expect(wrappers.length).toBeGreaterThan(0)
    const offenders: string[] = []
    for (const file of wrappers) {
      const src = readFileSync(file, 'utf8')
      const importsApp = /import\s+app\s+from\s+['"](?:\.\.\/)+server\/index(?:\.js)?['"]/.test(src)
      const reExportsApp = /export\s+default\s+app/.test(src)
      if (!importsApp || !reExportsApp) offenders.push(file.replace(root, ''))
    }
    expect(offenders, `wrappers not forwarding to shared app: ${offenders.join(', ')}`).toEqual([])
  })
})
