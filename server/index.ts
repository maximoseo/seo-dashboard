import express from 'express'
import cors from 'cors'
import NodeCache from 'node-cache'
import axios from 'axios'
import path from 'path'
import { fileURLToPath } from 'url'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { generateAlerts } from './alerts/rules.js'
import { createSeoTaskFromAlert } from './tasks/createSeoTask.js'
import {
  REPORT_TEMPLATES,
  defaultSectionsForTemplate,
  renderReportHtml,
  renderReportMarkdown,
  type ReportLocale,
  type ReportTemplateId,
} from './reports/renderReport.js'
import {
  buildGeoAiOverview,
  buildLocalSeoOverview,
  summarizeKeywordSerpSignals,
} from './modules/localGeo.js'
import {
  buildProjectSummaries,
  getProjectByDomain,
  summarizeProjectModules,
  type ProjectPriority,
  type ProjectStatus,
  type SeedProject,
} from './projects/projectSummary.js'
import { alertsFromSnapshotRows, buildSnapshotOverlayMap } from './data/snapshotSpine.js'
import { loadLatestSnapshots, loadOpenCounts, persistAlertsAndTasks } from './data/persistOps.js'
import { loadAgenticOsBridge, pushCriticalAlertToAsana, pushCriticalAlertToTodo } from './integrations/bridges.js'
import { resolveMarket, serankingResearchUrl } from './markets/resolveMarket.js'
import {
  computeCompetitorGaps,
  competitorsFromDataForSEO,
  competitorsFromExa,
  competitorsFromSemrush,
  keywordMovements,
  keywordsFromAhrefs,
  keywordsFromDataForSEO,
  keywordsFromSemrush,
  mergeCompetitors,
  mergeKeywordRows,
  type KeywordRow,
} from './providers/adapters.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.set('trust proxy', 1)
const PORT = process.env.PORT || 3001

// Caches: 5min for realtime, 24h for historical
const realtimeCache = new NodeCache({ stdTTL: 300 })
const historicalCache = new NodeCache({ stdTTL: 86400 })

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY: CORS pinned to frontend origin only
// ═══════════════════════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = [
  'https://seo-dashboard.maximo-seo.ai',
  'https://seo-dashboard-gzb6.onrender.com',
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.FRONTEND_URL || '',
].filter(Boolean)

app.use(cors({ origin: ALLOWED_ORIGINS }))
app.use(express.json())

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY: Rate limiting
// ═══════════════════════════════════════════════════════════════════════════════
const generalLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 240, // SPA route reloads + dashboard widgets can burst above 60/min
  message: { error: 'Rate limit exceeded. Please slow down.' },
})

const expensiveLimiter = rateLimit({
  windowMs: 60_000,
  max: 30, // provider-backed endpoints are still capped separately by daily budgets
  message: { error: 'Rate limit exceeded for this provider. Please wait.' },
})

app.use('/api', generalLimiter)





// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY: Auth middleware — Supabase JWT verification
// ═══════════════════════════════════════════════════════════════════════════════
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''
const AUTH_DISABLED = process.env.AUTH_DISABLED === 'true' // for local dev only
const IS_PROD = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
// Local seed/demo project lists alone are for local/dev only. Force real Supabase spine in prod.
const ALLOW_LOCAL_SEED = !IS_PROD && process.env.ALLOW_LOCAL_SEED !== 'false'
const DASHBOARD_AUTH_USERNAME = process.env.DASHBOARD_AUTH_USERNAME || process.env.DASHBOARD_USERNAME || process.env.DASHBOARD_EMAIL || 'service@maximo-seo.com'
// Never ship plaintext password defaults — production must set DASHBOARD_AUTH_PASSWORD via env.
const DASHBOARD_AUTH_PASSWORD = process.env.DASHBOARD_AUTH_PASSWORD || process.env.DASHBOARD_PASSWORD || ''
const DASHBOARD_AUTH_SECRET =
  process.env.DASHBOARD_AUTH_SECRET ||
  process.env.DASHBOARD_API_KEY ||
  (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
    ? ''
    : 'dev-only-local-secret-change-me')
const DEFAULT_DASHBOARD_TOKEN_TTL_SECONDS = 60 * 60 * 12
const parsedDashboardTokenTtl = Number(process.env.DASHBOARD_TOKEN_TTL_SECONDS || DEFAULT_DASHBOARD_TOKEN_TTL_SECONDS)
const DASHBOARD_TOKEN_TTL_SECONDS = Number.isFinite(parsedDashboardTokenTtl) && parsedDashboardTokenTtl > 0
  ? Math.floor(parsedDashboardTokenTtl)
  : DEFAULT_DASHBOARD_TOKEN_TTL_SECONDS
const DASHBOARD_SESSION_COOKIE = 'maximo_dashboard_session'

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null
// Service-role client: durable writes + portfolio spine reads. Never expose this key to the browser.
const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_MCP_SERVICE_ROLE ||
  ''
const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null

type DashboardTokenPayload = {
  sub: string
  email: string
  iat: number
  exp: number
  provider: 'dashboard'
}

function toBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url')
}

function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function signDashboardToken(email: string): { token: string; expiresAt: string } {
  if (!DASHBOARD_AUTH_SECRET) throw new Error('DASHBOARD_AUTH_SECRET is not configured')
  const now = Math.floor(Date.now() / 1000)
  const payload: DashboardTokenPayload = {
    sub: email,
    email,
    iat: now,
    exp: now + DASHBOARD_TOKEN_TTL_SECONDS,
    provider: 'dashboard',
  }
  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = crypto.createHmac('sha256', DASHBOARD_AUTH_SECRET).update(encodedPayload).digest('base64url')
  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  }
}

