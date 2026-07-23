/**
 * SEO Dashboard — Daily Snapshot Job
 *
 * Writes durable provider slices into canonical Supabase:
 *   project: sunrupuwvpalipiuebcv
 *   table:   seo_snapshots (domain_id, provider, snapshot_date UNIQUE, data jsonb)
 *
 * Usage (Node, not N8N):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... DASHBOARD_API_KEY=... \
 *   SEO_DASHBOARD_PROXY=https://seo-dashboard.maximo-seo.ai \
 *   node scripts/snapshot-job.js [--limit=10] [--domain=nyg.co.il]
 *
 * N8N: Schedule Trigger → Code node → paste/require this script after adapting $env.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sunrupuwvpalipiuebcv.supabase.co'
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY
const PROXY_URL = (process.env.SEO_DASHBOARD_PROXY || 'https://seo-dashboard.maximo-seo.ai').replace(/\/$/, '')
const DASHBOARD_API_KEY = process.env.DASHBOARD_API_KEY || process.env.DASHBOARD_AUTH_SECRET || ''
const DASHBOARD_USER = process.env.DASHBOARD_AUTH_USERNAME || 'service@maximo-seo.com'
const DASHBOARD_PASS = process.env.DASHBOARD_AUTH_PASSWORD || ''

function today() {
  return new Date().toISOString().slice(0, 10)
}

function parseArgs(argv) {
  const out = { limit: null, domains: [] }
  for (const a of argv.slice(2)) {
    if (a.startsWith('--limit=')) out.limit = Number(a.slice('--limit='.length))
    else if (a.startsWith('--domain=')) out.domains.push(a.slice('--domain='.length))
  }
  return out
}

async function rest(path, { method = 'GET', body, headers = {}, prefer } = {}) {
  const h = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...headers,
  }
  if (prefer) h.Prefer = prefer
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text.slice(0, 400) }
  }
  if (!res.ok) {
    const err = new Error(`Supabase ${method} ${path} → ${res.status}`)
    err.status = res.status
    err.body = data
    throw err
  }
  return data
}

async function listDomains({ limit, domains }) {
  if (domains.length) {
    const filter = domains.map((d) => `"${d}"`).join(',')
    return rest(`/rest/v1/seo_domains?select=id,domain,name,status&domain=in.(${filter})&order=domain.asc`)
  }
  let q = `/rest/v1/seo_domains?select=id,domain,name,status&status=eq.active&order=domain.asc`
  if (limit) q += `&limit=${limit}`
  return rest(q)
}

async function loginCookieJar() {
  const jar = { cookie: null, authMode: DASHBOARD_API_KEY ? 'bearer' : 'none' }
  // Prefer M2M bearer — avoids login rate-limit noise on cron.
  if (DASHBOARD_API_KEY) return jar
  if (!DASHBOARD_PASS) throw new Error('Need DASHBOARD_API_KEY or DASHBOARD_AUTH_PASSWORD')

  const res = await fetch(`${PROXY_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: DASHBOARD_USER, password: DASHBOARD_PASS }),
  })
  const setCookie = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  const raw = setCookie.length
    ? setCookie
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : [])
  if (raw.length) {
    jar.cookie = raw.map((c) => String(c).split(';')[0]).join('; ')
    jar.authMode = 'cookie'
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`login failed ${res.status} ${text.slice(0, 180)}`)
  }
  return jar
}

async function fetchProxy(jar, endpoint, params = {}, method = 'GET', body) {
  const url = new URL(`${PROXY_URL}/api/${endpoint}`)
  if (method === 'GET') {
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') url.searchParams.set(k, String(v))
    })
  }
  const headers = {
    Accept: 'application/json',
  }
  if (DASHBOARD_API_KEY) headers.Authorization = `Bearer ${DASHBOARD_API_KEY}`
  if (jar?.cookie) headers.Cookie = jar.cookie
  if (body) headers['Content-Type'] = 'application/json'

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text.slice(0, 250) }
  }
  if (!res.ok) return { ok: false, status: res.status, data }
  return { ok: true, status: res.status, data }
}

function sanitizeJsonForPg(value, depth = 0) {
  if (depth > 40) return null
  if (value == null) return value
  if (typeof value === 'string') {
    // eslint-disable-next-line no-control-regex -- strips C0 controls for Postgres
    return value.replace(/\u0000/g, '').replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map((v) => sanitizeJsonForPg(v, depth + 1))
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      // eslint-disable-next-line no-control-regex -- strips C0 controls for Postgres
      const key = String(k).replace(/\u0000/g, '').replace(/[\r\n]+/g, ' ').trim()
      if (!key) continue
      out[key] = sanitizeJsonForPg(v, depth + 1)
    }
    return out
  }
  return value
}

async function upsertSnapshot(domainId, provider, data) {
  // PostgREST needs on_conflict columns + Prefer resolution=merge-duplicates or HTTP 409
  // fires on existing (domain_id, provider, snapshot_date) unique rows.
  // Also strip U+0000 (jsonb 22P05) that sometimes arrives from Exa / noisy HTML.
  const payload = {
    domain_id: domainId,
    provider,
    snapshot_date: today(),
    data: sanitizeJsonForPg(data),
    fetched_at: new Date().toISOString(),
  }
  return rest('/rest/v1/seo_snapshots?on_conflict=domain_id,provider,snapshot_date', {
    method: 'POST',
    body: payload,
    prefer: 'resolution=merge-duplicates,return=representation',
  })
}

function extractMetrics(payload) {
  // Supports nested shapes from overview / ahrefs routes.
  const m =
    payload?.metrics?.metrics ||
    payload?.metrics ||
    payload?.sources?.ahrefs?.metrics?.metrics ||
    payload?.sources?.ahrefs?.metrics ||
    null
  const dr =
    payload?.domain_rating?.domain_rating ||
    payload?.domain_rating ||
    payload?.sources?.ahrefs?.domainRating?.domain_rating ||
    payload?.sources?.ahrefs?.domainRating ||
    null
  return { metrics: m, domainRating: dr }
}

async function snapshotDomain(jar, domainRow) {
  const domain = domainRow.domain
  const date = today()
  const written = []
  const errors = []

  // Prefer single aggregated overview (already multi-provider).
  const overview = await fetchProxy(jar, 'overview', { domain })
  if (overview.ok && overview.data) {
    try {
      await upsertSnapshot(domainRow.id, 'overview', overview.data)
      written.push('overview')
    } catch (e) {
      errors.push(`overview upsert: ${e.message}`)
    }

    // Also store ahrefs slice from overview for history continuity
    if (overview.data.sources?.ahrefs) {
      try {
        await upsertSnapshot(domainRow.id, 'ahrefs', overview.data.sources.ahrefs)
        written.push('ahrefs')
      } catch (e) {
        errors.push(`ahrefs upsert: ${e.message}`)
      }
    }
    if (overview.data.sources?.semrush) {
      try {
        await upsertSnapshot(domainRow.id, 'semrush', overview.data.sources.semrush)
        written.push('semrush')
      } catch (e) {
        errors.push(`semrush upsert: ${e.message}`)
      }
    }
    if (overview.data.sources?.dataforseo) {
      try {
        await upsertSnapshot(domainRow.id, 'dataforseo', overview.data.sources.dataforseo)
        written.push('dataforseo')
      } catch (e) {
        errors.push(`dataforseo upsert: ${e.message}`)
      }
    }
  } else {
    errors.push(`overview fetch failed status=${overview.status}`)
  }

  // Direct DR with date (product overview already uses date; standalone historically forgot it)
  const dr = await fetchProxy(jar, 'ahrefs/domain-rating', { target: domain, date })
  if (dr.ok && dr.data && !dr.data.error && dr.data.domain_rating) {
    try {
      await upsertSnapshot(domainRow.id, 'ahrefs-dr', dr.data)
      written.push('ahrefs-dr')
    } catch (e) {
      errors.push(`ahrefs-dr upsert: ${e.message}`)
    }
  }

  // Alerts (rule engine) — durable copy of today's operational surface
  const alerts = await fetchProxy(jar, 'alerts/aggregated', { domain })
  if (alerts.ok && alerts.data) {
    try {
      await upsertSnapshot(domainRow.id, 'alerts', alerts.data)
      written.push('alerts')
    } catch (e) {
      errors.push(`alerts upsert: ${e.message}`)
    }
  }

  return {
    domain,
    domainId: domainRow.id,
    status: written.length ? 'success' : 'error',
    written,
    errors,
    extracted: extractMetrics(overview.data || {}),
  }
}

async function main() {
  if (!SUPABASE_KEY) {
    console.error('Missing SUPABASE_SERVICE_ROLE / SERVICE_KEY')
    process.exit(1)
  }
  const args = parseArgs(process.argv)
  console.log(JSON.stringify({
    phase: 'start',
    supabase: SUPABASE_URL,
    proxy: PROXY_URL,
    date: today(),
    limit: args.limit,
    domains: args.domains,
  }))

  const domains = await listDomains(args)
  if (!domains?.length) {
    console.error('No domains found')
    process.exit(2)
  }

  const jar = await loginCookieJar()
  const results = []
  for (const d of domains) {
    try {
      const r = await snapshotDomain(jar, d)
      results.push(r)
      console.log(JSON.stringify({ phase: 'domain', ...r }))
    } catch (e) {
      const r = { domain: d.domain, status: 'error', error: e.message, written: [], errors: [e.message] }
      results.push(r)
      console.log(JSON.stringify({ phase: 'domain', ...r }))
    }
  }

  const ok = results.filter((r) => r.status === 'success').length
  const summary = {
    phase: 'done',
    date: today(),
    sites_processed: results.length,
    success: ok,
    failed: results.length - ok,
    results,
  }
  console.log(JSON.stringify(summary))
  process.exit(ok === 0 ? 3 : 0)
}

// Support both CLI and module import
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('snapshot-job.js') || process.argv[1].endsWith('snapshot-job.mjs'))

if (isMain) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}

export { main, upsertSnapshot, listDomains }