function verifyDashboardToken(token: string): DashboardTokenPayload | null {
  if (!DASHBOARD_AUTH_SECRET || !token.includes('.')) return null
  const [encodedPayload, signature] = token.split('.', 2)
  if (!encodedPayload || !signature) return null
  const expected = crypto.createHmac('sha256', DASHBOARD_AUTH_SECRET).update(encodedPayload).digest('base64url')
  if (!safeCompare(signature, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as DashboardTokenPayload
    if (payload.provider !== 'dashboard' || !payload.email || !payload.exp) return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

function dashboardAuthConfigured(): boolean {
  return Boolean(DASHBOARD_AUTH_USERNAME && DASHBOARD_AUTH_PASSWORD && DASHBOARD_AUTH_SECRET)
}

function attachDashboardUser(req: express.Request, payload: DashboardTokenPayload) {
  ;(req as any).user = { id: payload.sub, email: payload.email, app_metadata: { provider: 'dashboard' } }
}

function getCookie(req: express.Request, name: string): string | null {
  const raw = req.get('cookie') || ''
  for (const part of raw.split(';')) {
    const [key, ...valueParts] = part.trim().split('=')
    if (key === name) {
      try {
        return decodeURIComponent(valueParts.join('='))
      } catch {
        return null
      }
    }
  }
  return null
}

function sessionCookie(req: express.Request, token: string, maxAgeSeconds: number): string {
  const secure = req.secure || req.get('x-forwarded-proto') === 'https' || process.env.VERCEL === '1'
  return [
    `${DASHBOARD_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

function clearSessionCookie(req: express.Request): string {
  return sessionCookie(req, '', 0)
}

// Auth middleware — /api/health and /api/auth/login are intentionally public.
// Public share links are read-only HTML/MD (no mutating data).
app.use('/api', async (req, res, next) => {
  if (
    req.path === '/health' ||
    req.path === '/auth/login' ||
    (req.method === 'GET' && /^\/reports\/share\/[^/]+$/.test(req.path))
  ) {
    return next()
  }

  // Vercel Cron + manual operators: Bearer CRON_SECRET for dedicated cron routes only.
  const CRON_SECRET = process.env.CRON_SECRET || ''
  const bearer = req.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (
    CRON_SECRET &&
    bearer &&
    safeCompare(bearer, CRON_SECRET) &&
    (req.path === '/cron/nightly-sync' || req.path === '/cron/health')
  ) {
    ;(req as any).user = { id: 'cron', email: 'cron@local', app_metadata: { provider: 'cron' } }
    return next()
  }

  // Allow bypass in explicit local dev mode only.
  if (AUTH_DISABLED) {
    ;(req as any).user = { id: 'dev', email: 'dev@local', app_metadata: { provider: 'dev' } }
    return next()
  }

  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '') || getCookie(req, DASHBOARD_SESSION_COOKIE)
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Sign in to create a dashboard session.' })
  }

  const dashboardPayload = verifyDashboardToken(token)
  if (dashboardPayload) {
    attachDashboardUser(req, dashboardPayload)
    return next()
  }

  if (supabase) {
    try {
      const { data, error } = await supabase.auth.getUser(token)
      if (!error && data?.user) {
        ;(req as any).user = data.user
        return next()
      }
    } catch {
      // Fall through to API key check below.
    }
  }

  const API_KEY = process.env.DASHBOARD_API_KEY
  if (API_KEY && safeCompare(token, API_KEY)) {
    ;(req as any).user = { id: 'api-key', email: 'api-key@local', app_metadata: { provider: 'api-key' } }
    return next()
  }

  return res.status(401).json({ error: 'Invalid or expired token.' })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY: Zod validation schemas
// ═══════════════════════════════════════════════════════════════════════════════
const domainSchema = z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Invalid domain format')
const urlSchema = z.string().url('Invalid URL format')
const providerSchema = z.enum([
  'ahrefs', 'semrush', 'dataforseo', 'pagespeed', 'gtmetrix',
  'exa', 'browserless', 'thorbit', 'seranking'
])

// Validation middleware factory
function validateQuery(schema: z.ZodSchema) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) {
      const summed = humanizeZodIssues(parsed.error.issues)
      return res.status(400).json({ error: summed.message, messages: summed.messages, details: summed.details })
    }
    ;(req as any).validatedQuery = parsed.data
    next()
  }
}

function humanizeZodIssue(issue: z.ZodIssue): string {
  const path = issue.path.length ? issue.path.join('.') : 'field'
  const msg = issue.message || 'invalid'
  if (path === 'domain' || msg.toLowerCase().includes('invalid domain')) {
    return 'Domain must look like example.com (no https://, path, or trailing slash)'
  }
  if (path === 'locale') return 'Locale must be he or en'
  if (path === 'template') return 'Choose a report template: weekly, monthly, executive, or local-geo'
  if (path === 'format') return 'Format must be json, html, or md'
  if (path === 'status') return 'Status must be one of: queued, working, blocked, verified (snooze is action+tag)'
  if (path === 'action') return 'Action must be close, reopen, snooze, or set-status'
  if (msg.includes('Too small') || issue.code === 'too_small') return `${path} is required`
  if (issue.code === 'invalid_type') return `${path}: expected a valid value`
  return `${path}: ${msg}`
}

function humanizeZodIssues(issues: z.ZodIssue[]): { message: string; messages: string[]; details: z.ZodIssue[] } {
  const messages = issues.map(humanizeZodIssue)
  return {
    message: messages[0] || 'Invalid request',
    messages,
    details: issues,
  }
}

function validateBody(schema: z.ZodSchema) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      const summed = humanizeZodIssues(parsed.error.issues)
      return res.status(400).json({
        error: summed.message,
        messages: summed.messages,
        details: summed.details,
      })
    }
    ;(req as any).validatedBody = parsed.data
    next()
  }
}

const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: 8,
  message: { error: 'Too many login attempts. Please wait and try again.' },
})

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

app.post('/api/auth/login', loginLimiter, validateBody(loginSchema), (req, res) => {
  if (!dashboardAuthConfigured()) {
    return res.status(503).json({ error: 'Dashboard auth is not configured.' })
  }

  const { username, password } = (req as any).validatedBody as z.infer<typeof loginSchema>
  const usernameOk = safeCompare(username.toLowerCase(), DASHBOARD_AUTH_USERNAME.toLowerCase())
  const passwordOk = Boolean(DASHBOARD_AUTH_PASSWORD) && safeCompare(password, DASHBOARD_AUTH_PASSWORD)

  if (!usernameOk || !passwordOk) {
    return res.status(401).json({ error: 'Invalid username or password.' })
  }

  const { token, expiresAt } = signDashboardToken(DASHBOARD_AUTH_USERNAME)
  res.setHeader('Set-Cookie', sessionCookie(req, token, DASHBOARD_TOKEN_TTL_SECONDS))
  return res.json({
    expiresAt,
    user: { email: DASHBOARD_AUTH_USERNAME, provider: 'dashboard' },
  })
})

app.get('/api/auth/me', (req, res) => {
  const user = (req as any).user || null
  return res.json({ authenticated: Boolean(user), user })
})

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie(req))
  return res.json({ ok: true })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY: Per-provider daily budget caps
// ═══════════════════════════════════════════════════════════════════════════════
const budgetTracker: Record<string, { count: number; date: string }> = {}
const DAILY_BUDGETS: Record<string, number> = {
  ahrefs: 100,
  semrush: 100,
  dataforseo: 200,
  pagespeed: 500,
  gtmetrix: 50,
  exa: 200,
  browserless: 100,
  thorbit: 50,
  seranking: 100,
}

function checkBudget(provider: string): boolean {
  const today = new Date().toISOString().split('T')[0]
  const tracker = budgetTracker[provider]
  
  if (!tracker || tracker.date !== today) {
    budgetTracker[provider] = { count: 1, date: today }
    return true
  }
  
  const limit = DAILY_BUDGETS[provider] || 100
  if (tracker.count >= limit) {
    return false
  }
  
  tracker.count++
  return true
}

function budgetMiddleware(provider: string) {
  return (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!checkBudget(provider)) {
      return res.status(429).json({ 
        error: `Daily budget cap reached for ${provider}. Try again tomorrow or contact admin.`,
        provider,
        limit: DAILY_BUDGETS[provider] || 100,
      })
    }
    next()
  }
}

// ─── Env vars ────────────────────────────────────────────────────────────────
const AHREFS_API_KEY = process.env.AHREFS_API_KEY || process.env.AHREFS_API || ''
const SEMRUSH_API_KEY = process.env.SEMRUSH_API || process.env.SEMRUSH_API_KEY || ''
const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN || ''
const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD || ''
const PAGESPEED_API_KEY = process.env.PAGESPEED_API_KEY || process.env.GOOGLE_GEMINI_API || ''
const GTMETRIX_API_KEY = process.env.GTMETRIX_API || process.env.GTMETRIX_API_KEY || ''
const GTMETRIX_EMAIL = process.env.GTMETRIX_EMAIL || 'tomerake@gmail.com'
const SE_RANKING_API = process.env.SE_RANKING_API || ''
const EXA_API_KEY = process.env.EXA_API_KEY || ''
const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY || ''
const THORBIT_API_KEY = process.env.THORBIT_API_KEY || ''

const DATAFORSEO_AUTH = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64')

// ─── Helper: cache wrapper ────────────────────────────────────────────────────
async function withCache<T>(
  cache: NodeCache,
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = cache.get<T>(key)
  if (cached !== undefined) return cached
  const data = await fetcher()
  cache.set(key, data)
  return data
}

// Safe wrapper that returns null on failure
async function safeCall<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn() } catch { return null }
}

function providerUnavailable(provider: string, error: unknown) {
  const message = error instanceof Error ? error.message : 'Provider request failed'
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  return {
    ok: false,
    provider,
    state: 'unavailable',
    error: `${provider} unavailable`,
    message: status ? `Provider HTTP ${status}` : message,
    httpStatus: status,
    softDegraded: status === 403 || status === 401 || status === 402 || status === 429,
    fetchedAt: new Date().toISOString(),
  }
}

function marketFromRequest(req: { query?: any; body?: any }, domain?: string | null) {
  const q = (req.query || {}) as Record<string, string>
  const b = (req.body || {}) as Record<string, string>
  return resolveMarket({
    domain: domain || q.domain || b.domain || null,
    market: q.market || b.market || null,
    override: q.db || q.database || q.region || b.database || b.region || null,
  })
}

async function findDomainId(domain: string): Promise<string | null> {
  if (!supabaseAdmin) return null
  const clean = String(domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./, '')
  const { data } = await supabaseAdmin
    .from('seo_domains')
    .select('id, domain')
    .eq('domain', clean)
    .limit(1)
    .maybeSingle()
  return data?.id ? String(data.id) : null
}

async function loadSnapshotPayload(domain: string, provider: string): Promise<{ data: any; fetchedAt: string | null } | null> {
  if (!supabaseAdmin) return null
  const domainId = await findDomainId(domain)
  if (!domainId) return null
  const { data } = await supabaseAdmin
    .from('seo_snapshots')
    .select('data, fetched_at')
    .eq('domain_id', domainId)
    .eq('provider', provider)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data?.data) return null
  return { data: data.data, fetchedAt: data.fetched_at || null }
}

async function persistSnapshot(domain: string, provider: string, payload: unknown): Promise<void> {
  if (!supabaseAdmin || !payload || typeof payload !== 'object') return
  // Do not persist soft-degraded empty provider errors
  if ((payload as any).ok === false && (payload as any).state === 'unavailable') return
  const domainId = await findDomainId(domain)
  if (!domainId) return
  const today = new Date().toISOString().slice(0, 10)
  await supabaseAdmin.from('seo_snapshots').upsert(
    {
      domain_id: domainId,
      provider,
      snapshot_date: today,
      data: payload,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'domain_id,provider,snapshot_date' },
  ).then(({ error }) => {
    if (error) console.error('[persistSnapshot]', provider, domain, error.message)
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// AHREFS ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/ahrefs/domain-rating', expensiveLimiter, budgetMiddleware('ahrefs'), async (req, res) => {
  const { target } = req.query as Record<string, string>
  // Ahrefs Site Explorer domain-rating requires `date`; default to today if omitted.
  const date = (req.query as Record<string, string>).date || new Date().toISOString().slice(0, 10)
  try {
    const data = await withCache(realtimeCache, `ahrefs_dr_${target}_${date}`, async () => {
      const r = await axios.get('https://api.ahrefs.com/v3/site-explorer/domain-rating', {
        params: { target, date }, headers: { Authorization: `Bearer ${AHREFS_API_KEY}` },
      })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('ahrefs', e)) }
})

app.get('/api/ahrefs/metrics', expensiveLimiter, budgetMiddleware('ahrefs'), async (req, res) => {
  const { target, mode } = req.query as Record<string, string>
  const date = (req.query as Record<string, string>).date || new Date().toISOString().slice(0, 10)
  try {
    const data = await withCache(realtimeCache, `ahrefs_metrics_${target}_${date}`, async () => {
      const r = await axios.get('https://api.ahrefs.com/v3/site-explorer/metrics', {
        params: { target, date, mode: mode || 'subdomains' }, headers: { Authorization: `Bearer ${AHREFS_API_KEY}` },
      })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('ahrefs', e)) }
})

app.get('/api/ahrefs/organic-keywords', expensiveLimiter, budgetMiddleware('ahrefs'), async (req, res) => {
  const { target, mode, limit, select, order_by } = req.query as Record<string, string>
  const date = (req.query as Record<string, string>).date || new Date().toISOString().slice(0, 10)
  try {
    const data = await withCache(realtimeCache, `ahrefs_kw_${target}_${date}_${limit}`, async () => {
      const r = await axios.get('https://api.ahrefs.com/v3/site-explorer/organic-keywords', {
        params: { target, date, mode: mode || 'subdomains', limit: limit || '50', select, order_by },
        headers: { Authorization: `Bearer ${AHREFS_API_KEY}` },
      })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('ahrefs', e)) }
})

app.get('/api/ahrefs/refdomains', expensiveLimiter, budgetMiddleware('ahrefs'), async (req, res) => {
  const { target, mode, limit, select, order_by } = req.query as Record<string, string>
  try {
    const data = await withCache(realtimeCache, `ahrefs_rd_${target}_${limit}`, async () => {
      const r = await axios.get('https://api.ahrefs.com/v3/site-explorer/refdomains', {
        params: { target, mode: mode || 'subdomains', limit: limit || '20', select, order_by },
        headers: { Authorization: `Bearer ${AHREFS_API_KEY}` },
      })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('ahrefs', e)) }
})

app.get('/api/ahrefs/backlinks-stats', expensiveLimiter, budgetMiddleware('ahrefs'), async (req, res) => {
  const { target, mode } = req.query as Record<string, string>
  try {
    const data = await withCache(realtimeCache, `ahrefs_bl_${target}`, async () => {
      const r = await axios.get('https://api.ahrefs.com/v3/site-explorer/backlinks-stats', {
        params: { target, mode: mode || 'subdomains' }, headers: { Authorization: `Bearer ${AHREFS_API_KEY}` },
      })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('ahrefs', e)) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// SEMRUSH ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

function parseSemrushCSV(csv: string): Record<string, string>[] {
  const lines = csv.split('\n').filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(';')
  return lines.slice(1).map(line => {
    const values = line.split(';')
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = values[i] })
    return obj
  })
}

app.get('/api/semrush/domain-overview', expensiveLimiter, budgetMiddleware('semrush'), async (req, res) => {
  const { domain } = req.query as Record<string, string>
  const pack = marketFromRequest(req, domain)
  try {
    const data = await withCache(realtimeCache, `semrush_overview_${domain}_${pack.semrushDatabase}`, async () => {
      const r = await axios.get('https://api.semrush.com/', {
        params: { type: 'domain_ranks', key: SEMRUSH_API_KEY, domain, database: pack.semrushDatabase, export_columns: 'Dn,Rk,Or,Ot,Oc,Ad,At,Ac' },
      })
      const rows = parseSemrushCSV(r.data)
      return rows[0] || null
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('semrush', e)) }
})

app.get('/api/semrush/competitors', expensiveLimiter, budgetMiddleware('semrush'), async (req, res) => {
  const { domain } = req.query as Record<string, string>
  const pack = marketFromRequest(req, domain)
  try {
    const data = await withCache(historicalCache, `semrush_competitors_${domain}_${pack.semrushDatabase}`, async () => {
      const r = await axios.get('https://api.semrush.com/', {
        params: { type: 'domain_organic_organic', key: SEMRUSH_API_KEY, domain, database: pack.semrushDatabase, display_limit: 10, export_columns: 'Dn,Cr,Np,Or,Ot,Oc,Ad' },
      })
      return parseSemrushCSV(r.data)
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('semrush', e)) }
})

app.get('/api/semrush/keyword-overview', expensiveLimiter, budgetMiddleware('semrush'), async (req, res) => {
  const { keyword, database } = req.query as Record<string, string>
  const pack = resolveMarket({ override: database || null, market: (req.query as any).market })
  try {
    const db = database || pack.semrushDatabase
    const data = await withCache(historicalCache, `semrush_kw_${keyword}_${db}`, async () => {
      const r = await axios.get('https://api.semrush.com/', {
        params: { type: 'phrase_this', key: SEMRUSH_API_KEY, phrase: keyword, database: db, export_columns: 'Ph,Nq,Cp,Co,Nr,Td' },
      })
      const rows = parseSemrushCSV(r.data)
      return rows[0] || null
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('semrush', e)) }
})

app.get('/api/semrush/domain-keywords', expensiveLimiter, budgetMiddleware('semrush'), async (req, res) => {
  const { domain, limit } = req.query as Record<string, string>
  const pack = marketFromRequest(req, domain)
  try {
    const data = await withCache(realtimeCache, `semrush_dkw_${domain}_${pack.semrushDatabase}_${limit}`, async () => {
      const r = await axios.get('https://api.semrush.com/', {
        params: { type: 'domain_organic', key: SEMRUSH_API_KEY, domain, database: pack.semrushDatabase, display_limit: limit || 50, export_columns: 'Ph,Po,Pp,Nq,Cp,Co,Kd,Ur,Tr,Tc,Nr,Td' },
      })
      return parseSemrushCSV(r.data)
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('semrush', e)) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// DATAFORSEO ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/dataforseo/serp', expensiveLimiter, budgetMiddleware('dataforseo'), async (req, res) => {
  const { keyword, location_code, language_code, domain } = req.body || {}
  const pack = marketFromRequest(req, domain)
  const loc = location_code || pack.dfsLocationCode
  const lang = language_code || pack.dfsLanguageCode
  try {
    const data = await withCache(realtimeCache, `dfs_serp_${keyword}_${loc}_${lang}`, async () => {
      const r = await axios.post('https://api.dataforseo.com/v3/serp/google/organic/live/advanced',
        [{ keyword, location_code: loc, language_code: lang, depth: 10 }],
        { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' } })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('dataforseo', e)) }
})

app.post('/api/dataforseo/onpage', expensiveLimiter, budgetMiddleware('dataforseo'), async (req, res) => {
  const { target, max_crawl_pages } = req.body
  try {
    const data = await withCache(historicalCache, `dfs_onpage_${target}`, async () => {
      const taskRes = await axios.post('https://api.dataforseo.com/v3/on_page/task_post',
        [{ target, max_crawl_pages: max_crawl_pages || 10, load_resources: true, enable_javascript: false }],
        { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' } })
      const taskId = taskRes.data?.tasks?.[0]?.id
      if (!taskId) throw new Error('No task ID returned')
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 5000))
        const statusRes = await axios.get(`https://api.dataforseo.com/v3/on_page/summary/${taskId}`,
          { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}` } })
        if (statusRes.data?.tasks?.[0]?.status_code === 20000) {
          const pagesRes = await axios.get(`https://api.dataforseo.com/v3/on_page/pages/${taskId}`,
            { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}` } })
          return { summary: statusRes.data, pages: pagesRes.data }
        }
      }
      throw new Error('On-page audit timed out')
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('dataforseo', e)) }
})

app.post('/api/dataforseo/backlinks', expensiveLimiter, budgetMiddleware('dataforseo'), async (req, res) => {
  const { target, limit } = req.body
  try {
    const data = await withCache(realtimeCache, `dfs_bl_${target}_${limit}`, async () => {
      const r = await axios.post('https://api.dataforseo.com/v3/backlinks/backlinks/live',
        [{ target, limit: limit || 50, order_by: ['rank,desc'], filters: ['dofollow,=,true'] }],
        { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' } })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('dataforseo', e)) }
})

app.post('/api/dataforseo/domain-summary', expensiveLimiter, budgetMiddleware('dataforseo'), async (req, res) => {
  const { target } = req.body
  try {
    const data = await withCache(realtimeCache, `dfs_domain_${target}`, async () => {
      const r = await axios.post('https://api.dataforseo.com/v3/backlinks/domain_pages_summary/live',
        [{ target, include_subdomains: true }],
        { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' } })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('dataforseo', e)) }
})

app.post('/api/dataforseo/ranked-keywords', expensiveLimiter, budgetMiddleware('dataforseo'), async (req, res) => {
  const { target, limit } = req.body || {}
  const pack = marketFromRequest(req, target)
  try {
    const data = await withCache(realtimeCache, `dfs_rkw_${target}_${pack.code}_${limit}`, async () => {
      const r = await axios.post('https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live',
        [{ target, language_name: pack.dfsLanguageName, location_code: pack.dfsLocationCode, limit: limit || 50 }],
        { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' } })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('dataforseo', e)) }
})

app.post('/api/dataforseo/competitors', expensiveLimiter, budgetMiddleware('dataforseo'), async (req, res) => {
  const { target, limit } = req.body || {}
  const pack = marketFromRequest(req, target)
  try {
    const data = await withCache(historicalCache, `dfs_comp_${target}_${pack.code}_${limit}`, async () => {
      const r = await axios.post('https://api.dataforseo.com/v3/dataforseo_labs/google/competitors_domain/live',
        [{ target, language_name: pack.dfsLanguageName, location_code: pack.dfsLocationCode, limit: limit || 10 }],
        { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' } })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('dataforseo', e)) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// PAGESPEED INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/pagespeed', async (req, res) => {
  const { url, strategy } = req.query as Record<string, string>
  try {
    const data = await withCache(realtimeCache, `psi_${url}_${strategy || 'mobile'}`, async () => {
      const r = await axios.get('https://www.googleapis.com/pagespeedonline/v5/runPagespeed', {
        params: { url, strategy: strategy || 'mobile', key: PAGESPEED_API_KEY, category: ['performance', 'accessibility', 'best-practices', 'seo'] },
      })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('pagespeed', e)) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// GTMETRIX
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/gtmetrix/test', expensiveLimiter, budgetMiddleware('gtmetrix'), async (req, res) => {
  const { url } = req.body
  try {
    const data = await withCache(realtimeCache, `gtm_${url}`, async () => {
      const auth = Buffer.from(`${GTMETRIX_EMAIL}:${GTMETRIX_API_KEY}`).toString('base64')
      const createRes = await axios.post('https://gtmetrix.com/api/2.0/tests',
        { data: { type: 'test', attributes: { url } } },
        { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/vnd.api+json' } })
      const testId = createRes.data?.data?.id
      if (!testId) throw new Error('No test ID')
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 5000))
        const statusRes = await axios.get(`https://gtmetrix.com/api/2.0/tests/${testId}`,
          { headers: { Authorization: `Basic ${auth}` } })
        const state = statusRes.data?.data?.attributes?.state
        if (state === 'completed') return statusRes.data
        if (state === 'error') throw new Error('GTmetrix test failed')
      }
      throw new Error('GTmetrix test timed out')
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('gtmetrix', e)) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// EXA SEARCH (MCP equivalent — semantic web search)
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/exa/search', expensiveLimiter, budgetMiddleware('exa'), async (req, res) => {
  const { query, numResults, type } = req.body
  try {
    const data = await withCache(historicalCache, `exa_search_${query}_${numResults}`, async () => {
      const r = await axios.post('https://api.exa.ai/search', {
        query,
        numResults: numResults || 10,
        type: type || 'auto',
        contents: { text: { maxCharacters: 500 }, highlights: { numSentences: 3 } },
      }, { headers: { 'x-api-key': EXA_API_KEY, 'Content-Type': 'application/json' } })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('exa', e)) }
})

app.post('/api/exa/find-similar', expensiveLimiter, budgetMiddleware('exa'), async (req, res) => {
  const { url, numResults } = req.body
  try {
    const data = await withCache(historicalCache, `exa_similar_${url}_${numResults}`, async () => {
      const r = await axios.post('https://api.exa.ai/findSimilar', {
        url,
        numResults: numResults || 10,
        contents: { text: { maxCharacters: 300 }, highlights: { numSentences: 2 } },
      }, { headers: { 'x-api-key': EXA_API_KEY, 'Content-Type': 'application/json' } })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('exa', e)) }
})

app.post('/api/exa/contents', expensiveLimiter, budgetMiddleware('exa'), async (req, res) => {
  const { urls } = req.body
  try {
    const data = await withCache(historicalCache, `exa_contents_${urls?.join(',')}`, async () => {
      const r = await axios.post('https://api.exa.ai/contents', {
        ids: urls,
        text: { maxCharacters: 2000 },
        highlights: { numSentences: 5 },
      }, { headers: { 'x-api-key': EXA_API_KEY, 'Content-Type': 'application/json' } })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('exa', e)) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// BROWSERLESS (MCP equivalent — scraping + Lighthouse)
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/browserless/scrape', expensiveLimiter, budgetMiddleware('browserless'), async (req, res) => {
  const { url } = req.body
  try {
    const data = await withCache(realtimeCache, `bl_scrape_${url}`, async () => {
      if (!BROWSERLESS_API_KEY) throw new Error('Browserless API key not configured')
      const r = await axios.post(`https://chrome.browserless.io/scrape?token=${BROWSERLESS_API_KEY}`, {
        url,
        elements: [
          { selector: 'title' },
          { selector: 'meta[name="description"]' },
          { selector: 'h1' },
          { selector: 'h2' },
          { selector: 'a[href]' },
          { selector: 'img[alt]' },
        ],
      }, { timeout: 30000 })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('browserless', e)) }
})

app.post('/api/browserless/lighthouse', expensiveLimiter, budgetMiddleware('browserless'), async (req, res) => {
  const { url, categories } = req.body
  try {
    const data = await withCache(realtimeCache, `bl_lh_${url}`, async () => {
      if (!BROWSERLESS_API_KEY) throw new Error('Browserless API key not configured')
      const r = await axios.post(`https://chrome.browserless.io/performance?token=${BROWSERLESS_API_KEY}`, {
        url,
        config: {
          extends: 'lighthouse:default',
          settings: {
            onlyCategories: categories || ['performance', 'accessibility', 'best-practices', 'seo'],
          },
        },
      }, { timeout: 60000 })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('browserless', e)) }
})

app.post('/api/browserless/screenshot', expensiveLimiter, budgetMiddleware('browserless'), async (req, res) => {
  const { url } = req.body
  try {
    const data = await withCache(realtimeCache, `bl_ss_${url}`, async () => {
      if (!BROWSERLESS_API_KEY) throw new Error('Browserless API key not configured')
      const r = await axios.post(`https://chrome.browserless.io/screenshot?token=${BROWSERLESS_API_KEY}`, {
        url,
        options: { fullPage: false, type: 'png' },
        viewport: { width: 1440, height: 900 },
      }, { timeout: 30000, responseType: 'arraybuffer' })
      return `data:image/png;base64,${Buffer.from(r.data).toString('base64')}`
    })
    res.json({ screenshot: data })
  } catch (e: any) { res.json(providerUnavailable('browserless', e)) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// THORBIT (MCP equivalent — content optimization)
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/thorbit/analyze', expensiveLimiter, budgetMiddleware('thorbit'), async (req, res) => {
  const { url, keyword } = req.body
  try {
    const data = await withCache(historicalCache, `thorbit_${url}_${keyword}`, async () => {
      if (!THORBIT_API_KEY) throw new Error('Thorbit API key not configured')
      const r = await axios.post('https://api.thorbit.com/v1/content/analyze', {
        url, keyword,
      }, { headers: { Authorization: `Bearer ${THORBIT_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('thorbit', e)) }
})

app.post('/api/thorbit/suggestions', expensiveLimiter, budgetMiddleware('thorbit'), async (req, res) => {
  const { content, keyword } = req.body
  try {
    const data = await withCache(historicalCache, `thorbit_sug_${keyword}`, async () => {
      if (!THORBIT_API_KEY) throw new Error('Thorbit API key not configured')
      const r = await axios.post('https://api.thorbit.com/v1/content/suggestions', {
        content: content?.slice(0, 5000), keyword,
      }, { headers: { Authorization: `Bearer ${THORBIT_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('thorbit', e)) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// SE RANKING
// ═══════════════════════════════════════════════════════════════════════════════

async function serankingSafeGet(
  domain: string,
  resource: 'overview' | 'keywords' | 'competitors',
  limit?: string,
  marketPack?: ReturnType<typeof resolveMarket>,
) {
  const pack = marketPack || resolveMarket({ domain })
  const url = serankingResearchUrl(pack, resource)
  try {
    const r = await axios.get(url, {
      params: resource === 'keywords' ? { domain, limit: limit || 50 } : { domain },
      headers: { Authorization: `Token ${SE_RANKING_API}` },
      timeout: 12000,
      validateStatus: (s) => s < 500,
    })
    if (r.status === 403 || r.status === 401 || r.status === 402 || r.status === 429) {
      return {
        ok: false,
        provider: 'seranking',
        state: 'soft_degraded' as const,
        softDegraded: true,
        httpStatus: r.status,
        market: pack.code,
        message: `SE Ranking research ${resource} unavailable (HTTP ${r.status}) — other providers still used`,
        data: null,
        fetchedAt: new Date().toISOString(),
      }
    }
    if (r.status >= 400) throw new Error(`HTTP ${r.status}`)
    return { ok: true, provider: 'seranking', state: 'live' as const, market: pack.code, data: r.data, fetchedAt: new Date().toISOString() }
  } catch (e: any) {
    return { ...providerUnavailable('seranking', e), market: pack.code, data: null }
  }
}

app.get('/api/seranking/domain', expensiveLimiter, budgetMiddleware('seranking'), async (req, res) => {
  const { domain } = req.query as Record<string, string>
  const pack = marketFromRequest(req, domain)
  try {
    const data = await withCache(realtimeCache, `ser_domain_${domain}_${pack.serankingRegion}`, async () => {
      return serankingSafeGet(domain, 'overview', undefined, pack)
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('seranking', e)) }
})

app.get('/api/seranking/keywords', expensiveLimiter, budgetMiddleware('seranking'), async (req, res) => {
  const { domain, limit } = req.query as Record<string, string>
  const pack = marketFromRequest(req, domain)
  try {
    const data = await withCache(realtimeCache, `ser_kw_${domain}_${pack.serankingRegion}_${limit}`, async () => {
      return serankingSafeGet(domain, 'keywords', limit, pack)
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('seranking', e)) }
})

app.get('/api/seranking/competitors', expensiveLimiter, budgetMiddleware('seranking'), async (req, res) => {
  const { domain } = req.query as Record<string, string>
  const pack = marketFromRequest(req, domain)
  try {
    const data = await withCache(historicalCache, `ser_comp_${domain}_${pack.serankingRegion}`, async () => {
      return serankingSafeGet(domain, 'competitors', undefined, pack)
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('seranking', e)) }
})

app.get('/api/seranking/backlinks', expensiveLimiter, budgetMiddleware('seranking'), async (req, res) => {
  const { domain } = req.query as Record<string, string>
  try {
    const data = await withCache(realtimeCache, `ser_bl_${domain}`, async () => {
      const r = await axios.get('https://api4.seranking.com/backlinks/info/', {
        params: { domain }, headers: { Authorization: `Token ${SE_RANKING_API}` }, timeout: 12000, validateStatus: (s) => s < 500,
      })
      if (r.status === 403 || r.status === 401 || r.status === 402 || r.status === 429) {
        return {
          ok: false,
          provider: 'seranking',
          state: 'soft_degraded',
          softDegraded: true,
          httpStatus: r.status,
          message: `SE Ranking backlinks unavailable (HTTP ${r.status})`,
          data: null,
          fetchedAt: new Date().toISOString(),
        }
      }
      if (r.status >= 400) throw new Error(`HTTP ${r.status}`)
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.json(providerUnavailable('seranking', e)) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// AGGREGATED MULTI-SOURCE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// Overview: combines ALL sources (market-aware + snapshot cache fallback)
app.get('/api/overview', expensiveLimiter, async (req, res) => {
  const { domain, refresh } = req.query as Record<string, string>
  const pack = marketFromRequest(req, domain)
  const forceRefresh = refresh === '1' || refresh === 'true'
  if (!forceRefresh) {
    const cached = await loadSnapshotPayload(domain, 'overview')
    if (cached?.data && Object.keys(cached.data.sources || {}).length > 0) {
      return res.json({ ...cached.data, domain, market: pack, dataState: 'cached', fetchedAt: cached.fetchedAt, fromSnapshot: true })
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const result: Record<string, any> = {
    domain,
    market: pack,
    sources: {},
    activeSources: [] as string[],
    softDegraded: [] as string[],
    dataState: 'live',
    fetchedAt: new Date().toISOString(),
  }

  const calls = await Promise.allSettled([
    axios.get('https://api.ahrefs.com/v3/site-explorer/domain-rating', {
      params: { target: domain, date: today }, headers: { Authorization: `Bearer ${AHREFS_API_KEY}` }, timeout: 10000,
    }),
    axios.get('https://api.ahrefs.com/v3/site-explorer/metrics', {
      params: { target: domain, date: today, mode: 'subdomains' }, headers: { Authorization: `Bearer ${AHREFS_API_KEY}` }, timeout: 10000,
    }),
    axios.get('https://api.semrush.com/', {
      params: { type: 'domain_ranks', key: SEMRUSH_API_KEY, domain, database: pack.semrushDatabase, export_columns: 'Dn,Rk,Or,Ot,Oc,Ad,At,Ac' }, timeout: 10000,
    }),
    axios.post('https://api.dataforseo.com/v3/backlinks/domain_pages_summary/live',
      [{ target: domain, include_subdomains: true }],
      { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' }, timeout: 10000 }),
    SE_RANKING_API ? serankingSafeGet(domain, 'overview', undefined, pack) : Promise.reject('No API key'),
    EXA_API_KEY ? axios.post('https://api.exa.ai/findSimilar', {
      url: `https://${domain}`, numResults: 5,
      contents: { text: { maxCharacters: 200 } },
    }, { headers: { 'x-api-key': EXA_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 }) : Promise.reject('No API key'),
  ])

  const [ahrefsDR, ahrefsMetrics, semrush, dataforseo, seranking, exa] = calls

  if (ahrefsDR.status === 'fulfilled') {
    result.sources.ahrefs = { domainRating: ahrefsDR.value.data }
    if (ahrefsMetrics.status === 'fulfilled') result.sources.ahrefs.metrics = ahrefsMetrics.value.data
    result.activeSources.push('Ahrefs')
  }
  if (semrush.status === 'fulfilled') {
    const rows = parseSemrushCSV(semrush.value.data)
    if (rows[0]) { result.sources.semrush = rows[0]; result.activeSources.push('SEMrush') }
  }
  if (dataforseo.status === 'fulfilled') {
    result.sources.dataforseo = dataforseo.value.data?.tasks?.[0]?.result?.[0]
    if (result.sources.dataforseo) result.activeSources.push('DataForSEO')
  }
  if (seranking.status === 'fulfilled') {
    const ser = seranking.value as any
    if (ser?.softDegraded || ser?.state === 'soft_degraded') {
      result.sources.seranking = ser
      result.softDegraded.push('SE Ranking')
    } else if (ser?.ok === false) {
      result.sources.seranking = ser
      result.softDegraded.push('SE Ranking')
    } else {
      result.sources.seranking = ser?.data ?? ser
      result.activeSources.push('SE Ranking')
    }
  }
  if (exa.status === 'fulfilled') {
    result.sources.exa = { similarSites: exa.value.data?.results?.slice(0, 5) }
    result.activeSources.push('Exa')
  }

  if (result.activeSources.length) {
    void persistSnapshot(domain, 'overview', result)
    if (result.sources.ahrefs) void persistSnapshot(domain, 'ahrefs', result.sources.ahrefs)
    if (result.sources.semrush) void persistSnapshot(domain, 'semrush', result.sources.semrush)
    if (result.sources.dataforseo) void persistSnapshot(domain, 'dataforseo', result.sources.dataforseo)
  }

  res.json(result)
})

// Aggregated keywords from multiple sources
app.get('/api/keywords/aggregated', expensiveLimiter, async (req, res) => {
  const { domain, limit, refresh } = req.query as Record<string, string>
  const pack = marketFromRequest(req, domain)
  const forceRefresh = refresh === '1' || refresh === 'true'
  if (!forceRefresh) {
    const cached = await loadSnapshotPayload(domain, 'keywords_agg')
    if (cached?.data && Object.keys(cached.data.sources || {}).length > 0) {
      return res.json({ ...cached.data, domain, market: pack, dataState: 'cached', fetchedAt: cached.fetchedAt, fromSnapshot: true })
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const result: Record<string, any> = {
    domain,
    market: pack,
    sources: {},
    activeSources: [] as string[],
    softDegraded: [] as string[],
    dataState: 'live',
    fetchedAt: new Date().toISOString(),
  }

  const calls = await Promise.allSettled([
    axios.get('https://api.ahrefs.com/v3/site-explorer/organic-keywords', {
      params: { target: domain, date: today, mode: 'subdomains', limit: limit || '50' },
      headers: { Authorization: `Bearer ${AHREFS_API_KEY}` }, timeout: 10000,
    }),
    axios.get('https://api.semrush.com/', {
      params: { type: 'domain_organic', key: SEMRUSH_API_KEY, domain, database: pack.semrushDatabase, display_limit: limit || 50, export_columns: 'Ph,Po,Pp,Nq,Cp,Co,Kd,Ur,Tr,Tc,Nr,Td' },
      timeout: 10000,
    }),
    axios.post('https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live',
      [{ target: domain, language_name: pack.dfsLanguageName, location_code: pack.dfsLocationCode, limit: Number(limit) || 50 }],
      { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' }, timeout: 10000 }),
    SE_RANKING_API ? serankingSafeGet(domain, 'keywords', limit, pack) : Promise.reject('No API key'),
  ])

  const [ahrefs, semrush, dataforseo, seranking] = calls
  if (ahrefs.status === 'fulfilled') { result.sources.ahrefs = ahrefs.value.data; result.activeSources.push('Ahrefs') }
  if (semrush.status === 'fulfilled') { result.sources.semrush = parseSemrushCSV(semrush.value.data); result.activeSources.push('SEMrush') }
  if (dataforseo.status === 'fulfilled') { result.sources.dataforseo = dataforseo.value.data; result.activeSources.push('DataForSEO') }
  if (seranking.status === 'fulfilled') {
    const ser = seranking.value as any
    if (ser?.softDegraded || ser?.state === 'soft_degraded' || ser?.ok === false) {
      result.sources.seranking = ser
      result.softDegraded.push('SE Ranking')
    } else {
      result.sources.seranking = ser?.data ?? ser
      result.activeSources.push('SE Ranking')
    }
  }

  const keywords = mergeKeywordRows([
    keywordsFromSemrush(result.sources.semrush),
    keywordsFromAhrefs(result.sources.ahrefs),
    keywordsFromDataForSEO(result.sources.dataforseo),
  ])
  result.normalized = keywords
  result.movements = keywordMovements(keywords)

  if (result.activeSources.length) void persistSnapshot(domain, 'keywords_agg', result)
  res.json(result)
})

// Aggregated backlinks from multiple sources
app.get('/api/backlinks/aggregated', expensiveLimiter, async (req, res) => {
  const { domain, refresh } = req.query as Record<string, string>
  const pack = marketFromRequest(req, domain)
  const forceRefresh = refresh === '1' || refresh === 'true'
  if (!forceRefresh) {
    const cached = await loadSnapshotPayload(domain, 'backlinks_agg')
    if (cached?.data && Object.keys(cached.data.sources || {}).length > 0) {
      return res.json({ ...cached.data, domain, market: pack, dataState: 'cached', fetchedAt: cached.fetchedAt, fromSnapshot: true })
    }
  }

  const result: Record<string, any> = {
    domain,
    market: pack,
    sources: {},
    activeSources: [] as string[],
    softDegraded: [] as string[],
    dataState: 'live',
    fetchedAt: new Date().toISOString(),
  }

  const calls = await Promise.allSettled([
    axios.get('https://api.ahrefs.com/v3/site-explorer/backlinks-stats', {
      params: { target: domain, mode: 'subdomains' }, headers: { Authorization: `Bearer ${AHREFS_API_KEY}` }, timeout: 10000,
    }),
    axios.get('https://api.ahrefs.com/v3/site-explorer/refdomains', {
      params: { target: domain, mode: 'subdomains', limit: 20 }, headers: { Authorization: `Bearer ${AHREFS_API_KEY}` }, timeout: 10000,
    }),
    axios.post('https://api.dataforseo.com/v3/backlinks/domain_pages_summary/live',
      [{ target: domain, include_subdomains: true }],
      { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' }, timeout: 10000 }),
    SE_RANKING_API
      ? axios.get('https://api4.seranking.com/backlinks/info/', {
          params: { domain }, headers: { Authorization: `Token ${SE_RANKING_API}` }, timeout: 10000, validateStatus: (s) => s < 500,
        }).then((r) => {
          if (r.status === 403 || r.status === 401 || r.status === 402 || r.status === 429) {
            return { softDegraded: true, state: 'soft_degraded', httpStatus: r.status, ok: false, provider: 'seranking', data: null }
          }
          if (r.status >= 400) throw new Error(`HTTP ${r.status}`)
          return r.data
        })
      : Promise.reject('No API key'),
  ])

  const [ahrefsStats, ahrefsRD, dataforseo, seranking] = calls
  if (ahrefsStats.status === 'fulfilled') {
    result.sources.ahrefs = { stats: ahrefsStats.value.data ?? ahrefsStats.value }
    if (ahrefsRD.status === 'fulfilled') result.sources.ahrefs.refdomains = ahrefsRD.value.data
    result.activeSources.push('Ahrefs')
  }
  if (dataforseo.status === 'fulfilled') {
    result.sources.dataforseo = dataforseo.value.data?.tasks?.[0]?.result?.[0]
    if (result.sources.dataforseo) result.activeSources.push('DataForSEO')
  }
  if (seranking.status === 'fulfilled') {
    const ser = seranking.value as any
    if (ser?.softDegraded || ser?.state === 'soft_degraded') {
      result.sources.seranking = ser
      result.softDegraded.push('SE Ranking')
    } else {
      result.sources.seranking = ser
      result.activeSources.push('SE Ranking')
    }
  }

  if (result.activeSources.length) void persistSnapshot(domain, 'backlinks_agg', result)
  res.json(result)
})

// Aggregated vitals from multiple sources
app.post('/api/vitals/aggregated', expensiveLimiter, async (req, res) => {
  const { url } = req.body
  const result: Record<string, any> = { url, sources: {}, activeSources: [] }

  const calls = await Promise.allSettled([
    axios.get('https://www.googleapis.com/pagespeedonline/v5/runPagespeed', {
      params: { url, strategy: 'mobile', key: PAGESPEED_API_KEY, category: ['performance', 'accessibility', 'best-practices', 'seo'] }, timeout: 30000,
    }),
    axios.get('https://www.googleapis.com/pagespeedonline/v5/runPagespeed', {
      params: { url, strategy: 'desktop', key: PAGESPEED_API_KEY, category: ['performance', 'accessibility', 'best-practices', 'seo'] }, timeout: 30000,
    }),
    BROWSERLESS_API_KEY ? axios.post(`https://chrome.browserless.io/performance?token=${BROWSERLESS_API_KEY}`, {
      url, config: { extends: 'lighthouse:default', settings: { onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] } },
    }, { timeout: 60000 }) : Promise.reject('No API key'),
  ])

  const [psiMobile, psiDesktop, browserless] = calls
  if (psiMobile.status === 'fulfilled') {
    result.sources.pagespeed = { mobile: psiMobile.value.data }
    if (psiDesktop.status === 'fulfilled') result.sources.pagespeed.desktop = psiDesktop.value.data
    result.activeSources.push('PageSpeed')
  }
  if (browserless.status === 'fulfilled') {
    result.sources.browserless = browserless.value.data
    result.activeSources.push('Browserless')
  }

  res.json(result)
})

// Aggregated competitors from multiple sources
app.get('/api/competitors/aggregated', expensiveLimiter, async (req, res) => {
  const { domain, refresh } = req.query as Record<string, string>
  const pack = marketFromRequest(req, domain)
  const forceRefresh = refresh === '1' || refresh === 'true'
  if (!forceRefresh) {
    const cached = await loadSnapshotPayload(domain, 'competitors_agg')
    if (cached?.data && Object.keys(cached.data.sources || {}).length > 0) {
      return res.json({ ...cached.data, domain, market: pack, dataState: 'cached', fetchedAt: cached.fetchedAt, fromSnapshot: true })
    }
  }

  const result: Record<string, any> = {
    domain,
    market: pack,
    sources: {},
    activeSources: [] as string[],
    softDegraded: [] as string[],
    dataState: 'live',
    fetchedAt: new Date().toISOString(),
  }

  const calls = await Promise.allSettled([
    axios.get('https://api.semrush.com/', {
      params: { type: 'domain_organic_organic', key: SEMRUSH_API_KEY, domain, database: pack.semrushDatabase, display_limit: 10, export_columns: 'Dn,Cr,Np,Or,Ot,Oc,Ad' },
      timeout: 10000,
    }),
    axios.post('https://api.dataforseo.com/v3/dataforseo_labs/google/competitors_domain/live',
      [{ target: domain, language_name: pack.dfsLanguageName, location_code: pack.dfsLocationCode, limit: 10 }],
      { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' }, timeout: 10000 }),
    SE_RANKING_API ? serankingSafeGet(domain, 'competitors', undefined, pack) : Promise.reject('No API key'),
    EXA_API_KEY ? axios.post('https://api.exa.ai/findSimilar', {
      url: `https://${domain}`, numResults: 10,
      contents: { text: { maxCharacters: 300 }, highlights: { numSentences: 2 } },
    }, { headers: { 'x-api-key': EXA_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 }) : Promise.reject('No API key'),
  ])

  const [semrush, dataforseo, seranking, exa] = calls
  if (semrush.status === 'fulfilled') { result.sources.semrush = parseSemrushCSV(semrush.value.data); result.activeSources.push('SEMrush') }
  if (dataforseo.status === 'fulfilled') { result.sources.dataforseo = dataforseo.value.data; result.activeSources.push('DataForSEO') }
  if (seranking.status === 'fulfilled') {
    const ser = seranking.value as any
    if (ser?.softDegraded || ser?.state === 'soft_degraded' || ser?.ok === false) {
      result.sources.seranking = ser
      result.softDegraded.push('SE Ranking')
    } else {
      result.sources.seranking = ser?.data ?? ser
      result.activeSources.push('SE Ranking')
    }
  }
  if (exa.status === 'fulfilled') { result.sources.exa = exa.value.data?.results; result.activeSources.push('Exa') }

  const competitors = mergeCompetitors([
    competitorsFromSemrush(result.sources.semrush),
    competitorsFromDataForSEO(result.sources.dataforseo),
    competitorsFromExa(result.sources.exa),
  ])
  result.normalized = competitors

  // Prefer keyword inventory from keywords snapshot when available for better gap estimates
  let ourKeywords: KeywordRow[] = []
  try {
    const kwSnap = await loadSnapshotPayload(domain, 'keywords_agg')
    if (Array.isArray(kwSnap?.data?.normalized)) {
      ourKeywords = kwSnap.data.normalized as KeywordRow[]
    }
  } catch {
    ourKeywords = []
  }
  result.gaps = computeCompetitorGaps(ourKeywords, competitors)

  if (result.activeSources.length) void persistSnapshot(domain, 'competitors_agg', result)
  res.json(result)
})

// Content analysis — Exa competitive content + Thorbit
app.post('/api/content/analyze', expensiveLimiter, async (req, res) => {
  const { domain, keyword } = req.body
  const result: Record<string, any> = { domain, keyword, sources: {}, activeSources: [] }

  const calls = await Promise.allSettled([
    EXA_API_KEY ? axios.post('https://api.exa.ai/search', {
      query: `${keyword} site:${domain}`, numResults: 5,
      contents: { text: { maxCharacters: 500 }, highlights: { numSentences: 3 } },
    }, { headers: { 'x-api-key': EXA_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 }) : Promise.reject('No API key'),
    EXA_API_KEY ? axios.post('https://api.exa.ai/search', {
      query: `best content about ${keyword}`, numResults: 10,
      contents: { text: { maxCharacters: 300 }, highlights: { numSentences: 2 } },
    }, { headers: { 'x-api-key': EXA_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 }) : Promise.reject('No API key'),
    THORBIT_API_KEY ? axios.post('https://api.thorbit.com/v1/content/analyze', {
      url: `https://${domain}`, keyword,
    }, { headers: { Authorization: `Bearer ${THORBIT_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 }) : Promise.reject('No API key'),
  ])

  const [exaOwn, exaCompetitive, thorbit] = calls
  if (exaOwn.status === 'fulfilled') { result.sources.exa = { ownContent: exaOwn.value.data?.results }; result.activeSources.push('Exa') }
  if (exaCompetitive.status === 'fulfilled') {
    if (!result.sources.exa) result.sources.exa = {}
    result.sources.exa.competitiveContent = exaCompetitive.value.data?.results
  }
  if (thorbit.status === 'fulfilled') { result.sources.thorbit = thorbit.value.data; result.activeSources.push('Thorbit') }

  res.json(result)
})

// Alerts — aggregated from all sources
app.get('/api/alerts/aggregated', expensiveLimiter, async (req, res) => {
  const { domain } = req.query as Record<string, string>
  const alerts: any[] = []

  // Generate alerts from available data
  const calls = await Promise.allSettled([
    axios.get('https://api.ahrefs.com/v3/site-explorer/metrics', {
      params: { target: domain, date: new Date().toISOString().split('T')[0], mode: 'subdomains' },
      headers: { Authorization: `Bearer ${AHREFS_API_KEY}` }, timeout: 10000,
    }),
    PAGESPEED_API_KEY ? axios.get('https://www.googleapis.com/pagespeedonline/v5/runPagespeed', {
      params: { url: `https://${domain}`, strategy: 'mobile', key: PAGESPEED_API_KEY, category: ['performance'] }, timeout: 30000,
    }) : Promise.reject('No key'),
  ])

  const [ahrefsMetrics, pagespeed] = calls

  if (ahrefsMetrics.status === 'fulfilled') {
    const m = ahrefsMetrics.value.data?.metrics
    if (m?.org_traffic === 0) alerts.push({ severity: 'warning', source: 'Ahrefs', module: 'Traffic', message: 'No organic traffic detected', timestamp: new Date().toISOString() })
    if (m?.org_keywords === 0) alerts.push({ severity: 'info', source: 'Ahrefs', module: 'Keywords', message: 'No organic keywords ranking', timestamp: new Date().toISOString() })
  }

  if (pagespeed.status === 'fulfilled') {
    const perf = pagespeed.value.data?.lighthouseResult?.categories?.performance?.score
    if (perf !== undefined && perf < 0.5) alerts.push({ severity: 'critical', source: 'PageSpeed', module: 'Vitals', message: `Performance score is ${Math.round(perf * 100)}/100 — needs improvement`, timestamp: new Date().toISOString() })
    else if (perf !== undefined && perf < 0.9) alerts.push({ severity: 'warning', source: 'PageSpeed', module: 'Vitals', message: `Performance score is ${Math.round(perf * 100)}/100`, timestamp: new Date().toISOString() })
  }

  if (ahrefsMetrics.status === 'rejected') alerts.push({ severity: 'info', source: 'System', module: 'API', message: 'Ahrefs API returned an error — data may be incomplete', timestamp: new Date().toISOString() })
  if (pagespeed.status === 'rejected') alerts.push({ severity: 'info', source: 'System', module: 'API', message: 'PageSpeed API unavailable — vitals data incomplete', timestamp: new Date().toISOString() })

  const rawPerformanceScore = pagespeed.status === 'fulfilled'
    ? pagespeed.value.data?.lighthouseResult?.categories?.performance?.score
    : null

  const ruleAlerts = generateAlerts({
    domain,
    organicTraffic: ahrefsMetrics.status === 'fulfilled' ? ahrefsMetrics.value.data?.metrics?.org_traffic ?? null : null,
    top10Keywords: ahrefsMetrics.status === 'fulfilled' ? ahrefsMetrics.value.data?.metrics?.org_keywords_1_10 ?? null : null,
    performanceScore: typeof rawPerformanceScore === 'number' ? Math.round(rawPerformanceScore * 100) : null,
    providerErrors: [
      ahrefsMetrics.status === 'rejected' ? { provider: 'Ahrefs', errorClass: 'network' } : null,
      pagespeed.status === 'rejected' ? { provider: 'PageSpeed', errorClass: 'network' } : null,
    ].filter(Boolean) as Array<{ provider: string; errorClass: string }>,
  }).map(alert => ({
    ...alert,
    source: 'Rules Engine',
    message: alert.detail,
    description: alert.detail,
    time: 'now',
    timestamp: new Date(alert.createdAt).getTime(),
    status: 'unread',
  }))

  const activeSources = [
    ahrefsMetrics.status === 'fulfilled' ? 'Ahrefs' : null,
    pagespeed.status === 'fulfilled' ? 'PageSpeed' : null,
    'Rules Engine',
  ].filter(Boolean)

  res.json({ alerts: [...ruleAlerts, ...alerts], activeSources })
})

const seedProjects: SeedProject[] = [
  { id: 'maximo', clientId: 'client-maximo', clientName: 'Maximo SEO', name: 'Maximo SEO', domain: 'maximo-seo.ai', market: 'Israel / Global', status: 'active', priority: 'primary' },
  { id: 'galoz', clientId: 'client-galoz', clientName: 'Galoz', name: 'Galoz', domain: 'galoz.co.il', market: 'Israel', status: 'ready', priority: 'high' },
]

type ProjectListResult = {
  projects: ReturnType<typeof buildProjectSummaries>
  source: 'supabase' | 'local-seed' | 'empty'
  fetchedAt: string
  warning?: string
}

function normalizeProjectStatus(value: unknown): ProjectStatus {
  const status = String(value || '').toLowerCase()
  return ['active', 'ready', 'planned', 'paused', 'archived'].includes(status) ? status as ProjectStatus : 'active'
}

function normalizeProjectPriority(value: unknown): ProjectPriority {
  const priority = String(value || '').toLowerCase()
  return ['primary', 'high', 'medium', 'low'].includes(priority) ? priority as ProjectPriority : 'medium'
}

async function enrichWithSnapshotSpine(mapped: SeedProject[]): Promise<Map<string, import('./data/snapshotSpine.js').ProjectOverlay>> {
  const empty = new Map()
  if (!supabaseAdmin || mapped.length === 0) return empty

  try {
    const domainIds = mapped.map((p) => p.id)
    const domainMeta = new Map(
      mapped.map((p) => [p.id, { domain: p.domain, status: p.status, priority: p.priority }]),
    )
    const [snapshots, counts] = await Promise.all([
      loadLatestSnapshots(supabaseAdmin, domainIds),
      loadOpenCounts(supabaseAdmin, domainIds),
    ])
    return buildSnapshotOverlayMap(snapshots as any, counts.alertCounts, counts.taskCounts, domainMeta)
  } catch (err) {
    console.error('[projects] snapshot spine enrichment failed:', err)
    return empty
  }
}

async function loadProjectList(): Promise<ProjectListResult> {
  const client = supabaseAdmin || supabase
  if (client) {
    try {
      const { data, error } = await client
        .from('seo_domains')
        .select('id, client_id, domain, market, name, status, priority, screenshot_url, seo_clients(id, name)')
        .order('created_at', { ascending: true })

      if (error) {
        console.error('[projects] Supabase project load failed, falling back to local seed:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        })
      }

      if (!error && Array.isArray(data) && data.length > 0) {
        const mapped = data.map((row: any): SeedProject => {
          const clientRow = Array.isArray(row.seo_clients) ? row.seo_clients[0] : row.seo_clients
          const clientName = clientRow?.name || row.name || row.domain
          return {
            id: String(row.id || row.domain),
            clientId: String(row.client_id || clientRow?.id || row.id || row.domain),
            clientName,
            name: row.name || clientName,
            domain: row.domain,
            // IL default for this agency: empty market rows inherit domain-based resolution
            market: row.market || resolveMarket({ domain: row.domain }).label,
            status: normalizeProjectStatus(row.status),
            priority: normalizeProjectPriority(row.priority),
            screenshotUrl: row.screenshot_url || undefined,
          }
        }).filter(project => project.domain)

        if (mapped.length > 0) {
          const overlays = await enrichWithSnapshotSpine(mapped)
          const projects = buildProjectSummaries(mapped, 'supabase', overlays)
          return { projects, source: 'supabase', fetchedAt: new Date().toISOString() }
        }
      }
    } catch (err) {
      console.error('[projects] Supabase project load threw, falling back to local seed:', err)
    }
  }

  // Never ship demo/local seed domains to production operators.
  if (!ALLOW_LOCAL_SEED) {
    console.error('[projects] Supabase empty/unavailable in production — returning empty portfolio (no local seed).')
    return {
      projects: [],
      source: 'empty',
      fetchedAt: new Date().toISOString(),
      warning: 'No durable project spine. Configure SUPABASE_SERVICE_ROLE and seo_domains — demo domains are disabled in production.',
    }
  }

  const projects = buildProjectSummaries(seedProjects, 'local-seed')
  return { projects, source: 'local-seed', fetchedAt: new Date().toISOString() }
}

app.get('/api/projects', async (_req, res) => {
  const result = await loadProjectList()
  res.json(result)
})

app.post('/api/projects', async (req, res) => {
  const { name, domain, clientName, market, status, priority } = req.body
  if (!name || !domain) return res.status(400).json({ error: 'name and domain are required' })

  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')

  if (supabase) {
    try {
      // Get or create client
      let clientId: string
      const { data: existingClient } = await supabase
        .from('seo_clients')
        .select('id')
        .eq('name', clientName || name)
        .single()

      if (existingClient) {
        clientId = existingClient.id
      } else {
        const { data: newClient, error: clientErr } = await supabase
          .from('seo_clients')
          .insert({ name: clientName || name })
          .select('id')
          .single()
        if (clientErr) return res.status(500).json({ error: 'Failed to create client', details: clientErr.message })
        clientId = newClient.id
      }

      // Create domain
      const { data: newDomain, error: domainErr } = await supabase
        .from('seo_domains')
        .insert({
          client_id: clientId,
          domain: cleanDomain,
          name,
          market: market || 'Global',
          status: status || 'active',
          priority: priority || 'medium',
        })
        .select()
        .single()

      if (domainErr) return res.status(500).json({ error: 'Failed to create project', details: domainErr.message })
      return res.status(201).json({ project: newDomain, message: 'Project created' })
    } catch (err: any) {
      return res.status(500).json({ error: 'Database error', details: err.message })
    }
  }

  res.status(503).json({ error: 'Database not configured' })
})

app.get('/api/projects/:domain', async (req, res) => {
  const result = await loadProjectList()
  const project = getProjectByDomain(result.projects, decodeURIComponent(req.params.domain))
  if (!project) return res.status(404).json({ error: 'Project not found', domain: req.params.domain })
  res.json({ project, source: result.source, fetchedAt: result.fetchedAt })
})

app.get('/api/projects/:domain/summary', async (req, res) => {
  const result = await loadProjectList()
  const project = getProjectByDomain(result.projects, decodeURIComponent(req.params.domain))
  if (!project) return res.status(404).json({ error: 'Project not found', domain: req.params.domain })
  res.json({
    domain: project.domain,
    project,
    healthScore: project.healthScore,
    alertCount: project.alertCount,
    taskCount: project.taskCount,
    connectedSources: project.connectedSources,
    modules: project.modules,
    source: result.source,
    fetchedAt: result.fetchedAt,
  })
})

app.get('/api/projects/:domain/modules', async (req, res) => {
  const result = await loadProjectList()
  const project = getProjectByDomain(result.projects, decodeURIComponent(req.params.domain))
  if (!project) return res.status(404).json({ error: 'Project not found', domain: req.params.domain })
  res.json({ ...summarizeProjectModules(project), source: result.source })
})

app.get('/api/clients', async (_req, res) => {
  const result = await loadProjectList()
  res.json({
    clients: result.projects.map(project => ({
      id: project.id,
      name: project.name,
      domain: project.domain,
      market: project.market,
      status: project.status,
      priority: project.priority,
      clientName: project.clientName,
      healthScore: project.healthScore,
      alertCount: project.alertCount,
      taskCount: project.taskCount,
      dataState: project.dataState,
      lastFetchedAt: project.lastFetchedAt,
    })),
    source: result.source,
    fetchedAt: result.fetchedAt,
  })
})

app.get('/api/tasks', async (req, res) => {
  const { domain = 'maximo-seo.ai' } = req.query as Record<string, string>
  const cleanDomain = String(domain).replace(/^https?:\/\//, '').replace(/\/$/, '')

  if (supabaseAdmin) {
    try {
      const { data: domainRow } = await supabaseAdmin
        .from('seo_domains')
        .select('id, domain')
        .eq('domain', cleanDomain)
        .maybeSingle()
      if (domainRow?.id) {
        const { data: tasks } = await supabaseAdmin
          .from('seo_tasks')
          .select('id, title, status, priority, brief, acceptance_criteria, alert_id, created_at, updated_at')
          .eq('domain_id', domainRow.id)
          .order('created_at', { ascending: false })
          .limit(50)
        if (tasks && tasks.length > 0) {
          return res.json({
            tasks: tasks.map((t: any) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              priority: t.priority,
              brief: t.brief,
              acceptanceCriteria: t.acceptance_criteria || [],
              alertId: t.alert_id,
              createdAt: t.created_at,
            })),
            source: 'supabase',
            fetchedAt: new Date().toISOString(),
          })
        }
      }
    } catch (err) {
      console.error('[tasks] durable load failed', err)
    }
  }

  // Prod: never invent fake investigation tasks from synthetic alerts.
  if (IS_PROD || !ALLOW_LOCAL_SEED) {
    return res.json({
      tasks: [],
      source: 'empty',
      dataState: 'unavailable',
      message: 'No durable tasks for this domain. Run Sync spine to generate from live alerts.',
      fetchedAt: new Date().toISOString(),
    })
  }

  const seedAlerts = generateAlerts({
    domain: cleanDomain,
    previousOrganicTraffic: 1000,
    organicTraffic: 730,
    brokenPagesWithBacklinks: 1,
    performanceScore: 62,
  })
  res.json({
    tasks: seedAlerts.map(createSeoTaskFromAlert),
    source: 'rules-engine',
    dataState: 'demo',
    fetchedAt: new Date().toISOString(),
  })
})

// Task statuses (DB check): queued | working | blocked | verified
// Snooze is durable via brief tag; status temporarily blocked so crash-safe filters still work.
const taskStatusSchema = z.enum(['queued', 'working', 'blocked', 'verified'])
const taskActionSchema = z.object({
  action: z.enum(['close', 'reopen', 'snooze', 'set-status']).optional(),
  status: taskStatusSchema.optional(),
  snoozeHours: z.number().min(1).max(24 * 30).optional(),
  note: z.string().max(500).optional().nullable(),
})

app.patch('/api/tasks/:id', validateBody(taskActionSchema), async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE not configured — cannot update tasks' })
  }
  const id = String(req.params.id || '')
  if (!id || id.length < 8) return res.status(400).json({ error: 'Invalid task id' })

  const body = (req as any).validatedBody as z.infer<typeof taskActionSchema>
  const action = body.action || (body.status ? 'set-status' : 'close')

  const { data: existing, error: loadErr } = await supabaseAdmin
    .from('seo_tasks')
    .select('id, title, status, priority, brief, domain_id, updated_at, alert_id')
    .eq('id', id)
    .maybeSingle()
  if (loadErr) return res.status(500).json({ error: loadErr.message })
  if (!existing?.id) return res.status(404).json({ error: 'Task not found' })

  let nextStatus: string = body.status || existing.status
  let nextBrief = String(existing.brief || '')
  const stamp = new Date().toISOString()
  if (action === 'close') nextStatus = 'verified'
  else if (action === 'reopen') {
    nextStatus = 'queued'
    nextBrief = nextBrief.replace(/\[SNOOZED until[^\]]*\]\s*/g, '').trim()
  } else if (action === 'snooze') {
    const hours = body.snoozeHours || 24
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
    nextStatus = 'blocked'
    const tag = `[SNOOZED until ${until}]`
    nextBrief = nextBrief.includes('[SNOOZED until')
      ? nextBrief.replace(/\[SNOOZED until[^\]]*\]/, tag)
      : `${tag}\n${nextBrief}`.trim()
  } else if (action === 'set-status' && body.status) {
    nextStatus = body.status
  }

  if (body.note) {
    nextBrief = `${nextBrief}\n\nOperator note (${stamp}): ${body.note}`.trim()
  }

  const { data: updated, error: upErr } = await supabaseAdmin
    .from('seo_tasks')
    .update({ status: nextStatus, brief: nextBrief, updated_at: stamp })
    .eq('id', id)
    .select('id, title, status, priority, brief, alert_id, domain_id, created_at, updated_at')
    .single()
  if (upErr) return res.status(500).json({ error: upErr.message })

  if ((action === 'close' || nextStatus === 'verified') && updated?.alert_id) {
    await supabaseAdmin
      .from('seo_alerts')
      .update({ status: 'verified', updated_at: stamp })
      .eq('id', updated.alert_id)
      .in('status', ['open', 'assigned', 'working'])
  }

  const uiStatus =
    nextStatus === 'blocked' && String(updated?.brief || '').includes('[SNOOZED until')
      ? 'snoozed'
      : updated.status

  res.json({
    ok: true,
    task: {
      id: updated.id,
      title: updated.title,
      status: uiStatus,
      priority: updated.priority,
      brief: updated.brief,
      alertId: updated.alert_id,
      domainId: updated.domain_id,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    },
    fetchedAt: stamp,
  })
})

app.get('/api/tasks/open-portfolio', async (req, res) => {
  if (!supabaseAdmin) {
    return res.json({ tasks: [], source: 'empty', fetchedAt: new Date().toISOString() })
  }
  const limit = Math.min(Math.max(Number((req.query as any).limit || 25), 1), 100)
  // Exclude snoozed-until-future blocked rows so they leave the open queue.
  const now = new Date().toISOString()
  const { data: tasks, error } = await supabaseAdmin
    .from('seo_tasks')
    .select('id, title, status, priority, brief, alert_id, domain_id, created_at, updated_at, seo_domains(domain, name)')
    .in('status', ['queued', 'working', 'blocked'])
    .order('created_at', { ascending: false })
    .limit(Math.min(limit * 4, 200))
  if (error) return res.status(500).json({ error: error.message })

  const open = (tasks || []).filter((t: any) => {
    const brief = String(t.brief || '')
    const m = brief.match(/\[SNOOZED until ([^\]]+)\]/)
    if (!m) return t.status !== 'blocked' || !brief.includes('[SNOOZED until')
    try {
      return new Date(m[1]).getTime() <= Date.now()
    } catch {
      return true
    }
  }).slice(0, limit)

  res.json({
    tasks: open.map((t: any) => {
      const brief = String(t.brief || '')
      const snoozed = t.status === 'blocked' && brief.includes('[SNOOZED until')
      return {
        id: t.id,
        title: t.title,
        status: snoozed ? 'snoozed' : t.status,
        priority: t.priority,
        brief: t.brief,
        alertId: t.alert_id,
        domain: t.seo_domains?.domain || null,
        domainName: t.seo_domains?.name || null,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      }
    }),
    source: 'supabase',
    fetchedAt: now,
  })
})

async function sendDigestEmail(subject: string, text: string): Promise<{ ok: boolean; via: string; detail?: string }> {
  const to = process.env.DIGEST_TO || 'tomer@webs.co.il'
  const user = process.env.DIGEST_SMTP_USER || process.env.GMAIL_USER_WEBS || 'tomer@webs.co.il'
  const pass = process.env.DIGEST_SMTP_PASS || process.env.GMAIL_APP_PASSWORD_WEBS || process.env.GMAIL_APP_PASSWORD || ''
  if (!pass) {
    console.warn('[digest] no SMTP password configured — log-only')
    console.log('[digest]', subject, text.slice(0, 1500))
    return { ok: false, via: 'log-only', detail: 'SMTP password missing' }
  }
  try {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user, pass },
    })
    await transporter.sendMail({ from: `SEO Dashboard <${user}>`, to, subject, text })
    return { ok: true, via: 'gmail-smtp' }
  } catch (err: any) {
    console.error('[digest] send failed', err?.message || err)
    console.log('[digest-fallback]', subject, text.slice(0, 1500))
    return { ok: false, via: 'error', detail: err?.message || String(err) }
  }
}

async function runNightlySync(opts: { limit?: number; createTasks?: boolean; sendDigest?: boolean }) {
  if (!supabaseAdmin) throw new Error('SUPABASE_SERVICE_ROLE not configured')
  const limit = Math.min(Math.max(Number(opts.limit || 20), 1), 50)
  const createTasks = opts.createTasks !== false
  const { data: domains, error } = await supabaseAdmin
    .from('seo_domains')
    .select('id, domain, name, status')
    .eq('status', 'active')
    .order('domain', { ascending: true })
    .limit(limit)
  if (error) throw new Error(error.message)
  if (!domains?.length) throw new Error('No domains found')

  const results: any[] = []
  let alertsTotal = 0
  let tasksTotal = 0
  for (const d of domains) {
    const snaps = await loadLatestSnapshots(supabaseAdmin, [d.id], 20)
    const alerts = alertsFromSnapshotRows(d.domain, snaps as any)
    const persisted = await persistAlertsAndTasks({
      admin: supabaseAdmin,
      domainId: d.id,
      domain: d.domain,
      alerts,
      createTasks,
    })
    alertsTotal += persisted.alertsUpserted
    tasksTotal += persisted.tasksUpserted
    results.push({ domain: d.domain, alertsGenerated: alerts.length, ...persisted })
  }

  const { data: openTasks } = await supabaseAdmin
    .from('seo_tasks')
    .select('id, title, status, priority, domain_id, seo_domains(domain)')
    .in('status', ['queued', 'working', 'blocked'])
    .order('created_at', { ascending: false })
    .limit(15)

  const lines = [
    `SEO Dashboard nightly sync ${new Date().toISOString()}`,
    '',
    `Domains synced: ${results.length}`,
    `Alerts upserted: ${alertsTotal}`,
    `Tasks upserted: ${tasksTotal}`,
    '',
    `Open tasks snapshot:`,
    ...((openTasks || []).map((t: any) => `- [${t.priority}/${t.status}] ${t.seo_domains?.domain || '?'}: ${t.title}`)),
    '',
    'Dashboard: https://seo-dashboard.maximo-seo.ai',
  ]
  const digestText = lines.join('\n')
  const mail =
    opts.sendDigest === false
      ? { ok: false, via: 'skipped' }
      : await sendDigestEmail(
          `[SEO Dashboard] Nightly sync — ${results.length} domains, ${alertsTotal} alerts`,
          digestText,
        )

  return {
    ok: true,
    synced: results.length,
    alertsTotal,
    tasksTotal,
    digest: mail,
    results,
    fetchedAt: new Date().toISOString(),
  }
}

app.get('/api/cron/health', (_req, res) => {
  res.json({ ok: true, service: 'seo-dashboard-cron', time: new Date().toISOString() })
})

app.get('/api/cron/nightly-sync', expensiveLimiter, async (req, res) => {
  try {
    const limit = Number((req.query as any).limit || 20)
    const payload = await runNightlySync({ limit, createTasks: true, sendDigest: true })
    res.json(payload)
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) })
  }
})

app.post('/api/cron/nightly-sync', expensiveLimiter, async (req, res) => {
  try {
    const body = (req.body || {}) as { limit?: number; createTasks?: boolean; sendDigest?: boolean }
    const payload = await runNightlySync({
      limit: body.limit ?? Number((req.query as any).limit || 20),
      createTasks: body.createTasks !== false,
      sendDigest: body.sendDigest !== false,
    })
    res.json(payload)
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) })
  }
})


// ═══════════════════════════════════════════════════════════════════════════════
// P1/P2 Command center + Sync + Bridges
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/command-center', async (_req, res) => {
  const result = await loadProjectList()
  const projects = result.projects
  const healths = projects.map((p) => p.healthScore).filter((h): h is number => typeof h === 'number')
  const avgHealth = healths.length ? Math.round(healths.reduce((a, b) => a + b, 0) / healths.length) : null
  const openAlerts = projects.reduce((sum, p) => sum + (p.alertCount || 0), 0)
  const openTasks = projects.reduce((sum, p) => sum + (p.taskCount || 0), 0)
  const synced = projects.filter((p) => p.lastFetchedAt).length
  const stale = projects.filter((p) => {
    if (!p.lastFetchedAt) return true
    return Date.now() - new Date(p.lastFetchedAt).getTime() > 48 * 60 * 60 * 1000
  }).length
  const byStatus = projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1
    return acc
  }, {})
  const worst = [...projects]
    .filter((p) => typeof p.healthScore === 'number')
    .sort((a, b) => (a.healthScore || 0) - (b.healthScore || 0))
    .slice(0, 8)
    .map((p) => ({
      domain: p.domain,
      name: p.name,
      healthScore: p.healthScore,
      alertCount: p.alertCount,
      taskCount: p.taskCount,
      lastFetchedAt: p.lastFetchedAt,
      status: p.status,
      market: p.market,
    }))
  const hottestAlerts = [...projects]
    .filter((p) => (p.alertCount || 0) > 0)
    .sort((a, b) => (b.alertCount || 0) - (a.alertCount || 0))
    .slice(0, 8)
    .map((p) => ({ domain: p.domain, alertCount: p.alertCount, taskCount: p.taskCount, healthScore: p.healthScore }))

  // Command Center v2: surface real keyword movements + competitor gaps from snapshots (no invented demo).
  type MovementItem = { domain: string; keyword: string; position: number | null; previousPosition?: number | null; trend?: string | null; volume?: number | null; source?: string }
  type GapItem = { domain: string; competitor: string; ourMissingEstimate: number | null; note?: string }
  const movements: { improved: MovementItem[]; declined: MovementItem[]; newEntries: MovementItem[] } = {
    improved: [],
    declined: [],
    newEntries: [],
  }
  const gaps: GapItem[] = []
  const softDegraded: Array<{ domain: string; providers: string[] }> = []

  // Prefer worst + high-activity domains first so the board stays operator-relevant.
  const focusDomains = [
    ...worst.map((w) => w.domain),
    ...hottestAlerts.map((h) => h.domain),
    ...projects.filter((p) => p.lastFetchedAt).map((p) => p.domain),
  ]
  const uniqueFocus = [...new Set(focusDomains)].slice(0, 12)

  await Promise.all(
    uniqueFocus.map(async (domain) => {
      try {
        const [kwSnap, compSnap] = await Promise.all([
          loadSnapshotPayload(domain, 'keywords_agg'),
          loadSnapshotPayload(domain, 'competitors_agg'),
        ])
        const kwData = kwSnap?.data || {}
        const compData = compSnap?.data || {}
        const degraded = [
          ...(Array.isArray(kwData.softDegraded) ? kwData.softDegraded : []),
          ...(Array.isArray(compData.softDegraded) ? compData.softDegraded : []),
        ]
        if (degraded.length) softDegraded.push({ domain, providers: [...new Set(degraded)] })

        let mv = kwData.movements
        const normalized = Array.isArray(kwData.normalized) ? (kwData.normalized as KeywordRow[]) : []
        if (!mv && normalized.length) mv = keywordMovements(normalized)
        if (mv) {
          for (const row of (mv.improved || []).slice(0, 5)) {
            movements.improved.push({
              domain,
              keyword: row.keyword,
              position: row.position ?? null,
              previousPosition: row.previousPosition ?? null,
              trend: row.trend,
              volume: row.volume ?? null,
              source: row.source,
            })
          }
          for (const row of (mv.declined || []).slice(0, 5)) {
            movements.declined.push({
              domain,
              keyword: row.keyword,
              position: row.position ?? null,
              previousPosition: row.previousPosition ?? null,
              trend: row.trend,
              volume: row.volume ?? null,
              source: row.source,
            })
          }
          for (const row of (mv.newEntries || []).slice(0, 5)) {
            movements.newEntries.push({
              domain,
              keyword: row.keyword,
              position: row.position ?? null,
              previousPosition: row.previousPosition ?? null,
              trend: row.trend,
              volume: row.volume ?? null,
              source: row.source,
            })
          }
        }

        let domainGaps = Array.isArray(compData.gaps) ? compData.gaps : null
        if (!domainGaps) {
          const competitors = Array.isArray(compData.normalized) ? compData.normalized : []
          domainGaps = computeCompetitorGaps(normalized, competitors)
        }
        for (const g of (domainGaps || []).slice(0, 4)) {
          gaps.push({
            domain,
            competitor: g.competitor,
            ourMissingEstimate: g.ourMissingEstimate ?? null,
            note: g.note,
          })
        }
      } catch (err) {
        console.error('[command-center] snapshot enrich failed for', domain, err)
      }
    }),
  )

  // Rank dropped keywords first for operator triage.
  movements.declined.sort((a, b) => (b.volume || 0) - (a.volume || 0))
  movements.improved.sort((a, b) => (b.volume || 0) - (a.volume || 0))
  movements.newEntries.sort((a, b) => (b.volume || 0) - (a.volume || 0))
  gaps.sort((a, b) => (b.ourMissingEstimate || 0) - (a.ourMissingEstimate || 0))

  res.json({
    kpis: {
      projects: projects.length,
      avgHealth,
      openAlerts,
      openTasks,
      synced,
      stale,
      byStatus,
      serviceRole: Boolean(supabaseAdmin),
      movementSignals: movements.declined.length + movements.improved.length + movements.newEntries.length,
      gapSignals: gaps.length,
    },
    worst,
    hottestAlerts,
    movements: {
      improved: movements.improved.slice(0, 12),
      declined: movements.declined.slice(0, 12),
      newEntries: movements.newEntries.slice(0, 12),
    },
    gaps: gaps.slice(0, 15),
    softDegraded: softDegraded.slice(0, 10),
    source: result.source,
    warning: result.warning || null,
    fetchedAt: result.fetchedAt,
  })
})

app.get('/api/portfolio/export', async (req, res) => {
  const result = await loadProjectList()
  const status = String((req.query as any).status || 'all')
  const q = String((req.query as any).q || '').toLowerCase()
  const rows = result.projects.filter((p) => {
    const statusOk = status === 'all' || p.status === status
    const qOk = !q || [p.name, p.domain, p.clientName, p.market].some((v) => String(v).toLowerCase().includes(q))
    return statusOk && qOk
  })
  const format = String((req.query as any).format || 'json')
  if (format === 'csv') {
    const headers = ['domain', 'name', 'clientName', 'market', 'status', 'priority', 'healthScore', 'alertCount', 'taskCount', 'lastFetchedAt', 'dataState']
    const escape = (v: unknown) => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [
      headers.join(','),
      ...rows.map((p) =>
        [
          p.domain,
          p.name,
          p.clientName,
          p.market,
          p.status,
          p.priority,
          p.healthScore ?? '',
          p.alertCount,
          p.taskCount,
          p.lastFetchedAt ?? '',
          p.dataState,
        ].map(escape).join(','),
      ),
    ]
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="seo-portfolio.csv"')
    return res.send('\uFEFF' + lines.join('\n'))
  }
  res.json({ projects: rows, count: rows.length, source: result.source, fetchedAt: result.fetchedAt })
})

app.post('/api/sync', expensiveLimiter, async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE not configured — cannot persist spine writes' })
  }

  const body = (req.body || {}) as { domain?: string; persist?: boolean; createTasks?: boolean; push?: boolean; limit?: number }
  const createTasks = body.createTasks !== false
  const push = body.push === true
  const domainFilter = body.domain ? String(body.domain).replace(/^https?:\/\//, '').replace(/\/$/, '') : null
  const limit = Math.min(Math.max(Number(body.limit || 20), 1), 50)

  let query = supabaseAdmin
    .from('seo_domains')
    .select('id, domain, name, status')
    .eq('status', 'active')
    .order('domain', { ascending: true })
    .limit(limit)
  if (domainFilter) {
    query = supabaseAdmin
      .from('seo_domains')
      .select('id, domain, name, status')
      .eq('domain', domainFilter)
      .limit(1)
  }

  const { data: domains, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  if (!domains?.length) return res.status(404).json({ error: 'No domains found' })

  const results: any[] = []
  for (const d of domains) {
    const snaps = await loadLatestSnapshots(supabaseAdmin, [d.id], 20)
    const alerts = alertsFromSnapshotRows(d.domain, snaps as any)
    const persisted = await persistAlertsAndTasks({
      admin: supabaseAdmin,
      domainId: d.id,
      domain: d.domain,
      alerts,
      createTasks,
    })

    const bridges: any[] = []
    if (push) {
      for (const alert of alerts.filter((a) => a.severity !== 'info').slice(0, 3)) {
        const [todo, asana] = await Promise.all([
          pushCriticalAlertToTodo({
            domain: d.domain,
            title: alert.title,
            detail: alert.detail,
            severity: alert.severity,
            alertDbId: persisted.alertIds[0],
          }),
          pushCriticalAlertToAsana({
            domain: d.domain,
            title: alert.title,
            detail: alert.detail,
            severity: alert.severity,
          }),
        ])
        bridges.push({ alert: alert.title, todo, asana })
      }
    }

    results.push({
      domain: d.domain,
      domainId: d.id,
      alertsGenerated: alerts.length,
      ...persisted,
      bridges,
    })
  }

  res.json({
    ok: true,
    synced: results.length,
    results,
    fetchedAt: new Date().toISOString(),
  })
})

app.get('/api/agentic-os/bridge', async (_req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    return res.status(503).json({ error: 'Service role required for Agentic OS bridge' })
  }
  const payload = await loadAgenticOsBridge(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
  res.json(payload)
})

app.post('/api/bridges/todo', expensiveLimiter, async (req, res) => {
  const schema = z.object({
    domain: domainSchema,
    title: z.string().min(1).max(300),
    detail: z.string().min(1).max(5000),
    severity: z.enum(['info', 'warning', 'critical']).default('warning'),
    alertDbId: z.string().uuid().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.issues })
  const result = await pushCriticalAlertToTodo(parsed.data)
  res.status(result.ok ? 200 : result.skipped ? 202 : 502).json(result)
})

app.post('/api/bridges/asana', expensiveLimiter, async (req, res) => {
  const schema = z.object({
    domain: domainSchema,
    title: z.string().min(1).max(300),
    detail: z.string().min(1).max(5000),
    severity: z.enum(['info', 'warning', 'critical']).default('warning'),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.issues })
  const result = await pushCriticalAlertToAsana(parsed.data)
  res.status(result.ok ? 200 : result.skipped ? 202 : 502).json(result)
})

// In-memory share tokens (prod can move to Supabase later). TTL 7 days.
type ShareRecord = {
  id: string
  domain: string
  locale: ReportLocale
  template: ReportTemplateId
  markdown: string
  html: string
  createdAt: string
  expiresAt: string
}
const reportShares = new Map<string, ShareRecord>()
const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function pruneExpiredShares() {
  const now = Date.now()
  for (const [id, rec] of reportShares) {
    if (Date.parse(rec.expiresAt) < now) reportShares.delete(id)
  }
}

function buildReportPayload(body: {
  domain: string
  locale?: ReportLocale
  template?: ReportTemplateId
  market?: string | null
  clientName?: string | null
  sections?: Array<{ title: string; body: string }>
}) {
  const domain = String(body.domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
  const locale: ReportLocale = body.locale === 'en' ? 'en' : 'he'
  const template = (body.template || 'monthly') as ReportTemplateId
  const pack = resolveMarket({ domain, market: body.market || null })
  const sections =
    body.sections && body.sections.length
      ? body.sections
      : defaultSectionsForTemplate({
          domain,
          locale,
          template,
          market: body.market || pack.label,
          clientName: body.clientName || null,
        })
  const input = {
    domain,
    locale,
    template,
    market: body.market || pack.label,
    clientName: body.clientName || null,
    sections,
    generatedAt: new Date().toISOString(),
  }
  return {
    input,
    markdown: renderReportMarkdown(input),
    html: renderReportHtml(input),
    templates: REPORT_TEMPLATES,
  }
}

app.get('/api/reports/templates', (_req, res) => {
  res.json({ templates: REPORT_TEMPLATES, defaultLocale: 'he', defaultTemplate: 'monthly' })
})

app.post(
  '/api/reports/preview',
  validateBody(
    z.object({
      domain: domainSchema,
      locale: z.enum(['en', 'he']).optional(),
      template: z.enum(['weekly', 'monthly', 'executive', 'local-geo']).optional(),
      market: z.string().max(80).optional().nullable(),
      clientName: z.string().max(120).optional().nullable(),
      format: z.enum(['md', 'html', 'json']).optional(),
      sections: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })).optional(),
    }),
  ),
  (req, res) => {
    const body = (req as any).validatedBody as {
      domain: string
      locale?: ReportLocale
      template?: ReportTemplateId
      market?: string | null
      clientName?: string | null
      format?: 'md' | 'html' | 'json'
      sections?: Array<{ title: string; body: string }>
    }
    const built = buildReportPayload(body)
    const format = body.format || (body.sections?.length ? 'md' : 'json')
    if (format === 'md') return res.type('text/markdown; charset=utf-8').send(built.markdown)
    if (format === 'html') return res.type('text/html; charset=utf-8').send(built.html)
    return res.json({
      ...built.input,
      markdown: built.markdown,
      html: built.html,
      templates: built.templates,
    })
  },
)

app.post(
  '/api/reports/share',
  expensiveLimiter,
  validateBody(
    z.object({
      domain: domainSchema,
      locale: z.enum(['en', 'he']).optional(),
      template: z.enum(['weekly', 'monthly', 'executive', 'local-geo']).optional(),
      market: z.string().max(80).optional().nullable(),
      clientName: z.string().max(120).optional().nullable(),
      sections: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })).optional(),
    }),
  ),
  (req, res) => {
    pruneExpiredShares()
    const body = (req as any).validatedBody
    const built = buildReportPayload(body)
    const id = `shr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
    const createdAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + SHARE_TTL_MS).toISOString()
    reportShares.set(id, {
      id,
      domain: built.input.domain,
      locale: built.input.locale || 'he',
      template: built.input.template || 'monthly',
      markdown: built.markdown,
      html: built.html,
      createdAt,
      expiresAt,
    })
    const base = `${req.protocol}://${req.get('host')}`
    res.status(201).json({
      id,
      createdAt,
      expiresAt,
      path: `/api/reports/share/${id}`,
      htmlUrl: `${base}/api/reports/share/${id}?format=html`,
      markdownUrl: `${base}/api/reports/share/${id}?format=md`,
      domain: built.input.domain,
      locale: built.input.locale,
      template: built.input.template,
    })
  },
)

app.get('/api/reports/share/:id', (req, res) => {
  pruneExpiredShares()
  const rec = reportShares.get(String(req.params.id || ''))
  if (!rec) return res.status(404).json({ error: 'Share link not found or expired' })
  if (Date.parse(rec.expiresAt) < Date.now()) {
    reportShares.delete(rec.id)
    return res.status(410).json({ error: 'Share link expired' })
  }
  const format = String((req.query as any).format || 'html').toLowerCase()
  if (format === 'md' || format === 'markdown') {
    return res.type('text/markdown; charset=utf-8').send(rec.markdown)
  }
  if (format === 'json') {
    return res.json({
      id: rec.id,
      domain: rec.domain,
      locale: rec.locale,
      template: rec.template,
      createdAt: rec.createdAt,
      expiresAt: rec.expiresAt,
      markdown: rec.markdown,
    })
  }
  return res.type('text/html; charset=utf-8').send(rec.html)
})

app.get('/api/local-seo/overview', async (req, res) => {
  const domain = String((req.query as any).domain || 'maximo-seo.ai').replace(/^https?:\/\//, '').replace(/\/$/, '')
  const market = (req.query as any).market || null
  try {
    const kwSnap = await loadSnapshotPayload(domain, 'keywords_agg')
    const normalized = Array.isArray(kwSnap?.data?.normalized) ? kwSnap!.data.normalized : []
    const signals = summarizeKeywordSerpSignals(normalized)
    const softDegraded = [
      ...(Array.isArray(kwSnap?.data?.softDegraded) ? kwSnap!.data.softDegraded : []),
    ]
    const payload = buildLocalSeoOverview({
      domain,
      market,
      snapshotMeta: {
        keywordsCount: signals.keywordsCount,
        rankingLocalFeatures: signals.rankingLocalFeatures,
        lastFetchedAt: kwSnap?.fetchedAt || null,
        softDegraded,
      },
    })
    res.json(payload)
  } catch (err) {
    console.error('[local-seo]', err)
    res.json(
      buildLocalSeoOverview({
        domain,
        market,
      }),
    )
  }
})

app.get('/api/geo-ai/overview', async (req, res) => {
  const domain = String((req.query as any).domain || 'maximo-seo.ai').replace(/^https?:\/\//, '').replace(/\/$/, '')
  const market = (req.query as any).market || null
  try {
    const kwSnap = await loadSnapshotPayload(domain, 'keywords_agg')
    const normalized = Array.isArray(kwSnap?.data?.normalized) ? kwSnap!.data.normalized : []
    const signals = summarizeKeywordSerpSignals(normalized)
    const softDegraded = [
      ...(Array.isArray(kwSnap?.data?.softDegraded) ? kwSnap!.data.softDegraded : []),
    ]
    const payload = buildGeoAiOverview({
      domain,
      market,
      snapshotMeta: {
        keywordsCount: signals.keywordsCount,
        aiOverviewCount: signals.aiOverviewCount,
        lastFetchedAt: kwSnap?.fetchedAt || null,
        softDegraded,
        topKeywords: signals.topKeywords,
      },
    })
    res.json(payload)
  } catch (err) {
    console.error('[geo-ai]', err)
    res.json(buildGeoAiOverview({ domain, market }))
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK + TOOLS STATUS
// ═══════════════════════════════════════════════════════════════════════════════

function providerStatus() {
  const providerConfig: Record<string, boolean> = {
    ahrefs: !!AHREFS_API_KEY,
    semrush: !!SEMRUSH_API_KEY,
    dataforseo: !!(DATAFORSEO_LOGIN && DATAFORSEO_PASSWORD),
    pagespeed: !!PAGESPEED_API_KEY,
    gtmetrix: !!GTMETRIX_API_KEY,
    seranking: !!SE_RANKING_API,
    exa: !!EXA_API_KEY,
    browserless: !!BROWSERLESS_API_KEY,
    thorbit: !!THORBIT_API_KEY,
  }

  return Object.fromEntries(
    Object.entries(providerConfig).map(([name, configured]) => [
      name,
      configured
        ? { ok: true, configured, latency: 0 }
        : { ok: false, configured, error: 'Not configured' },
    ]),
  )
}

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, service: 'seo-dashboard-api', timestamp: new Date().toISOString() })
})

app.get('/api/status', async (_req, res) => {
  res.json({
    ok: true,
    service: 'seo-dashboard-api',
    timestamp: new Date().toISOString(),
    auth: {
      configured: dashboardAuthConfigured() || Boolean(supabase),
      mode: dashboardAuthConfigured() ? 'dashboard-cookie' : supabase ? 'supabase' : 'not-configured',
    },
    spine: {
      supabaseAnon: Boolean(supabase),
      supabaseServiceRole: Boolean(supabaseAdmin),
      todoBridge: Boolean(process.env.TODO_API_KEY),
      asanaBridge: Boolean(process.env.ASANA_ACCESS_TOKEN || process.env.ASANA_API_KEY),
    },
    statuses: providerStatus(),
    cacheStats: { realtime: realtimeCache.getStats(), historical: historicalCache.getStats() },
  })
})

// Cache management
app.post('/api/cache/clear', (_req, res) => {
  realtimeCache.flushAll()
  historicalCache.flushAll()
  res.json({ ok: true, message: 'All caches cleared' })
})

// ─── Serve static frontend in production ─────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../dist')
  app.use(express.static(distPath))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

if (process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`SEO Dashboard API server running on port ${PORT}`)
  })
}

export default app
