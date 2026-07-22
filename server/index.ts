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
import { analyzeKeywordSeries, detectMetricAnomaly, type MetricPoint } from './alerts/anomaly.js'
import { createSeoTaskFromAlert } from './tasks/createSeoTask.js'
import {
  REPORT_TEMPLATES,
  defaultSectionsForTemplate,
  renderReportHtml,
  renderReportMarkdown,
  type ReportLocale,
  type ReportTemplateId,
} from './reports/renderReport.js'
import { ReportScheduleStore, ReportShareStore, computeNextRunAt, normalizeSchedule, SCHEDULES_PROVIDER } from './reports/scheduleStore.js'
import { buildScheduledReport, sendReportEmail } from './reports/sendScheduledReport.js'
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
import { alertsFromSnapshotRows, buildSnapshotOverlayMap, extractProviderMetrics } from './data/snapshotSpine.js'
import { loadLatestSnapshots, loadOpenCounts, persistAlertsAndTasks } from './data/persistOps.js'
import { loadAgenticOsBridge, pushCriticalAlertToAsana, pushCriticalAlertToTodo } from './integrations/bridges.js'
import { resolveMarket, serankingResearchUrl } from './markets/resolveMarket.js'
import {
  backlinksFromSerpstat,
  buildKeywordGapMatrix,
  computeCompetitorGaps,
  computeKeywordIntel,
  computeLinkIntel,
  computeSerpFeatureStats,
  computeCannibalization,
  computeShareOfVoice,
  competitorsFromDataForSEO,
  competitorsFromExa,
  competitorsFromSemrush,
  competitorsFromSerpstat,
  keywordMovements,
  keywordsFromAhrefs,
  keywordsFromDataForSEO,
  keywordsFromKeywordsEverywhere,
  keywordsFromSemrush,
  keywordsFromSerpstat,
  mergeCompetitors,
  mergeKeywordRows,
  type KeywordRow,
} from './providers/adapters.js'
import { acceptSnapshotForDomain, canonicalizeDomain, filterCompetitorsForDomain, filterKeywordsForDomain, filterPagesForDomain, stampPayload } from './providers/domainIntegrity.js'

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
// Public share links are read-only HTML/MD (no mutating data) — /reports/share?id=xxx (single-segment routing).
app.use('/api', async (req, res, next) => {
  if (
    req.path === '/health' ||
    req.path === '/version' ||
    req.path === '/auth/login' ||
    (req.method === 'GET' && (req.path === '/reports/share' || /^\/reports\/share\/[^/]+$/.test(req.path)))
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
    (req.path === '/cron/nightly-sync' || req.path === '/cron/health' || req.path === '/cron/report-schedules')
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
const PAGESPEED_API_KEY = process.env.PAGESPEED_API_KEY || process.env.GOOGLE_PSI_API_KEY || process.env.GOOGLE_API_KEY || ''
const GTMETRIX_API_KEY = process.env.GTMETRIX_API || process.env.GTMETRIX_API_KEY || ''
const GTMETRIX_EMAIL = process.env.GTMETRIX_EMAIL || 'tomerake@gmail.com'
const SE_RANKING_API =
  process.env.SE_RANKING_API ||
  process.env.SERANKING_PRIVATE_ACCOUNT_API_KEY ||
  process.env.SERANKING_API_KEY ||
  process.env.SERANKING_API ||
  ''
const EXA_API_KEY = process.env.EXA_API_KEY || process.env.EXA_AI_API_KEY || process.env.EXA_AI_API || ''
const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY || process.env.BROWSERLESS_IO_API || ''
const THORBIT_API_KEY = process.env.THORBIT_API_KEY || ''
const SERPSTAT_API_KEY =
  process.env.SERPSTAT_COM_API_KEY ||
  process.env.SERPSTAT_API_KEY ||
  process.env.SERPSTAT_API ||
  process.env.SERPSTAT_COM_API ||
  ''
const KEYWORDS_EVERYWHERE_API_KEY =
  process.env.KEYWORDS_EVERYWHERE_API_KEY ||
  process.env.KEYWORDS_EVERYWHERE_API ||
  process.env.KEYWORDS_EVERYWHERE_KEY ||
  ''
const SERPAPI_KEY = process.env.SERPAPI_KEY || process.env.SERPAPI || ''
const LOCAL_FALCON_API_KEY =
  process.env.LOCAL_FALCON_API_KEY ||
  process.env.LOCALFALCON_API_KEY ||
  process.env.LOCALFALCON_API ||
  ''
const MANGOOLS_API_KEY = process.env.MANGOOLS_API_KEY || process.env.SERPSTAT_COM_API_KEY_2 || ''
// Morningscore (stable when User-Agent is set; REST backlinks via /v1/{domainId}/backlinks)
const MORNINGSCORE_API_KEY = process.env.MORNINGSCORE_API_KEY || process.env.MORNING_SCORE_API_KEY || ''

const DATAFORSEO_AUTH = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64')

function softStatus(status?: number) {
  return status === 403 || status === 401 || status === 402 || status === 429
}

/** Soft-degrade wrapper for third-party axios calls used inside aggregators. */
async function softProviderCall<T>(
  provider: string,
  fn: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; softDegraded: boolean; error: string; httpStatus?: number }> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (e: any) {
    const status = axios.isAxiosError(e) ? e.response?.status : undefined
    return {
      ok: false,
      softDegraded: softStatus(status),
      error: e instanceof Error ? e.message : `${provider} failed`,
      httpStatus: status,
    }
  }
}

async function serpstatRpc(method: string, params: Record<string, any>) {
  if (!SERPSTAT_API_KEY) throw new Error('Serpstat API key not configured')
  const r = await axios.post(
    `https://api.serpstat.com/v4/?token=${SERPSTAT_API_KEY}`,
    { id: '1', method, params },
    { timeout: 15000, validateStatus: (s) => s < 500 },
  )
  if (softStatus(r.status)) {
    const err: any = new Error(`Serpstat HTTP ${r.status}`)
    err.response = r
    throw err
  }
  if (r.status >= 400) throw new Error(`Serpstat HTTP ${r.status}`)
  if (r.data?.error) throw new Error(r.data.error?.message || 'Serpstat error')
  return r.data
}

/** Morningscore REST helper — Cloudflare blocks empty/simple UA; keep a real UA. */
function morningscoreHeaders() {
  return {
    Authorization: `Bearer ${MORNINGSCORE_API_KEY}`,
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; MaximoSEO/1.0; +https://seo-dashboard.maximo-seo.ai)',
  }
}

async function morningscoreGet(path: string, timeout = 20000) {
  if (!MORNINGSCORE_API_KEY) throw new Error('Morningscore API key not configured')
  const r = await axios.get(`https://api.morningscore.io${path}`, {
    headers: morningscoreHeaders(),
    timeout,
    validateStatus: (s) => s < 500,
  })
  if (r.status >= 400) {
    const err: any = new Error(`Morningscore HTTP ${r.status}`)
    err.response = r
    throw err
  }
  return r.data
}

/**
 * Resolve Morningscore domain id for a hostname.
 * Only domains already registered in the Morningscore account are usable for Links API.
 */
async function morningscoreResolveDomainId(hostname: string): Promise<{ id: string; domain: string } | null> {
  const list = await morningscoreGet('/v1/domains')
  if (!Array.isArray(list)) return null
  const needle = hostname.replace(/^www\./, '').toLowerCase()
  const hit = list.find((d: any) => String(d?.domain || '').replace(/^www\./, '').toLowerCase() === needle)
  if (!hit?.global_domain_identifier) return null
  return { id: String(hit.global_domain_identifier), domain: String(hit.domain || hostname) }
}

async function keywordsEverywhereVolumes(keywords: string[], pack: ReturnType<typeof resolveMarket>) {
  if (!KEYWORDS_EVERYWHERE_API_KEY || !keywords.length) return null
  const body = new URLSearchParams()
  body.set('country', pack.keCountry)
  body.set('currency', pack.code === 'il' ? 'ILS' : 'USD')
  body.set('dataSource', 'gkp')
  for (const kw of keywords.slice(0, 25)) body.append('kw[]', kw)
  const r = await axios.post('https://api.keywordseverywhere.com/v1/get_keyword_data', body.toString(), {
    headers: {
      Authorization: `Bearer ${KEYWORDS_EVERYWHERE_API_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 15000,
    validateStatus: (s) => s < 500,
  })
  if (softStatus(r.status)) {
    const err: any = new Error(`Keywords Everywhere HTTP ${r.status}`)
    err.response = r
    throw err
  }
  if (r.status >= 400) throw new Error(`Keywords Everywhere HTTP ${r.status}`)
  return r.data
}

async function localFalconMeta() {
  if (!LOCAL_FALCON_API_KEY) throw new Error('Local Falcon API key not configured')
  const r = await axios.get('https://api.localfalcon.com/v1/locations', {
    params: { api_key: LOCAL_FALCON_API_KEY },
    timeout: 12000,
    validateStatus: (s) => s < 500,
  })
  if (softStatus(r.status)) {
    const err: any = new Error(`Local Falcon HTTP ${r.status}`)
    err.response = r
    throw err
  }
  if (r.status >= 400) throw new Error(`Local Falcon HTTP ${r.status}`)
  return {
    locationsTotal: r.data?.data?.total ?? r.data?.total ?? null,
    raw: r.data,
  }
}

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
  const clean = canonicalizeDomain(domain)
  if (!clean) return null
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
  const accepted = acceptSnapshotForDomain({ data: data.data, fetchedAt: data.fetched_at || null }, domain)
  if (!accepted) return null
  return { data: accepted.data, fetchedAt: data.fetched_at || null }
}

/** Full-payload snapshot history for a provider (oldest → newest), domain-integrity filtered. */
async function loadSnapshotPayloadHistory(
  domain: string,
  provider: string,
  limit = 12,
): Promise<Array<{ data: any; fetchedAt: string | null }>> {
  if (!supabaseAdmin) return []
  const domainId = await findDomainId(domain)
  if (!domainId) return []
  const take = Math.min(Math.max(Number(limit) || 12, 2), 30)
  const { data } = await supabaseAdmin
    .from('seo_snapshots')
    .select('data, fetched_at')
    .eq('domain_id', domainId)
    .eq('provider', provider)
    .order('fetched_at', { ascending: false })
    .limit(take)
  if (!Array.isArray(data)) return []
  const rows: Array<{ data: any; fetchedAt: string | null }> = []
  for (const row of data) {
    const accepted = acceptSnapshotForDomain({ data: row.data, fetchedAt: row.fetched_at || null }, domain)
    if (accepted?.data) rows.push({ data: accepted.data, fetchedAt: row.fetched_at || null })
  }
  return rows.reverse()
}

/** Recent snapshots for history / compare (Site Audit Phase 2). */
async function loadSnapshotHistory(
  domain: string,
  provider: string,
  limit = 10,
): Promise<Array<{ fetchedAt: string | null; snapshotDate: string | null; summary: Record<string, any>; issuesCount: number }>> {
  if (!supabaseAdmin) return []
  const domainId = await findDomainId(domain)
  if (!domainId) return []
  const take = Math.min(Math.max(Number(limit) || 10, 1), 30)
  const { data } = await supabaseAdmin
    .from('seo_snapshots')
    .select('data, fetched_at, snapshot_date')
    .eq('domain_id', domainId)
    .eq('provider', provider)
    .order('fetched_at', { ascending: false })
    .limit(take)
  if (!Array.isArray(data)) return []
  const rows: Array<{ fetchedAt: string | null; snapshotDate: string | null; summary: Record<string, any>; issuesCount: number }> = []
  for (const row of data) {
    const accepted = acceptSnapshotForDomain({ data: row.data, fetchedAt: row.fetched_at || null }, domain)
    if (!accepted?.data) continue
    const payload = accepted.data as any
    const issues = Array.isArray(payload.issues) ? payload.issues : []
    rows.push({
      fetchedAt: row.fetched_at || null,
      snapshotDate: row.snapshot_date || null,
      summary: payload.summary || {},
      issuesCount: issues.length,
    })
  }
  return rows
}

async function persistSnapshot(
  domain: string,
  provider: string,
  payload: unknown,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!supabaseAdmin || !payload || typeof payload !== 'object') {
    return { ok: false, skipped: true, error: 'no-admin-or-payload' }
  }
  // Do not persist hard-unavailable empty provider errors
  if ((payload as any).ok === false && (payload as any).state === 'unavailable') {
    return { ok: false, skipped: true, error: 'unavailable-payload' }
  }
  // Soft-degraded SE Ranking shells (no useful metrics) — skip durable write
  if ((payload as any).softDegraded === true && (payload as any).data == null) {
    return { ok: false, skipped: true, error: 'soft-degraded-empty' }
  }
  const domainId = await findDomainId(domain)
  if (!domainId) return { ok: false, skipped: true, error: 'domain-not-found' }
  const today = new Date().toISOString().slice(0, 10)
  // Always stamp domain identity into durable snapshots
  const stamped = (payload && typeof payload === 'object')
    ? stampPayload(payload as Record<string, any>, domain)
    : payload
  // PostgREST/jsonb rejects U+0000 (code 22P05). Exa/html fragments sometimes include them.
  const cleanPayload = sanitizeJsonForPg(stamped)
  const { error } = await supabaseAdmin.from('seo_snapshots').upsert(
    {
      domain_id: domainId,
      provider,
      snapshot_date: today,
      data: cleanPayload,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'domain_id,provider,snapshot_date' },
  )
  if (error) {
    console.error('[persistSnapshot]', provider, domain, error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

/**
 * Live multi-source overview hydrate + durable seo_snapshots write.
 * Used by GET /api/overview (force) and POST /api/sync / nightly cron.
 */
async function hydrateDomainOverview(
  domain: string,
  pack: ReturnType<typeof resolveMarket>,
): Promise<Record<string, any>> {
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
    SERPSTAT_API_KEY
      ? serpstatRpc('SerpstatDomainProcedure.getDomainsInfo', { domains: [domain], se: pack.serpstatSe })
      : Promise.reject('No API key'),
    LOCAL_FALCON_API_KEY ? localFalconMeta() : Promise.reject('No API key'),
    SERPAPI_KEY
      ? axios.get('https://serpapi.com/account.json', { params: { api_key: SERPAPI_KEY }, timeout: 10000 })
      : Promise.reject('No API key'),
  ])

  const [ahrefsDR, ahrefsMetrics, semrush, dataforseo, seranking, exa, serpstat, localFalcon, serpapiAccount] = calls

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
  if (serpstat.status === 'fulfilled') {
    result.sources.serpstat = serpstat.value
    result.activeSources.push('Serpstat')
  } else if (SERPSTAT_API_KEY) {
    result.softDegraded.push('Serpstat')
  }
  if (localFalcon.status === 'fulfilled') {
    result.sources.localFalcon = localFalcon.value
    result.activeSources.push('Local Falcon')
  } else if (LOCAL_FALCON_API_KEY) {
    result.softDegraded.push('Local Falcon')
  }
  if (serpapiAccount.status === 'fulfilled') {
    result.sources.serpapi = {
      plan: serpapiAccount.value.data?.plan_name,
      searchesLeft: serpapiAccount.value.data?.total_searches_left ?? serpapiAccount.value.data?.searches_remaining,
    }
    result.activeSources.push('SerpAPI')
  } else if (SERPAPI_KEY) {
    result.softDegraded.push('SerpAPI')
  }
  if (KEYWORDS_EVERYWHERE_API_KEY) result.sources.keywordsEverywhere = { configured: true }
  if (MANGOOLS_API_KEY) result.sources.mangools = { configured: true, note: 'Key present; public REST surface incomplete — kept soft' }

  result.writes = [] as Array<{ provider: string; ok: boolean; skipped?: boolean; error?: string }>
  if (result.activeSources.length) {
    result.writes.push({ provider: 'overview', ...(await persistSnapshot(domain, 'overview', result)) })
    if (result.sources.ahrefs) {
      result.writes.push({ provider: 'ahrefs', ...(await persistSnapshot(domain, 'ahrefs', result.sources.ahrefs)) })
    }
    if (result.sources.semrush) {
      result.writes.push({ provider: 'semrush', ...(await persistSnapshot(domain, 'semrush', result.sources.semrush)) })
    }
    if (result.sources.dataforseo) {
      result.writes.push({ provider: 'dataforseo', ...(await persistSnapshot(domain, 'dataforseo', result.sources.dataforseo)) })
    }
  }
  return result
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
  // SEMrush CSV is semicolon-delimited and often CRLF; strip \r so keys stay clean.
  const lines = String(csv || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(';').map((h) => h.trim())
  return lines.slice(1).map(line => {
    const values = line.split(';')
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      if (!h) return
      obj[h] = values[i] != null ? String(values[i]).trim() : ''
    })
    return obj
  })
}

/** Strip NUL / control bytes that PostgREST rejects for jsonb text (`22P05`). */
function sanitizeJsonForPg(value: unknown, depth = 0): unknown {
  if (depth > 40) return null
  if (value == null) return value
  if (typeof value === 'string') {
    // drop U+0000 and other non-printable C0 controls except tab/newline
    // eslint-disable-next-line no-control-regex -- deliberate C0 control-character sanitizer
    return value.replace(/\u0000/g, '').replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map((v) => sanitizeJsonForPg(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // eslint-disable-next-line no-control-regex -- deliberate C0 control-character sanitizer
      const key = String(k).replace(/\u0000/g, '').replace(/[\r\n]+/g, ' ').trim()
      if (!key) continue
      out[key] = sanitizeJsonForPg(v, depth + 1)
    }
    return out
  }
  return value
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
  if (!domain) return res.status(400).json({ error: 'domain required' })
  const pack = marketFromRequest(req, domain)
  const forceRefresh = refresh === '1' || refresh === 'true'
  if (!forceRefresh) {
    const cached = await loadSnapshotPayload(domain, 'overview')
    if (cached?.data && Object.keys(cached.data.sources || {}).length > 0) {
      return res.json({
        ...cached.data,
        domain,
        market: pack,
        dataState: 'cached',
        fetchedAt: cached.fetchedAt,
        fromSnapshot: true,
      })
    }
  }

  try {
    const result = await hydrateDomainOverview(domain, pack)
    res.json(result)
  } catch (e: any) {
    res.status(502).json({ error: e?.message || String(e), domain })
  }
})

// Aggregated keywords from multiple sources
app.get('/api/keywords/aggregated', expensiveLimiter, async (req, res) => {
  const { domain, limit, refresh } = req.query as Record<string, string>
  if (!domain?.trim()) return res.status(400).json({ error: 'domain required' })
  const pack = marketFromRequest(req, domain)
  const forceRefresh = refresh === '1' || refresh === 'true'
  if (!forceRefresh) {
    const cached = await loadSnapshotPayload(domain, 'keywords_agg')
    if (cached?.data && Object.keys(cached.data.sources || {}).length > 0) {
      const snap = { ...cached.data, market: pack, dataState: 'cached', fetchedAt: cached.fetchedAt, fromSnapshot: true }
      if (Array.isArray(snap.normalized)) {
        const kwIntegrity = filterKeywordsForDomain(snap.normalized, domain)
        snap.normalized = kwIntegrity.rows
        snap.movements = snap.movements || keywordMovements(kwIntegrity.rows)
        const recomputedIntel = computeKeywordIntel(kwIntegrity.rows)
        // Preserve the live-path cannibalization (computed from pre-merge source rows) — merged rows collapse URLs
        if (Array.isArray((snap as any).intel?.cannibalization) && (snap as any).intel.cannibalization.length) {
          recomputedIntel.cannibalization = (snap as any).intel.cannibalization
        }
        snap.intel = recomputedIntel
        snap.serpFeatureStats = snap.serpFeatureStats || computeSerpFeatureStats(kwIntegrity.rows)
        return res.json(stampPayload(snap, domain, { foreignRowsDropped: kwIntegrity.foreignRowsDropped }))
      }
      return res.json(stampPayload(snap, domain))
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

  const rowLimit = Math.min(Math.max(Number(limit) || 50, 10), 100)
  const calls = await Promise.allSettled([
    // Ahrefs v3 requires `select`
    AHREFS_API_KEY
      ? axios.get('https://api.ahrefs.com/v3/site-explorer/organic-keywords', {
          params: {
            target: domain,
            date: today,
            mode: 'subdomains',
            limit: rowLimit,
            select: 'keyword,volume,best_position,sum_traffic,best_position_url,cpc,keyword_difficulty',
          },
          headers: { Authorization: `Bearer ${AHREFS_API_KEY}` },
          timeout: 15000,
        })
      : Promise.reject('No Ahrefs key'),
    SEMRUSH_API_KEY
      ? axios.get('https://api.semrush.com/', {
          params: {
            type: 'domain_organic',
            key: SEMRUSH_API_KEY,
            domain,
            database: pack.semrushDatabase,
            display_limit: rowLimit,
            export_columns: 'Ph,Po,Pp,Nq,Cp,Co,Kd,Ur,Tr,Tc,Nr,Td',
          },
          timeout: 15000,
        })
      : Promise.reject('No SEMrush key'),
    DATAFORSEO_AUTH
      ? axios.post(
          'https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live',
          [{ target: domain, language_name: pack.dfsLanguageName, location_code: pack.dfsLocationCode, limit: rowLimit }],
          { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' }, timeout: 20000 },
        )
      : Promise.reject('No DataForSEO'),
    SERPSTAT_API_KEY
      ? serpstatRpc('SerpstatDomainProcedure.getDomainKeywords', {
          domain,
          se: pack.serpstatSe,
          page: 1,
          size: rowLimit,
        })
      : Promise.reject('No Serpstat key'),
    // Morningscore domain score (stable, account domains only)
    MORNINGSCORE_API_KEY
      ? morningscoreResolveDomainId(domain).then(async (resolved) => {
          if (!resolved) return { skipped: true, reason: 'domain_not_in_morningscore_account' }
          const detail = await morningscoreGet(`/v1/domains/${resolved.id}`, 20000)
          return { resolved, detail }
        })
      : Promise.reject('No Morningscore key'),
  ])

  const [ahrefs, semrush, dataforseo, serpstat, morningscore] = calls
  if (ahrefs.status === 'fulfilled') { result.sources.ahrefs = ahrefs.value.data; result.activeSources.push('Ahrefs') }
  else if (AHREFS_API_KEY) result.softDegraded.push('Ahrefs')
  if (semrush.status === 'fulfilled') { result.sources.semrush = parseSemrushCSV(semrush.value.data); result.activeSources.push('SEMrush') }
  else if (SEMRUSH_API_KEY) result.softDegraded.push('SEMrush')
  if (dataforseo.status === 'fulfilled') { result.sources.dataforseo = dataforseo.value.data; result.activeSources.push('DataForSEO') }
  else if (DATAFORSEO_AUTH) result.softDegraded.push('DataForSEO')
  if (serpstat.status === 'fulfilled') {
    result.sources.serpstat = serpstat.value
    result.activeSources.push('Serpstat')
  } else if (SERPSTAT_API_KEY) {
    result.softDegraded.push('Serpstat')
  }
  if (morningscore.status === 'fulfilled') {
    const ms = morningscore.value as any
    if (ms?.skipped) result.sources.morningscore = { available: false, reason: ms.reason }
    else if (ms?.detail) {
      result.sources.morningscore = ms.detail
      result.activeSources.push('Morningscore')
    }
  } else if (MORNINGSCORE_API_KEY) {
    result.softDegraded.push('Morningscore')
  }
  // SE Ranking: key present but auth unstable — skip live call to avoid softDegraded spam
  if (SE_RANKING_API) {
    result.sources.seranking = { configured: true, active: false, note: 'SE Ranking auth unstable; skipped' }
  }

  // Keep pre-merge rows for cannibalization detection (merge collapses URLs to one per keyword)
  const rawKeywordRows = [
    ...keywordsFromSemrush(result.sources.semrush),
    ...keywordsFromAhrefs(result.sources.ahrefs),
    ...keywordsFromDataForSEO(result.sources.dataforseo),
    ...keywordsFromSerpstat(result.sources.serpstat),
  ]
  let keywords = mergeKeywordRows([rawKeywordRows])

  // Optional volume enrichment from Keywords Everywhere (soft).
  if (KEYWORDS_EVERYWHERE_API_KEY && keywords.length) {
    const seed = keywords.map((k) => k.keyword).filter(Boolean).slice(0, 20)
    const ke = await softProviderCall('keywords_everywhere', () => keywordsEverywhereVolumes(seed, pack))
    if (ke.ok) {
      if (ke.data) {
        result.sources.keywordsEverywhere = ke.data
        if (!result.activeSources.includes('Keywords Everywhere')) result.activeSources.push('Keywords Everywhere')
        keywords = mergeKeywordRows([keywordsFromKeywordsEverywhere(ke.data), keywords])
      }
    } else if (ke.softDegraded) {
      result.softDegraded.push('Keywords Everywhere')
    }
  }

  const kwIntegrity = filterKeywordsForDomain(keywords, domain)
  result.normalized = kwIntegrity.rows
  result.movements = keywordMovements(kwIntegrity.rows)
  result.intel = computeKeywordIntel(kwIntegrity.rows)
  // Cannibalization from pre-merge rows (merge collapses URLs to one per keyword, so the heuristic needs raw source rows)
  if (result.intel) {
    result.intel.cannibalization = computeCannibalization(rawKeywordRows)
  }
  // SERP feature stats with delta vs the previous keywords snapshot (tracking over time)
  try {
    const prevSnap = await loadSnapshotPayloadHistory(domain, 'keywords_agg', 2)
    const prevRows = prevSnap.length >= 2 && Array.isArray(prevSnap[prevSnap.length - 2]?.data?.normalized)
      ? (prevSnap[prevSnap.length - 2].data.normalized as KeywordRow[])
      : []
    result.serpFeatureStats = computeSerpFeatureStats(kwIntegrity.rows, { previous: prevRows })
  } catch {
    result.serpFeatureStats = computeSerpFeatureStats(kwIntegrity.rows)
  }
  const stamped = stampPayload(result, domain, {
    foreignRowsDropped: kwIntegrity.foreignRowsDropped,
    selfRowsDropped: 0,
    giantsDropped: 0,
  })

  if (stamped.activeSources.length) void persistSnapshot(domain, 'keywords_agg', stamped)
  res.json(stamped)
})

// Aggregated backlinks from multiple sources (Ahrefs + SEMrush + DataForSEO + SE Ranking + Serpstat)

/** Host root form of a URL/domain without www. */
function backlinkHostOf(raw: string): string {
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    return new URL(withScheme).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return String(raw || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase()
  }
}

function backlinkTargetsDomain(urlTo: string, cleanDomain: string): boolean {
  if (!urlTo || !cleanDomain) return false
  const h = backlinkHostOf(urlTo)
  return h === cleanDomain || h.endsWith(`.${cleanDomain}`)
}

const BACKLINK_SPAM_HOST_HINTS = [
  'exlinko', 'seoflx', 'rank-your', 'itxoft', 'fiverr', 'thehighrankseo', 'seoexpress',
  'kmoshops', 'seorankinghigh', '123webshop', 'rankingseohigh', 'thetoprankingseo',
  'simplywebshop', 'kawaiishop', 'therankingseohigh', 'thebacklink', 'thehighseoranking',
  'highseo', 'mysky-shop', 'activeshop', 'buybacklink', 'guestpost', 'link-exchange',
  'pbn', 'cheap-backlinks', 'backlink-service', 'seoshop', 'rankboost',
]
const BACKLINK_SPAM_TLDS = new Set(['.shop', '.store', '.sbs', '.cfd', '.zip', '.mov', '.top', '.xyz', '.icu', '.buzz', '.bond', ' .cyou'.trim(), '.cyou'])
const BACKLINK_SPAM_ANCHOR_HINTS = [
  'fiverr', 'rank website', 'seo boost', 'guest post service', 'buy backlink', 'pbn',
  'unstoppable growth', 'there was a time when', 'after launching', 'your unstoppable',
]

/** Score and classify a single backlink row for operator quality views. Never invent metrics. */
function scoreBacklinkRow(row: any, cleanDomain: string): {
  score: number
  quality: 'relevant' | 'risky' | 'spam'
  reasons: string[]
  domain_from: string
  url_to: string
} {
  const domainFrom = backlinkHostOf(row.domain_from || row.url_from || '')
  const anchor = String(row.anchor || '').toLowerCase()
  const urlFrom = String(row.url_from || '').toLowerCase()
  let urlTo = String(row.url_to || '')
  if (!urlTo) urlTo = `https://${cleanDomain}/`
  const reasons: string[] = []
  let score = Number(row.rank || 0) || 0
  const tld = domainFrom.includes('.') ? `.${domainFrom.split('.').pop()}` : ''
  if (BACKLINK_SPAM_TLDS.has(tld)) { score -= 40; reasons.push(`tld${tld}`) }
  if (BACKLINK_SPAM_HOST_HINTS.some((h) => domainFrom.includes(h))) { score -= 50; reasons.push('spam-host') }
  if (BACKLINK_SPAM_ANCHOR_HINTS.some((h) => anchor.includes(h))) { score -= 30; reasons.push('spam-anchor') }
  if (urlFrom.includes('fiverr') || urlFrom.includes('rank-your') || urlFrom.includes('exlinko')) {
    score -= 40; reasons.push('spam-url')
  }
  if (domainFrom.endsWith('.co.il') || domainFrom.endsWith('.org.il') || domainFrom.endsWith('.ac.il') || domainFrom.endsWith('.gov.il')) {
    score += 18; reasons.push('local-tld')
  }
  const brandStem = cleanDomain.replace(/\..*$/, '')
  if (brandStem && (anchor.includes(brandStem) || anchor.includes(cleanDomain))) {
    score += 12; reasons.push('brand-anchor')
  }
  if (row.dofollow) score += 4
  if ((Number(row.rank) || 0) >= 40) score += 8
  if ((Number(row.rank) || 0) >= 70) score += 8

  let quality: 'relevant' | 'risky' | 'spam' = 'relevant'
  if (
    BACKLINK_SPAM_HOST_HINTS.some((h) => domainFrom.includes(h)) ||
    BACKLINK_SPAM_TLDS.has(tld) ||
    BACKLINK_SPAM_ANCHOR_HINTS.some((h) => anchor.includes(h)) ||
    reasons.includes('spam-url')
  ) {
    quality = 'spam'
  } else if (score < 12 && (Number(row.rank) || 0) < 15) {
    quality = 'risky'
  } else if (score < 25 && !reasons.includes('local-tld') && (Number(row.rank) || 0) < 25) {
    quality = 'risky'
  }
  return { score, quality, reasons, domain_from: domainFrom, url_to: urlTo }
}

/** Normalize raw provider rows into per-domain real backlinks with quality labels. */
function normalizeBacklinkInventory(rawRows: any[], domain: string) {
  const cleanDomain = String(domain || '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
  const seen = new Set<string>()
  const deduped: any[] = []
  let droppedWrongTarget = 0
  let spamCount = 0
  let riskyCount = 0
  let relevantCount = 0

  for (const row of rawRows || []) {
    const domainFrom = backlinkHostOf(row.domain_from || row.url_from || '')
    if (!domainFrom) continue
    // Drop self-links
    if (domainFrom === cleanDomain || domainFrom.endsWith(`.${cleanDomain}`)) continue
    const urlTo = String(row.url_to || '')
    if (urlTo && !backlinkTargetsDomain(urlTo, cleanDomain)) {
      droppedWrongTarget += 1
      continue
    }
    const q = scoreBacklinkRow(row, cleanDomain)
    const urlFrom = String(row.url_from || '').toLowerCase()
    const anchor = String(row.anchor || '').toLowerCase()
    const key = `${domainFrom}|${urlFrom}|${anchor}`
    if (seen.has(key)) continue
    seen.add(key)
    const next = {
      ...row,
      domain_from: q.domain_from,
      url_to: q.url_to,
      quality: q.quality,
      qualityScore: q.score,
      qualityReasons: q.reasons,
      evidence: {
        targetDomain: cleanDomain,
        provider: row.source || 'unknown',
        url_from: row.url_from || '',
        url_to: q.url_to,
      },
    }
    if (q.quality === 'spam') spamCount += 1
    else if (q.quality === 'risky') riskyCount += 1
    else relevantCount += 1
    deduped.push(next)
  }

  deduped.sort((a, b) => {
    const qRank = { relevant: 0, risky: 1, spam: 2 } as Record<string, number>
    const qd = (qRank[a.quality] ?? 9) - (qRank[b.quality] ?? 9)
    if (qd !== 0) return qd
    const s = (Number(b.qualityScore) || 0) - (Number(a.qualityScore) || 0)
    if (s !== 0) return s
    return (Number(b.rank) || 0) - (Number(a.rank) || 0)
  })

  return {
    rows: deduped,
    summaryPatch: {
      sampleRows: deduped.length,
      relevant: relevantCount,
      risky: riskyCount,
      spam: spamCount,
      droppedWrongTarget,
    },
  }
}

app.get('/api/backlinks/aggregated', expensiveLimiter, async (req, res) => {
  const { domain, refresh, limit } = req.query as Record<string, string>
  if (!domain?.trim()) return res.status(400).json({ error: 'domain required' })
  const pack = marketFromRequest(req, domain)
  const forceRefresh = refresh === '1' || refresh === 'true'
  const rowLimit = Math.min(Math.max(Number(limit) || 50, 10), 200)
  const today = new Date().toISOString().slice(0, 10)

  if (!forceRefresh) {
    const cached = await loadSnapshotPayload(domain, 'backlinks_agg')
    if (cached?.data && (Array.isArray(cached.data.normalized) ? cached.data.normalized.length > 0 : Object.keys(cached.data.sources || {}).length > 0)) {
      const payload = { ...cached.data, domain, market: pack, dataState: 'cached', fetchedAt: cached.fetchedAt, fromSnapshot: true }
      // Always re-score older snapshots so spam/PBN rows do not leak into the default operator view
      if (Array.isArray(payload.normalized) && payload.normalized.length) {
        const needsRescore = payload.normalized.some((r: any) => !r.quality || !r.evidence?.targetDomain)
        if (needsRescore || payload.normalized.some((r: any) => r.url_to && !String(r.url_to).toLowerCase().includes(String(domain).toLowerCase().replace(/^www\./, '')))) {
          const scored = normalizeBacklinkInventory(payload.normalized, domain)
          payload.normalized = scored.rows
          payload.normalizedAll = scored.rows
          payload.summary = { ...(payload.summary || {}), ...scored.summaryPatch }
        }
      }
      // Recompute operator link intel for older snapshots / new scoring
      payload.linkIntel = computeLinkIntel({
        normalizedLinks: payload.normalized || payload.normalizedAll || [],
        refdomains: payload.refdomains || [],
        domain,
      })
      // Never return a snapshot belonging to another domain
      if (payload.domain && String(payload.domain).toLowerCase() !== String(domain).toLowerCase()) {
        // continue to live fetch
      } else {
        return res.json(stampPayload(payload, domain))
      }
    }
  }

  const result: Record<string, any> = {
    domain,
    market: pack,
    sources: {},
    activeSources: [] as string[],
    softDegraded: [] as string[],
    normalized: [] as any[],
    summary: { total: 0, dofollow: 0, nofollow: 0, refDomains: null as number | null },
    dataState: 'live',
    fetchedAt: new Date().toISOString(),
  }

  const ahrefsHeaders = { Authorization: `Bearer ${AHREFS_API_KEY}` }
  const calls = await Promise.allSettled([
    // Ahrefs v3 requires `date` for backlinks-stats
    AHREFS_API_KEY
      ? axios.get('https://api.ahrefs.com/v3/site-explorer/backlinks-stats', {
          params: { target: domain, mode: 'subdomains', date: today },
          headers: ahrefsHeaders,
          timeout: 15000,
        })
      : Promise.reject('No Ahrefs key'),
    // Ahrefs v3 requires `select` for refdomains
    AHREFS_API_KEY
      ? axios.get('https://api.ahrefs.com/v3/site-explorer/refdomains', {
          params: {
            target: domain,
            mode: 'subdomains',
            limit: Math.min(rowLimit, 100),
            select: 'domain,domain_rating,dofollow_links,backlinks,first_seen,last_seen',
          },
          headers: ahrefsHeaders,
          timeout: 15000,
        })
      : Promise.reject('No Ahrefs key'),
    // Live backlink rows for table (best effort)
    AHREFS_API_KEY
      ? axios.get('https://api.ahrefs.com/v3/site-explorer/all-backlinks', {
          params: {
            target: domain,
            mode: 'subdomains',
            limit: rowLimit,
            // Prefer higher-authority referring pages — reduces PBN/.shop spam at the top
            order_by: 'domain_rating_source:desc',
            select: 'url_from,url_to,anchor,domain_rating_source,is_dofollow,first_seen,title,is_content,is_spam',
          },
          headers: ahrefsHeaders,
          timeout: 20000,
        })
      : Promise.reject('No Ahrefs key'),
    // SEMrush Analytics API — overview + sample backlinks + refdomains
    SEMRUSH_API_KEY
      ? axios.get('https://api.semrush.com/analytics/v1/', {
          params: {
            type: 'backlinks_overview',
            key: SEMRUSH_API_KEY,
            target: domain,
            target_type: 'root_domain',
          },
          timeout: 15000,
        })
      : Promise.reject('No SEMrush key'),
    SEMRUSH_API_KEY
      ? axios.get('https://api.semrush.com/analytics/v1/', {
          params: {
            type: 'backlinks',
            key: SEMRUSH_API_KEY,
            target: domain,
            target_type: 'root_domain',
            display_limit: rowLimit,
            export_columns: 'source_url,source_title,target_url,anchor,external_num,internal_num,first_seen,last_seen,page_ascore,domain_ascore',
          },
          timeout: 20000,
        })
      : Promise.reject('No SEMrush key'),
    SEMRUSH_API_KEY
      ? axios.get('https://api.semrush.com/analytics/v1/', {
          params: {
            type: 'backlinks_refdomains',
            key: SEMRUSH_API_KEY,
            target: domain,
            target_type: 'root_domain',
            display_limit: Math.min(rowLimit, 100),
          },
          timeout: 15000,
        })
      : Promise.reject('No SEMrush key'),
    // DataForSEO — summary + live rows
    DATAFORSEO_AUTH
      ? axios.post('https://api.dataforseo.com/v3/backlinks/summary/live',
          [{ target: domain, include_subdomains: true }],
          { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' }, timeout: 20000 })
      : Promise.reject('No DataForSEO auth'),
    DATAFORSEO_AUTH
      ? axios.post('https://api.dataforseo.com/v3/backlinks/backlinks/live',
          [{ target: domain, mode: 'as_is', limit: rowLimit, order_by: ['rank,desc'] }],
          { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' }, timeout: 25000 })
      : Promise.reject('No DataForSEO auth'),
    // Serpstat — summary + sample new backlinks + ref domains
    SERPSTAT_API_KEY
      ? serpstatRpc('SerpstatBacklinksProcedure.getSummaryV2', { query: domain, searchType: 'domain' })
      : Promise.reject('No Serpstat key'),
    SERPSTAT_API_KEY
      ? serpstatRpc('SerpstatBacklinksProcedure.getNewBacklinks', {
          query: domain,
          searchType: 'domain',
          page: 1,
          size: Math.min(rowLimit, 100),
        })
      : Promise.reject('No Serpstat key'),
    SERPSTAT_API_KEY
      ? serpstatRpc('SerpstatBacklinksProcedure.getRefDomains', {
          query: domain,
          searchType: 'domain',
          page: 1,
          size: Math.min(rowLimit, 100),
        })
      : Promise.reject('No Serpstat key'),
    // Morningscore Links (only if domain is registered in the MS account)
    MORNINGSCORE_API_KEY
      ? morningscoreResolveDomainId(domain).then(async (resolved) => {
          if (!resolved) {
            return { skipped: true, reason: 'domain_not_in_morningscore_account' }
          }
          const pageSize = Math.min(rowLimit, 100)
          const payload = await morningscoreGet(`/v1/${resolved.id}/backlinks?page=1&per_page=${pageSize}`, 25000)
          return { resolved, payload }
        })
      : Promise.reject('No Morningscore key'),
  ])

  const [
    ahrefsStats,
    ahrefsRD,
    ahrefsRows,
    semrushOverview,
    semrushRows,
    semrushRD,
    dataforseoSummary,
    dataforseoRows,
    serpstatSummary,
    serpstatRows,
    serpstatRD,
    morningscore,
  ] = calls

  // ---- Ahrefs ----
  if (ahrefsStats.status === 'fulfilled' || ahrefsRD.status === 'fulfilled' || ahrefsRows.status === 'fulfilled') {
    result.sources.ahrefs = {}
    if (ahrefsStats.status === 'fulfilled') {
      result.sources.ahrefs.stats = ahrefsStats.value.data ?? ahrefsStats.value
      const metrics = result.sources.ahrefs.stats?.metrics || result.sources.ahrefs.stats
      if (metrics?.live_refdomains != null) result.summary.refDomains = Number(metrics.live_refdomains) || result.summary.refDomains
      if (metrics?.live != null) result.summary.total = Math.max(result.summary.total, Number(metrics.live) || 0)
    } else if (AHREFS_API_KEY) {
      result.softDegraded.push('Ahrefs(stats)')
    }
    if (ahrefsRD.status === 'fulfilled') {
      result.sources.ahrefs.refdomains = ahrefsRD.value.data ?? ahrefsRD.value
    } else if (AHREFS_API_KEY) {
      result.softDegraded.push('Ahrefs(refdomains)')
    }
    if (ahrefsRows.status === 'fulfilled') {
      result.sources.ahrefs.backlinks = ahrefsRows.value.data ?? ahrefsRows.value
      const rows = Array.isArray(result.sources.ahrefs.backlinks?.backlinks)
        ? result.sources.ahrefs.backlinks.backlinks
        : Array.isArray(result.sources.ahrefs.backlinks)
          ? result.sources.ahrefs.backlinks
          : []
      for (const b of rows) {
        result.normalized.push({
          url_from: b.url_from || b.source_url || '',
          domain_from: (() => {
            try { return new URL(String(b.url_from || '')).hostname.replace(/^www\./, '') } catch { return b.domain_from || '' }
          })(),
          url_to: b.url_to || b.target_url || '',
          rank: Number(b.domain_rating_source ?? b.domain_rating ?? b.ascore ?? 0) || 0,
          dofollow: b.is_dofollow !== false && b.dofollow !== false,
          anchor: b.anchor || b.title || '',
          first_seen: b.first_seen || '',
          source: 'ahrefs',
        })
      }
    } else if (AHREFS_API_KEY) {
      result.softDegraded.push('Ahrefs(rows)')
    }
    if (!result.activeSources.includes('Ahrefs')) result.activeSources.push('Ahrefs')
  } else if (AHREFS_API_KEY) {
    result.softDegraded.push('Ahrefs')
  }

  // ---- SEMrush ----
  if (semrushOverview.status === 'fulfilled' || semrushRows.status === 'fulfilled' || semrushRD.status === 'fulfilled') {
    result.sources.semrush = {}
    if (semrushOverview.status === 'fulfilled') {
      const ovRows = parseSemrushCSV(semrushOverview.value.data)
      result.sources.semrush.overview = ovRows[0] || ovRows
      const ov = ovRows[0] || {}
      const total = Number(ov.total ?? ov.Total ?? 0) || 0
      const follows = Number(ov.follows_num ?? ov.Follows ?? 0) || 0
      const nofollows = Number(ov.nofollows_num ?? ov.Nofollows ?? 0) || 0
      const domainsNum = Number(ov.domains_num ?? ov.Domains ?? 0) || 0
      if (total) result.summary.total = Math.max(result.summary.total, total)
      if (follows) result.summary.dofollow = Math.max(result.summary.dofollow, follows)
      if (nofollows) result.summary.nofollow = Math.max(result.summary.nofollow, nofollows)
      if (domainsNum) result.summary.refDomains = result.summary.refDomains ?? domainsNum
    } else if (SEMRUSH_API_KEY) {
      result.softDegraded.push('SEMrush(overview)')
    }
    if (semrushRD.status === 'fulfilled') {
      result.sources.semrush.refdomains = parseSemrushCSV(semrushRD.value.data)
    } else if (SEMRUSH_API_KEY) {
      result.softDegraded.push('SEMrush(refdomains)')
    }
    if (semrushRows.status === 'fulfilled') {
      const rows = parseSemrushCSV(semrushRows.value.data)
      result.sources.semrush.backlinks = rows
      for (const b of rows) {
        const sourceUrl = String(b.source_url || b.sourceurl || b.url_from || '')
        let domainFrom = String(b.source_domain || b.domain_from || '')
        if (!domainFrom && sourceUrl) {
          try { domainFrom = new URL(sourceUrl).hostname.replace(/^www\./, '') } catch { /* ignore */ }
        }
        result.normalized.push({
          url_from: sourceUrl,
          domain_from: domainFrom,
          url_to: b.target_url || b.url_to || '',
          rank: Number(b.domain_ascore ?? b.page_ascore ?? b.ascore ?? 0) || 0,
          dofollow: !String(b.form || b.nofollow || '').toLowerCase().includes('true'),
          anchor: b.anchor || b.source_title || '',
          first_seen: b.first_seen || '',
          source: 'semrush',
        })
      }
    } else if (SEMRUSH_API_KEY) {
      result.softDegraded.push('SEMrush(rows)')
    }
    if (!result.activeSources.includes('SEMrush')) result.activeSources.push('SEMrush')
  } else if (SEMRUSH_API_KEY) {
    result.softDegraded.push('SEMrush')
  }

  // ---- DataForSEO (stable) ----
  if (dataforseoSummary.status === 'fulfilled' || dataforseoRows.status === 'fulfilled') {
    result.sources.dataforseo = {}
    if (dataforseoSummary.status === 'fulfilled') {
      const summaryRow = dataforseoSummary.value.data?.tasks?.[0]?.result?.[0]
      result.sources.dataforseo.summary = summaryRow
      if (summaryRow) {
        const bl = Number(summaryRow.backlinks ?? summaryRow.backlinks_count ?? 0) || 0
        const refs = Number(summaryRow.referring_domains ?? summaryRow.referringDomains ?? 0) || 0
        const follow = Number(summaryRow.referring_links_dofollow ?? summaryRow.dofollow ?? 0) || 0
        const nofollow = Number(summaryRow.referring_links_nofollow ?? summaryRow.nofollow ?? 0) || 0
        if (bl) result.summary.total = Math.max(result.summary.total, bl)
        if (refs) result.summary.refDomains = result.summary.refDomains ?? refs
        if (follow) result.summary.dofollow = Math.max(result.summary.dofollow, follow)
        if (nofollow) result.summary.nofollow = Math.max(result.summary.nofollow, nofollow)
      }
    } else if (DATAFORSEO_AUTH) {
      result.softDegraded.push('DataForSEO(summary)')
    }
    if (dataforseoRows.status === 'fulfilled') {
      const rowPayload = dataforseoRows.value.data?.tasks?.[0]?.result?.[0]
      result.sources.dataforseo.backlinks = rowPayload
      const items = Array.isArray(rowPayload?.items) ? rowPayload.items : []
      for (const b of items) {
        result.normalized.push({
          url_from: b.url_from || '',
          domain_from: b.domain_from || '',
          url_to: b.url_to || '',
          rank: Number(b.rank ?? b.domain_from_rank ?? 0) || 0,
          dofollow: b.dofollow !== false && b.is_dofollow !== false,
          anchor: b.anchor || '',
          first_seen: b.first_seen || '',
          source: 'dataforseo',
        })
      }
    } else if (DATAFORSEO_AUTH) {
      result.softDegraded.push('DataForSEO(rows)')
    }
    if (!result.activeSources.includes('DataForSEO')) result.activeSources.push('DataForSEO')
  } else if (DATAFORSEO_AUTH) {
    result.softDegraded.push('DataForSEO')
  }

  // ---- Serpstat (stable) ----
  if (serpstatSummary.status === 'fulfilled' || serpstatRows.status === 'fulfilled' || serpstatRD.status === 'fulfilled') {
    result.sources.serpstat = {}
    if (serpstatSummary.status === 'fulfilled') {
      result.sources.serpstat.summary = serpstatSummary.value
      const serpstatNorm = backlinksFromSerpstat(serpstatSummary.value)
      if (serpstatNorm && typeof serpstatNorm === 'object' && !Array.isArray(serpstatNorm)) {
        result.sources.serpstat_summary = serpstatNorm
        if (serpstatNorm.backlinks != null) result.summary.total = Math.max(result.summary.total, Number(serpstatNorm.backlinks) || 0)
        if (serpstatNorm.refDomains != null) result.summary.refDomains = result.summary.refDomains ?? Number(serpstatNorm.refDomains)
      }
      const data = serpstatSummary.value?.result?.data || serpstatSummary.value?.data || {}
      const refs = Number(data.referring_domains ?? 0) || 0
      if (refs) result.summary.refDomains = result.summary.refDomains ?? refs
    } else if (SERPSTAT_API_KEY) {
      result.softDegraded.push('Serpstat(summary)')
    }
    if (serpstatRD.status === 'fulfilled') {
      result.sources.serpstat.refdomains = serpstatRD.value
    } else if (SERPSTAT_API_KEY) {
      result.softDegraded.push('Serpstat(refdomains)')
    }
    if (serpstatRows.status === 'fulfilled') {
      result.sources.serpstat.backlinks = serpstatRows.value
      const rows =
        serpstatRows.value?.result?.data ||
        serpstatRows.value?.data ||
        (Array.isArray(serpstatRows.value) ? serpstatRows.value : [])
      if (Array.isArray(rows)) {
        for (const b of rows) {
          result.normalized.push({
            url_from: b.url_from || b.urlFrom || '',
            domain_from: b.domain_from || b.domainFrom || (() => {
              try { return new URL(String(b.url_from || '')).hostname.replace(/^www\./, '') } catch { return '' }
            })(),
            url_to: b.url_to || b.urlTo || '',
            rank: Number(b.domainRank ?? b.domain_rank ?? b.rank ?? 0) || 0,
            dofollow: b.nofollow !== true && b.is_nofollow !== true,
            anchor: b.anchor || b.link_text || '',
            first_seen: b.first_seen || b.firstSeen || '',
            source: 'serpstat',
          })
        }
      }
    } else if (SERPSTAT_API_KEY) {
      result.softDegraded.push('Serpstat(rows)')
    }
    if (!result.activeSources.includes('Serpstat')) result.activeSources.push('Serpstat')
  } else if (SERPSTAT_API_KEY) {
    result.softDegraded.push('Serpstat')
  }

  // ---- Morningscore (stable / account-scoped domains only) ----
  if (morningscore.status === 'fulfilled') {
    const ms = morningscore.value as any
    if (ms?.skipped) {
      result.sources.morningscore = { available: false, reason: ms.reason }
    } else if (ms?.payload) {
      result.sources.morningscore = {
        domainId: ms.resolved?.id,
        domain: ms.resolved?.domain,
        total: ms.payload.total,
        page: ms.payload.page,
        per_page: ms.payload.per_page,
        sample: Array.isArray(ms.payload.data) ? ms.payload.data.slice(0, 20) : ms.payload.data,
      }
      const total = Number(ms.payload.total ?? 0) || 0
      if (total) result.summary.total = Math.max(result.summary.total, total)
      const rows = Array.isArray(ms.payload.data) ? ms.payload.data : []
      for (const b of rows) {
        const host = String(b.link || b.domain || b.domain_from || '')
        result.normalized.push({
          url_from: host.startsWith('http') ? host : (host ? `https://${host}` : ''),
          domain_from: host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, ''),
          url_to: domain,
          rank: Number(b.strength ?? b.score ?? b.rank ?? 0) || 0,
          dofollow: true,
          anchor: b.anchor || '',
          first_seen: b.date || '',
          source: 'morningscore',
        })
      }
      if (!result.activeSources.includes('Morningscore')) result.activeSources.push('Morningscore')
    }
  } else if (MORNINGSCORE_API_KEY) {
    result.softDegraded.push('Morningscore')
  }

  // SE Ranking: env may have a key, but live auth is currently unstable across Token/Bearer.
  // Keep silent skip — no failing request spam in softDegraded.
  if (SE_RANKING_API) {
    result.sources.seranking = {
      configured: true,
      active: false,
      note: 'SE Ranking token present but live backlinks API auth is not stable; skipped until key is validated',
    }
  }

  // Deduplicate + quality-score only REAL per-domain backlinks (target host must match domain)
  if (Array.isArray(result.normalized) && result.normalized.length) {
    const scored = normalizeBacklinkInventory(result.normalized, domain)
    result.normalized = scored.rows
    result.normalizedAll = scored.rows
    result.summary = {
      ...result.summary,
      ...scored.summaryPatch,
    }
    const fromRowsFollow = scored.rows.filter((r) => r.dofollow).length
    const fromRowsNoFollow = scored.rows.length - fromRowsFollow
    // Prefer provider summary totals when present; never invent. Fall back to row counts.
    if (!result.summary.total) result.summary.total = scored.rows.length
    if (!result.summary.dofollow) result.summary.dofollow = fromRowsFollow
    if (!result.summary.nofollow) result.summary.nofollow = fromRowsNoFollow
  }

  // ---- Referring domains inventory (multi-source, normalized) ----
  type RefDomainRow = {
    domain: string
    rank: number
    backlinks: number
    dofollow: number | null
    first_seen: string
    last_seen: string
    source: string
  }
  const refByKey = new Map<string, RefDomainRow>()
  const upsertRef = (raw: Partial<RefDomainRow> & { domain?: string }) => {
    const domainName = String(raw.domain || '')
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .trim()
      .toLowerCase()
    if (!domainName) return
    const key = `${domainName}|${String(raw.source || 'unknown').toLowerCase()}`
    const prev = refByKey.get(key)
    if (!prev) {
      refByKey.set(key, {
        domain: domainName,
        rank: Number(raw.rank || 0) || 0,
        backlinks: Number(raw.backlinks || 0) || 0,
        dofollow: raw.dofollow == null ? null : Number(raw.dofollow) || 0,
        first_seen: raw.first_seen || '',
        last_seen: raw.last_seen || '',
        source: String(raw.source || 'unknown').toLowerCase(),
      })
      return
    }
    prev.rank = Math.max(prev.rank, Number(raw.rank || 0) || 0)
    prev.backlinks = Math.max(prev.backlinks, Number(raw.backlinks || 0) || 0)
    if (raw.dofollow != null) prev.dofollow = Math.max(Number(prev.dofollow || 0), Number(raw.dofollow) || 0)
    if (raw.first_seen && !prev.first_seen) prev.first_seen = raw.first_seen
    if (raw.last_seen) prev.last_seen = raw.last_seen
  }

  // Ahrefs refdomains payload
  {
    const payload = result.sources?.ahrefs?.refdomains
    const rows = Array.isArray(payload?.refdomains)
      ? payload.refdomains
      : Array.isArray(payload)
        ? payload
        : []
    for (const r of rows) {
      upsertRef({
        domain: r.domain || r.referring_domain || r.host || '',
        rank: Number(r.domain_rating ?? r.rank ?? r.dr ?? 0) || 0,
        backlinks: Number(r.backlinks ?? r.links ?? r.dofollow_links ?? 0) || 0,
        dofollow: r.dofollow_links != null ? Number(r.dofollow_links) || 0 : null,
        first_seen: r.first_seen || '',
        last_seen: r.last_seen || '',
        source: 'ahrefs',
      })
    }
  }

  // SEMrush refdomains CSV-parsed rows
  if (Array.isArray(result.sources?.semrush?.refdomains)) {
    for (const r of result.sources.semrush.refdomains as any[]) {
      upsertRef({
        domain: r.domain || r.source_domain || r.Domain || r.ascore_domain || '',
        rank: Number(r.domain_ascore ?? r.ascore ?? r.Domain_ascore ?? 0) || 0,
        backlinks: Number(r.backlinks_num ?? r.backlinks ?? r.links_num ?? 0) || 0,
        dofollow: r.forms_num != null ? Number(r.forms_num) || 0 : null,
        first_seen: r.first_seen || '',
        last_seen: r.last_seen || '',
        source: 'semrush',
      })
    }
  }

  // Serpstat refdomains
  {
    const payload = result.sources?.serpstat?.refdomains
    const rows =
      payload?.result?.data ||
      payload?.data ||
      (Array.isArray(payload) ? payload : [])
    if (Array.isArray(rows)) {
      for (const r of rows) {
        upsertRef({
          domain: r.domain || r.referring_domain || r.domain_from || '',
          rank: Number(r.domain_rank ?? r.domainRank ?? r.rank ?? 0) || 0,
          backlinks: Number(r.links ?? r.backlinks ?? r.links_count ?? 0) || 0,
          dofollow: r.nofollow === true ? 0 : (r.dofollow_links != null ? Number(r.dofollow_links) : null),
          first_seen: r.first_seen || r.firstSeen || '',
          last_seen: r.last_seen || r.lastSeen || '',
          source: 'serpstat',
        })
      }
    }
  }

  // DataForSEO referring domains (extra live call; best-effort)
  if (DATAFORSEO_AUTH) {
    try {
      const rdRes = await axios.post(
        'https://api.dataforseo.com/v3/backlinks/referring_domains/live',
        [{ target: domain, limit: Math.min(rowLimit, 100), order_by: ['rank,desc'] }],
        {
          headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' },
          timeout: 25000,
        },
      )
      const items = rdRes.data?.tasks?.[0]?.result?.[0]?.items
      result.sources.dataforseo = result.sources.dataforseo || {}
      result.sources.dataforseo.refdomains = rdRes.data?.tasks?.[0]?.result?.[0] || rdRes.data
      if (Array.isArray(items) && items.length) {
        for (const r of items) {
          upsertRef({
            domain: r.domain || r.domain_from || r.referring_domain || '',
            rank: Number(r.rank ?? r.domain_from_rank ?? 0) || 0,
            backlinks: Number(r.backlinks ?? r.links_count ?? 0) || 0,
            dofollow: r.backlinks_dofollow != null ? Number(r.backlinks_dofollow) || 0 : (r.dofollow === false ? 0 : null),
            first_seen: r.first_seen || '',
            last_seen: r.last_seen || '',
            source: 'dataforseo',
          })
        }
        if (!result.activeSources.includes('DataForSEO')) result.activeSources.push('DataForSEO')
      }
    } catch {
      if (DATAFORSEO_AUTH) result.softDegraded.push('DataForSEO(refdomains)')
    }
  }

  // Derive domains from normalized link rows when provider RD lists are empty
  if (Array.isArray(result.normalized)) {
    const derived = new Map<string, RefDomainRow>()
    for (const row of result.normalized) {
      const d = String(row.domain_from || '')
        .replace(/^www\./, '')
        .toLowerCase()
      if (!d) continue
      const key = `${d}|${String(row.source || 'unknown').toLowerCase()}`
      const prev = derived.get(key)
      if (!prev) {
        derived.set(key, {
          domain: d,
          rank: Number(row.rank || 0) || 0,
          backlinks: 1,
          dofollow: row.dofollow ? 1 : 0,
          first_seen: row.first_seen || '',
          last_seen: '',
          source: String(row.source || 'unknown').toLowerCase(),
        })
      } else {
        prev.backlinks += 1
        prev.rank = Math.max(prev.rank, Number(row.rank || 0) || 0)
        if (row.dofollow) prev.dofollow = Number(prev.dofollow || 0) + 1
        if (row.first_seen && !prev.first_seen) prev.first_seen = row.first_seen
      }
    }
    // Only add derived rows for domains we don't already have from RD endpoints
    for (const row of derived.values()) {
      const hasProviderList = Array.from(refByKey.keys()).some((k) => k.startsWith(`${row.domain}|`))
      if (!hasProviderList) upsertRef(row)
    }
  }

  result.refdomains = Array.from(refByKey.values())
    .map((r) => {
      const host = String(r.domain || '').toLowerCase()
      const tld = host.includes('.') ? `.${host.split('.').pop()}` : ''
      const spam = BACKLINK_SPAM_HOST_HINTS.some((h) => host.includes(h)) || BACKLINK_SPAM_TLDS.has(tld)
      return { ...r, quality: spam ? 'spam' : ((Number(r.rank) || 0) < 15 ? 'risky' : 'relevant') }
    })
    .sort((a, b) => {
      const qRank = { relevant: 0, risky: 1, spam: 2 } as Record<string, number>
      const qd = (qRank[a.quality] ?? 9) - (qRank[b.quality] ?? 9)
      if (qd !== 0) return qd
      return (b.rank - a.rank) || (b.backlinks - a.backlinks) || a.domain.localeCompare(b.domain)
    })
  if (!result.summary.refDomains) {
    const uniqueDomains = new Set(result.refdomains.map((r: RefDomainRow) => r.domain))
    if (uniqueDomains.size) result.summary.refDomains = uniqueDomains.size
  }

  if (!result.normalized.length && !result.refdomains.length && !result.activeSources.length) result.dataState = 'unavailable'
  result.linkIntel = computeLinkIntel({
    normalizedLinks: result.normalized,
    refdomains: result.refdomains,
    domain,
  })
  const stampedBacklinks = stampPayload(result, domain, {
    foreignRowsDropped: Number(result.summary?.droppedWrongTarget || 0) || 0,
  })
  if (stampedBacklinks.activeSources.length || stampedBacklinks.normalized.length || stampedBacklinks.refdomains?.length) {
    void persistSnapshot(domain, 'backlinks_agg', stampedBacklinks)
  }
  res.json(stampedBacklinks)
})

// Aggregated top pages — SEMrush domain_organic_unique + DataForSEO relevant_pages + keyword URL rollup
app.get('/api/pages/aggregated', expensiveLimiter, async (req, res) => {
  const { domain, limit, refresh } = req.query as Record<string, string>
  if (!domain?.trim()) return res.status(400).json({ error: 'domain required' })
  const pack = marketFromRequest(req, domain)
  const forceRefresh = refresh === '1' || refresh === 'true'
  const pageLimit = Math.min(Math.max(Number(limit) || 100, 10), 500)

  if (!forceRefresh) {
    const cached = await loadSnapshotPayload(domain, 'pages_agg')
    if (cached?.data && (Array.isArray(cached.data.normalized) ? cached.data.normalized.length > 0 : Object.keys(cached.data.sources || {}).length > 0)) {
      const snap = { ...cached.data, market: pack, dataState: 'cached', fetchedAt: cached.fetchedAt, fromSnapshot: true }
      if (Array.isArray(snap.normalized)) {
        const pageIntegrity = filterPagesForDomain(snap.normalized, domain)
        snap.normalized = pageIntegrity.rows
        return res.json(stampPayload(snap, domain, { foreignRowsDropped: pageIntegrity.foreignRowsDropped }))
      }
      return res.json(stampPayload(snap, domain))
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

  const today = new Date().toISOString().slice(0, 10)
  const calls = await Promise.allSettled([
    SEMRUSH_API_KEY
      ? axios.get('https://api.semrush.com/', {
          params: {
            type: 'domain_organic_unique',
            key: SEMRUSH_API_KEY,
            domain,
            database: pack.semrushDatabase,
            display_limit: pageLimit,
            export_columns: 'Ur,Pc,Tg,Tr',
          },
          timeout: 15000,
        })
      : Promise.reject(new Error('No SEMrush key')),
    DATAFORSEO_AUTH
      ? axios.post(
          'https://api.dataforseo.com/v3/dataforseo_labs/google/relevant_pages/live',
          [{
            target: domain,
            language_name: pack.dfsLanguageName,
            location_code: pack.dfsLocationCode,
            limit: pageLimit,
          }],
          { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' }, timeout: 20000 },
        )
      : Promise.reject(new Error('No DataForSEO key')),
    DATAFORSEO_AUTH
      ? axios.post(
          'https://api.dataforseo.com/v3/backlinks/domain_pages_summary/live',
          [{ target: domain, include_subdomains: true, limit: Math.min(pageLimit, 100) }],
          { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' }, timeout: 15000 },
        )
      : Promise.reject(new Error('No DataForSEO key')),
    AHREFS_API_KEY
      ? axios.get('https://api.ahrefs.com/v3/site-explorer/top-pages', {
          params: {
            target: domain,
            date: today,
            mode: 'subdomains',
            limit: Math.min(pageLimit, 100),
            select: 'url,sum_traffic,keywords',
          },
          headers: { Authorization: `Bearer ${AHREFS_API_KEY}` },
          timeout: 15000,
        })
      : Promise.reject(new Error('No Ahrefs key')),
  ])

  const [semrushRes, dfsRelevantRes, dfsDomainPagesRes, ahrefsPagesRes] = calls

  if (semrushRes.status === 'fulfilled') {
    result.sources.semrush = parseSemrushCSV(semrushRes.value.data)
    if (Array.isArray(result.sources.semrush) && result.sources.semrush.length) result.activeSources.push('SEMrush')
  }
  if (dfsRelevantRes.status === 'fulfilled') {
    result.sources.dataforseo_relevant = dfsRelevantRes.value.data
    const items = dfsRelevantRes.value.data?.tasks?.[0]?.result?.[0]?.items
    if (Array.isArray(items) && items.length) result.activeSources.push('DataForSEO')
  }
  if (dfsDomainPagesRes.status === 'fulfilled') {
    result.sources.dataforseo_domain_pages = dfsDomainPagesRes.value.data?.tasks?.[0]?.result?.[0]
    if (result.sources.dataforseo_domain_pages && !result.activeSources.includes('DataForSEO')) {
      result.activeSources.push('DataForSEO')
    }
  }
  if (ahrefsPagesRes.status === 'fulfilled') {
    result.sources.ahrefs_top_pages = ahrefsPagesRes.value.data ?? ahrefsPagesRes.value
    const pages = result.sources.ahrefs_top_pages?.pages || result.sources.ahrefs_top_pages
    if (Array.isArray(pages) && pages.length && !result.activeSources.includes('Ahrefs')) {
      result.activeSources.push('Ahrefs')
    }
  } else if (AHREFS_API_KEY) {
    result.softDegraded.push('Ahrefs')
  }

  // Rollup keywords inventory by landing URL (cached snapshot — free population signal)
  let keywordSnap: KeywordRow[] = []
  try {
    const kw = await loadSnapshotPayload(domain, 'keywords_agg')
    if (Array.isArray(kw?.data?.normalized)) keywordSnap = kw.data.normalized as KeywordRow[]
  } catch {
    keywordSnap = []
  }

  type PageRow = {
    url: string
    title: string
    status: number
    traffic: number
    keywords: number
    backlinks: number
    score: number
    contentType: string
    lastCrawled: string
    wordCount: number
    loadTime: number
    source: string
  }

  const byUrl = new Map<string, PageRow>()

  const normalizeUrl = (raw: string) => {
    if (!raw) return ''
    const u = String(raw).trim()
    if (!u) return ''
    try {
      if (u.startsWith('http')) {
        const parsed = new URL(u)
        return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname === '/' ? '' : parsed.pathname}`.replace(/\/$/, '') || parsed.hostname
      }
    } catch { /* keep raw */ }
    return u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')
  }

  const ensure = (rawUrl: string, source: string): PageRow | null => {
    const key = normalizeUrl(rawUrl)
    if (!key) return null
    let row = byUrl.get(key)
    if (!row) {
      row = {
        url: rawUrl.startsWith('http') ? rawUrl : `https://${key}`,
        title: key,
        status: 200,
        traffic: 0,
        keywords: 0,
        backlinks: 0,
        score: 0,
        contentType: /\/blog\//i.test(key) || /\/post\//i.test(key) ? 'blog' : 'page',
        lastCrawled: '',
        wordCount: 0,
        loadTime: 0,
        source,
      }
      byUrl.set(key, row)
    } else if (source && !row.source.includes(source)) {
      row.source = `${row.source}+${source}`
    }
    return row
  }

  // SEMrush unique pages: Ur,Pc,Tg,Tr
  if (Array.isArray(result.sources.semrush)) {
    for (const row of result.sources.semrush as any[]) {
      if (Array.isArray(row)) {
        const r = ensure(row[0], 'SEMrush')
        if (!r) continue
        r.keywords = Math.max(r.keywords, parseInt(row[1], 10) || 0)
        r.traffic = Math.max(r.traffic, parseFloat(row[2]) || parseFloat(row[3]) || 0)
        r.title = r.url
      } else if (row && typeof row === 'object') {
        const url = row.Ur || row.url || row.Url || ''
        const r = ensure(url, 'SEMrush')
        if (!r) continue
        r.keywords = Math.max(r.keywords, parseInt(row.Pc || row.keywords || '0', 10) || 0)
        r.traffic = Math.max(r.traffic, parseFloat(row.Tg || row.Tr || row.traffic || '0') || 0)
      }
    }
  }

  // DataForSEO relevant_pages items
  const dfsItems = result.sources.dataforseo_relevant?.tasks?.[0]?.result?.[0]?.items
  if (Array.isArray(dfsItems)) {
    for (const item of dfsItems) {
      const url = item.page_address || item.url || item.page || ''
      const r = ensure(url, 'DataForSEO')
      if (!r) continue
      const metrics = item.metrics?.organic || item.metrics || {}
      r.keywords = Math.max(r.keywords, metrics.count || metrics.keywords || item.metrics?.organic?.count || 0)
      r.traffic = Math.max(r.traffic, metrics.etv || metrics.traffic || item.metrics?.organic?.etv || 0)
      if (item.title) r.title = item.title
      r.backlinks = Math.max(r.backlinks, item.backlinks || item.referring_pages || 0)
      r.score = Math.max(r.score, Math.min(100, Math.round((metrics.is_new || 0) ? 70 : Math.min(99, (metrics.count || 0) > 20 ? 90 : 75))))
    }
  }

  // DataForSEO domain_pages_summary (backlink-rich pages)
  const dpItems = result.sources.dataforseo_domain_pages?.items
  if (Array.isArray(dpItems)) {
    for (const item of dpItems) {
      const url = item.page || item.url || item.target || ''
      const r = ensure(url, 'DataForSEO-BL')
      if (!r) continue
      r.backlinks = Math.max(r.backlinks, item.backlinks || item.referring_pages || 0)
      if (item.first_seen) r.lastCrawled = String(item.first_seen).slice(0, 10)
      if (item.title) r.title = item.title
    }
  }

  // Ahrefs top pages (stable when select is provided)
  {
    const pages =
      result.sources.ahrefs_top_pages?.pages ||
      (Array.isArray(result.sources.ahrefs_top_pages) ? result.sources.ahrefs_top_pages : [])
    if (Array.isArray(pages)) {
      for (const item of pages) {
        const rawUrl = String(item?.url || item?.page || '')
        const r = ensure(rawUrl, 'Ahrefs')
        if (!r) continue
        r.traffic = Math.max(r.traffic, Number(item?.sum_traffic ?? item?.traffic ?? 0) || 0)
        r.keywords = Math.max(r.keywords, Number(item?.keywords ?? item?.keywords_count ?? 0) || 0)
      }
    }
  }

  // Keyword inventory rollup by URL
  for (const kw of keywordSnap) {
    if (!kw?.url) continue
    const r = ensure(kw.url, 'Keywords')
    if (!r) continue
    r.keywords += 1
    r.traffic = Math.max(r.traffic, Number(kw.traffic) || 0)
    if (kw.keyword && r.title === normalizeUrl(kw.url)) r.title = kw.keyword
  }

  // Merge technical on-page signals from latest site-audit snapshot when available
  try {
    const audit = await loadSnapshotPayload(domain, 'site_audit_agg')
    const auditPages = Array.isArray(audit?.data?.pages) ? audit.data.pages : []
    if (auditPages.length) {
      result.sources.onpage_from_site_audit = {
        pages: auditPages.length,
        fetchedAt: audit?.fetchedAt || null,
      }
      if (!result.activeSources.includes('On-Page audit')) result.activeSources.push('On-Page audit')
      const byAuditUrl = new Map<string, any>()
      for (const ap of auditPages) {
        const key = normalizeUrl(ap.url || '')
        if (key) byAuditUrl.set(key, ap)
      }
      for (const p of byUrl.values()) {
        const ap = byAuditUrl.get(normalizeUrl(p.url))
        if (!ap) continue
        if (ap.status) p.status = Number(ap.status) || p.status
        if (ap.title && (p.title === normalizeUrl(p.url) || !p.title)) p.title = ap.title
        if (ap.wordCount) p.wordCount = Math.max(p.wordCount, Number(ap.wordCount) || 0)
        if (ap.loadTime) p.loadTime = Math.max(p.loadTime, Number(ap.loadTime) || 0)
        if (ap.onpageScore != null) p.score = Math.max(p.score, Math.round(Number(ap.onpageScore) || 0))
        ;(p as any).description = ap.description || (p as any).description || ''
        ;(p as any).h1 = ap.h1 || (p as any).h1 || ''
        ;(p as any).onpageIssues = Array.isArray(ap.issues) ? ap.issues.slice(0, 8) : []
        if (!(p as any).source?.includes('On-Page')) (p as any).source = `${p.source}+On-Page`
      }
    }
  } catch {
    // optional enrichment
  }

  const normalized = Array.from(byUrl.values())
    .map((p) => ({
      ...p,
      description: (p as any).description || '',
      h1: (p as any).h1 || '',
      onpageIssues: Array.isArray((p as any).onpageIssues) ? (p as any).onpageIssues : [],
      score: p.score || Math.min(99, 40 + Math.min(40, p.keywords) + Math.min(15, Math.round(p.traffic / 100)) + Math.min(10, Math.round(p.backlinks / 10))),
      lastCrawled: p.lastCrawled || result.fetchedAt.slice(0, 10),
    }))
    .sort((a, b) => (b.traffic - a.traffic) || (b.keywords - a.keywords) || (b.backlinks - a.backlinks))

  const pageIntegrity = filterPagesForDomain(normalized, domain)
  result.normalized = pageIntegrity.rows
  result.summary = {
    total: pageIntegrity.rows.length,
    healthy: pageIntegrity.rows.filter((p) => p.status >= 200 && p.status < 300).length,
    redirects: pageIntegrity.rows.filter((p) => p.status >= 300 && p.status < 400).length,
    errors: pageIntegrity.rows.filter((p) => p.status >= 400).length,
    withTraffic: pageIntegrity.rows.filter((p) => p.traffic > 0).length,
    withOnpage: pageIntegrity.rows.filter((p) => (p.wordCount > 0 || (p as any).h1 || (Array.isArray((p as any).onpageIssues) && (p as any).onpageIssues.length))).length,
  }
  const stampedPages = stampPayload(result, domain, { foreignRowsDropped: pageIntegrity.foreignRowsDropped })

  if (stampedPages.activeSources.length || pageIntegrity.rows.length) void persistSnapshot(domain, 'pages_agg', stampedPages)
  if (!pageIntegrity.rows.length && !stampedPages.activeSources.length) stampedPages.dataState = 'unavailable'
  res.json(stampedPages)
})

// Aggregated technical site audit — DataForSEO On-Page + PageSpeed SEO + backlink risk signals
app.get('/api/site-audit/aggregated', expensiveLimiter, async (req, res) => {
  const { domain, refresh, max_pages } = req.query as Record<string, string>
  if (!domain?.trim()) return res.status(400).json({ error: 'domain required' })
  const pack = marketFromRequest(req, domain)
  const forceRefresh = refresh === '1' || refresh === 'true'
  const crawlLimit = Math.min(Math.max(Number(max_pages) || 20, 5), 50)
  const cleanDomain = String(domain).replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./, '')
  const targetUrl = `https://${cleanDomain}`

  if (!forceRefresh) {
    const cached = await loadSnapshotPayload(domain, 'site_audit_agg')
    if (cached?.data && (Array.isArray(cached.data.issues) ? cached.data.issues.length > 0 : Object.keys(cached.data.sources || {}).length > 0)) {
      return res.json({ ...cached.data, domain, market: pack, dataState: 'cached', fetchedAt: cached.fetchedAt, fromSnapshot: true })
    }
  }

  const result: Record<string, any> = {
    domain: cleanDomain,
    market: pack,
    sources: {},
    activeSources: [] as string[],
    softDegraded: [] as string[],
    summary: {
      pagesCrawled: 0,
      issuesTotal: 0,
      errors: 0,
      warnings: 0,
      notices: 0,
      onpageScore: null as number | null,
      lighthouseSeo: null as number | null,
      performanceMobile: null as number | null,
      brokenBacklinks: null as number | null,
      brokenPages: null as number | null,
    },
    issues: [] as any[],
    pages: [] as any[],
    dataState: 'live',
    fetchedAt: new Date().toISOString(),
  }

  const issuePush = (issue: {
    id: string
    severity: 'error' | 'warning' | 'notice'
    category: string
    title: string
    detail?: string
    url?: string
    source: string
  }) => {
    result.issues.push(issue)
  }

  // 1) DataForSEO On-Page crawl (stable technical SEO source)
  if (DATAFORSEO_AUTH) {
    try {
      const onpage = await withCache(historicalCache, `dfs_onpage_audit_${cleanDomain}_${crawlLimit}`, async () => {
        const taskRes = await axios.post(
          'https://api.dataforseo.com/v3/on_page/task_post',
          [{
            target: cleanDomain,
            max_crawl_pages: crawlLimit,
            load_resources: false,
            enable_javascript: false,
            enable_browser_rendering: false,
            store_raw_html: false,
          }],
          {
            headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' },
            timeout: 30000,
          },
        )
        const taskId = taskRes.data?.tasks?.[0]?.id
        if (!taskId) throw new Error('No on-page task id')

        let summaryPayload: any = null
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 4000))
          const statusRes = await axios.get(`https://api.dataforseo.com/v3/on_page/summary/${taskId}`, {
            headers: { Authorization: `Basic ${DATAFORSEO_AUTH}` },
            timeout: 20000,
          })
          const task = statusRes.data?.tasks?.[0]
          // 20000 = Ok / task has result
          if (task?.status_code === 20000 && task?.result?.[0]) {
            summaryPayload = statusRes.data
            break
          }
            // 40601 / 40602 still crawling — continue
        }
        if (!summaryPayload) throw new Error('On-page crawl timeout')

        const pagesRes = await axios.get(`https://api.dataforseo.com/v3/on_page/pages/${taskId}`, {
          headers: { Authorization: `Basic ${DATAFORSEO_AUTH}` },
          params: { limit: crawlLimit },
          timeout: 25000,
        })
        return { summary: summaryPayload, pages: pagesRes.data }
      })

      result.sources.dataforseo_onpage = {
        summary: onpage.summary?.tasks?.[0]?.result?.[0] || onpage.summary,
        pages: onpage.pages?.tasks?.[0]?.result?.[0] || onpage.pages,
      }
      const sum = result.sources.dataforseo_onpage.summary || {}
      const pageInfo = result.sources.dataforseo_onpage.pages || {}
      const pageItems = Array.isArray(pageInfo.items) ? pageInfo.items : []
      result.summary.pagesCrawled = Number(sum.crawl_progress?.pages_crawled ?? pageItems.length ?? sum.pages_crawled ?? 0) || pageItems.length
      result.summary.onpageScore = sum.page_metrics?.onpage_score != null
        ? Number(sum.page_metrics.onpage_score)
        : (sum.onpage_score != null ? Number(sum.onpage_score) : null)
      result.summary.brokenPages = Number(sum.page_metrics?.checks?.is_broken ?? sum.checks?.is_broken ?? 0) || null

      // Checks object often comes as counters
      const checks = sum.page_metrics?.checks || sum.checks || {}
      const checkDefs: Array<{ key: string; severity: 'error' | 'warning' | 'notice'; category: string; title: string }> = [
        { key: 'is_4xx_code', severity: 'error', category: 'HTTP', title: '4xx client errors' },
        { key: 'is_5xx_code', severity: 'error', category: 'HTTP', title: '5xx server errors' },
        { key: 'is_broken', severity: 'error', category: 'HTTP', title: 'Broken pages' },
        { key: 'is_redirect', severity: 'notice', category: 'HTTP', title: 'Redirect pages' },
        { key: 'no_title', severity: 'error', category: 'On-Page', title: 'Missing title tags' },
        { key: 'title_too_short', severity: 'warning', category: 'On-Page', title: 'Title too short' },
        { key: 'title_too_long', severity: 'warning', category: 'On-Page', title: 'Title too long' },
        { key: 'no_description', severity: 'warning', category: 'On-Page', title: 'Missing meta description' },
        { key: 'description_too_short', severity: 'notice', category: 'On-Page', title: 'Meta description too short' },
        { key: 'description_too_long', severity: 'notice', category: 'On-Page', title: 'Meta description too long' },
        { key: 'no_h1_tag', severity: 'error', category: 'On-Page', title: 'Missing H1' },
        { key: 'duplicate_title_tag', severity: 'warning', category: 'Duplicates', title: 'Duplicate titles' },
        { key: 'duplicate_description', severity: 'warning', category: 'Duplicates', title: 'Duplicate meta descriptions' },
        { key: 'duplicate_content', severity: 'warning', category: 'Duplicates', title: 'Duplicate content' },
        { key: 'no_image_alt', severity: 'warning', category: 'Accessibility', title: 'Images missing alt text' },
        { key: 'no_favicon', severity: 'notice', category: 'On-Page', title: 'Missing favicon' },
        { key: 'no_doctype', severity: 'notice', category: 'Technical', title: 'Missing doctype' },
        { key: 'is_orphan_page', severity: 'warning', category: 'Internal links', title: 'Orphan pages' },
        { key: 'has_misspelling', severity: 'notice', category: 'Content', title: 'Possible spelling issues' },
        { key: 'low_content_rate', severity: 'warning', category: 'Content', title: 'Thin content' },
        { key: 'high_waiting_time', severity: 'warning', category: 'Performance', title: 'High server response time' },
        { key: 'high_loading_time', severity: 'warning', category: 'Performance', title: 'High page load time' },
        { key: 'size_greater_than_3mb', severity: 'warning', category: 'Performance', title: 'Pages larger than 3MB' },
        { key: 'no_image_title', severity: 'notice', category: 'On-Page', title: 'Images missing title' },
        { key: 'canonical_to_broken', severity: 'error', category: 'Canonical', title: 'Canonical points to broken URL' },
        { key: 'canonical_to_redirect', severity: 'warning', category: 'Canonical', title: 'Canonical points to redirect' },
        { key: 'has_render_blocking_resources', severity: 'warning', category: 'Performance', title: 'Render-blocking resources' },
        { key: 'no_content_encoding', severity: 'notice', category: 'Technical', title: 'Missing content encoding' },
        { key: 'https_to_http_links', severity: 'warning', category: 'Security', title: 'HTTPS pages linking to HTTP' },
        { key: 'is_http', severity: 'warning', category: 'Security', title: 'HTTP (non-HTTPS) pages' },
      ]

      for (const def of checkDefs) {
        const count = Number(checks[def.key] ?? 0) || 0
        if (count > 0) {
          issuePush({
            id: `dfs-${def.key}`,
            severity: def.severity,
            category: def.category,
            title: def.title,
            detail: `${count} page(s)`,
            source: 'dataforseo',
          })
        }
      }

      for (const p of pageItems.slice(0, crawlLimit)) {
        const meta = p.meta || {}
        const checksPage = p.checks || {}
        result.pages.push({
          url: p.url || p.resource || '',
          status: Number(p.status_code || p.statusCode || 0) || 0,
          title: meta.title || p.title || '',
          description: meta.description || '',
          h1: Array.isArray(meta.htags?.h1) ? meta.htags.h1[0] : (meta.h1 || ''),
          wordCount: Number(meta.content?.plain_text_word_count ?? meta.plain_text_word_count ?? p.word_count ?? 0) || 0,
          loadTime: Number(p.page_timing?.duration_time ?? p.load_time ?? 0) || 0,
          size: Number(p.size || p.total_dom_size || 0) || 0,
          onpageScore: p.onpage_score != null ? Number(p.onpage_score) : null,
          issues: Object.entries(checksPage)
            .filter(([, v]) => v === true || (typeof v === 'number' && v > 0))
            .map(([k]) => k)
            .slice(0, 12),
          source: 'dataforseo',
        })
      }

      if (!result.activeSources.includes('DataForSEO On-Page')) result.activeSources.push('DataForSEO On-Page')
    } catch {
      result.softDegraded.push('DataForSEO On-Page')
    }
  } else {
    result.softDegraded.push('DataForSEO On-Page')
  }

  // 2) Homepage instant check (helps when crawl is partial / timed out)
  if (DATAFORSEO_AUTH) {
    try {
      const instant = await withCache(historicalCache, `dfs_instant_${cleanDomain}`, async () => {
        const r = await axios.post(
          'https://api.dataforseo.com/v3/on_page/instant_pages',
          [{
            url: targetUrl,
            enable_javascript: false,
            load_resources: false,
            enable_browser_rendering: false,
          }],
          {
            headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' },
            timeout: 45000,
          },
        )
        return r.data
      })
      result.sources.dataforseo_instant = instant?.tasks?.[0]?.result?.[0] || instant
      const items = instant?.tasks?.[0]?.result?.[0]?.items || []
      const home = Array.isArray(items) ? items[0] : null
      if (home) {
        if (!result.activeSources.includes('DataForSEO Instant')) result.activeSources.push('DataForSEO Instant')
        const meta = home.meta || {}
        if (!meta.title) {
          issuePush({ id: 'home-no-title', severity: 'error', category: 'On-Page', title: 'Homepage missing title', url: targetUrl, source: 'dataforseo' })
        }
        if (!meta.description) {
          issuePush({ id: 'home-no-desc', severity: 'warning', category: 'On-Page', title: 'Homepage missing meta description', url: targetUrl, source: 'dataforseo' })
        }
        const h1s = meta.htags?.h1
        if (!h1s || (Array.isArray(h1s) && h1s.length === 0)) {
          issuePush({ id: 'home-no-h1', severity: 'error', category: 'On-Page', title: 'Homepage missing H1', url: targetUrl, source: 'dataforseo' })
        }
        if (home.status_code && Number(home.status_code) >= 400) {
          issuePush({
            id: 'home-status',
            severity: 'error',
            category: 'HTTP',
            title: `Homepage returns HTTP ${home.status_code}`,
            url: targetUrl,
            source: 'dataforseo',
          })
        }
        // Ensure homepage lands in pages sample
        if (!result.pages.some((p: any) => String(p.url || '').includes(cleanDomain))) {
          result.pages.unshift({
            url: home.url || targetUrl,
            status: Number(home.status_code || 0) || 0,
            title: meta.title || '',
            description: meta.description || '',
            h1: Array.isArray(meta.htags?.h1) ? meta.htags.h1[0] : '',
            wordCount: Number(meta.content?.plain_text_word_count || 0) || 0,
            loadTime: Number(home.page_timing?.duration_time || 0) || 0,
            size: Number(home.size || 0) || 0,
            onpageScore: home.onpage_score != null ? Number(home.onpage_score) : null,
            issues: [],
            source: 'dataforseo-instant',
          })
        }
      }
    } catch {
      result.softDegraded.push('DataForSEO Instant')
    }
  }

  // 3) PageSpeed Insights (SEO + performance lanes) — mobile
  if (PAGESPEED_API_KEY) {
    try {
      const psi = await withCache(realtimeCache, `psi_audit_${cleanDomain}_mobile`, async () => {
        const r = await axios.get('https://www.googleapis.com/pagespeedonline/v5/runPagespeed', {
          params: {
            url: targetUrl,
            strategy: 'mobile',
            key: PAGESPEED_API_KEY,
            category: ['performance', 'accessibility', 'best-practices', 'seo'],
          },
          timeout: 45000,
        })
        return r.data
      })
      result.sources.pagespeed_mobile = {
        categories: psi?.lighthouseResult?.categories || {},
        audits: psi?.lighthouseResult?.audits || {},
      }
      const cats = psi?.lighthouseResult?.categories || {}
      result.summary.lighthouseSeo = cats.seo?.score != null ? Math.round(Number(cats.seo.score) * 100) : null
      result.summary.performanceMobile = cats.performance?.score != null ? Math.round(Number(cats.performance.score) * 100) : null
      const audits = psi?.lighthouseResult?.audits || {}
      const important = [
        'document-title',
        'meta-description',
        'http-status-code',
        'is-crawlable',
        'robots-txt',
        'canonical',
        'hreflang',
        'image-alt',
        'link-text',
        'crawlable-anchors',
        'viewport',
        'font-size',
        'tap-targets',
        'structured-data',
      ]
      for (const id of important) {
        const a = audits[id]
        if (!a) continue
        if (a.score != null && Number(a.score) < 1) {
          issuePush({
            id: `psi-${id}`,
            severity: Number(a.score) === 0 ? 'error' : 'warning',
            category: 'Lighthouse SEO',
            title: a.title || id,
            detail: a.description ? String(a.description).replace(/<[^>]+>/g, '').slice(0, 180) : undefined,
            url: targetUrl,
            source: 'pagespeed',
          })
        }
      }
      if (!result.activeSources.includes('PageSpeed')) result.activeSources.push('PageSpeed')
    } catch {
      result.softDegraded.push('PageSpeed')
    }
  }

  // 4) DataForSEO backlinks summary — broken backlink / broken pages risk
  if (DATAFORSEO_AUTH) {
    try {
      const bl = await withCache(realtimeCache, `dfs_bl_summary_audit_${cleanDomain}`, async () => {
        const r = await axios.post(
          'https://api.dataforseo.com/v3/backlinks/summary/live',
          [{ target: cleanDomain, include_subdomains: true }],
          {
            headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' },
            timeout: 20000,
          },
        )
        return r.data
      })
      const row = bl?.tasks?.[0]?.result?.[0]
      result.sources.dataforseo_backlinks_summary = row
      if (row) {
        result.summary.brokenBacklinks = Number(row.broken_backlinks ?? 0) || 0
        if (Number(row.broken_backlinks || 0) > 0) {
          issuePush({
            id: 'broken-backlinks',
            severity: Number(row.broken_backlinks) > 50 ? 'error' : 'warning',
            category: 'Backlinks',
            title: 'Broken backlinks pointed at this domain',
            detail: `${row.broken_backlinks} broken backlinks`,
            source: 'dataforseo',
          })
        }
        if (Number(row.broken_pages || 0) > 0) {
          issuePush({
            id: 'broken-linked-pages',
            severity: 'warning',
            category: 'Backlinks',
            title: 'Broken pages receiving backlinks',
            detail: `${row.broken_pages} broken pages`,
            source: 'dataforseo',
          })
        }
        if (!result.activeSources.includes('DataForSEO Backlinks')) result.activeSources.push('DataForSEO Backlinks')
      }
    } catch {
      result.softDegraded.push('DataForSEO Backlinks')
    }
  }

  // 5) Optional GTmetrix health signal (soft)
  // (kept out of critical path — may be unconfigured)

  // Issue rollup
  result.summary.issuesTotal = result.issues.length
  result.summary.errors = result.issues.filter((i: any) => i.severity === 'error').length
  result.summary.warnings = result.issues.filter((i: any) => i.severity === 'warning').length
  result.summary.notices = result.issues.filter((i: any) => i.severity === 'notice').length
  if (!result.summary.pagesCrawled) result.summary.pagesCrawled = result.pages.length

  // Sort issues: errors first
  const sevRank = { error: 0, warning: 1, notice: 2 } as Record<string, number>
  result.issues.sort((a: any, b: any) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9))

  if (!result.activeSources.length && !result.issues.length && !result.pages.length) result.dataState = 'unavailable'
  const stampedAudit = stampPayload(result, domain)
  if (stampedAudit.activeSources.length || stampedAudit.issues.length || stampedAudit.pages.length) {
    void persistSnapshot(domain, 'site_audit_agg', stampedAudit)
  }
  res.json(stampedAudit)
})

// Site Audit history (recent seo_snapshots for provider site_audit_agg)
app.get('/api/site-audit/history', expensiveLimiter, async (req, res) => {
  const { domain, limit } = req.query as Record<string, string>
  if (!domain?.trim()) return res.status(400).json({ error: 'domain required' })
  const pack = marketFromRequest(req, domain)
  const history = await loadSnapshotHistory(domain, 'site_audit_agg', Number(limit) || 10)
  const current = history[0] || null
  const previous = history[1] || null
  let delta: Record<string, number | null> | null = null
  if (current && previous) {
    const c = current.summary || {}
    const p = previous.summary || {}
    const num = (v: any) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
    const d = (a: any, b: any) => {
      const av = num(a)
      const bv = num(b)
      if (av == null || bv == null) return null
      return av - bv
    }
    delta = {
      errors: d(c.errors, p.errors),
      warnings: d(c.warnings, p.warnings),
      notices: d(c.notices, p.notices),
      pagesCrawled: d(c.pagesCrawled, p.pagesCrawled),
      issuesTotal: d(c.issuesTotal ?? current.issuesCount, p.issuesTotal ?? previous.issuesCount),
      onpageScore: d(c.onpageScore, p.onpageScore),
    }
  }
  res.json({
    domain,
    market: pack,
    history,
    delta,
    dataState: history.length ? 'live' : 'unavailable',
    fetchedAt: new Date().toISOString(),
  })
})

// Site Audit single-URL recheck via DataForSEO instant_pages (cheap path)
app.post('/api/site-audit/recheck-url', expensiveLimiter, async (req, res) => {
  const body = req.body || {}
  const url = String(body.url || '').trim()
  const domain = String(body.domain || '').trim()
  if (!url) return res.status(400).json({ error: 'url required' })
  if (!DATAFORSEO_AUTH) {
    return res.status(503).json({ error: 'DataForSEO not configured', softDegraded: true })
  }
  try {
    const target = url.startsWith('http') ? url : `https://${url}`
    const instant = await axios.post(
      'https://api.dataforseo.com/v3/on_page/instant_pages',
      [{ url: target, enable_javascript: false, load_resources: false }],
      {
        headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' },
        timeout: 45000,
      },
    )
    const task = instant.data?.tasks?.[0]
    const item = task?.result?.[0]?.items?.[0] || task?.result?.[0] || null
    res.json({
      ok: true,
      domain: domain || null,
      url: target,
      item,
      softDegraded: !item,
      fetchedAt: new Date().toISOString(),
    })
  } catch (err: any) {
    res.status(502).json({
      ok: false,
      error: err?.message || 'recheck failed',
      softDegraded: true,
    })
  }
})

// Aggregated vitals from multiple sources
app.post('/api/vitals/aggregated', expensiveLimiter, async (req, res) => {
  const { url } = req.body || {}
  if (!url || !String(url).trim()) return res.status(400).json({ error: 'url required' })
  let domainFromUrl: string
  try { domainFromUrl = canonicalizeDomain(new URL(String(url)).hostname) } catch { domainFromUrl = canonicalizeDomain(String(url)) }
  const result: Record<string, any> = { url, domain: domainFromUrl, sources: {}, activeSources: [] as string[] }

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

  res.json(stampPayload(result, domainFromUrl || String(url)))
})

// Aggregated competitors from multiple sources
app.get('/api/competitors/aggregated', expensiveLimiter, async (req, res) => {
  const { domain, refresh } = req.query as Record<string, string>
  if (!domain?.trim()) return res.status(400).json({ error: 'domain required' })
  const pack = marketFromRequest(req, domain)
  const forceRefresh = refresh === '1' || refresh === 'true'
  if (!forceRefresh) {
    const cached = await loadSnapshotPayload(domain, 'competitors_agg')
    if (cached?.data && Object.keys(cached.data.sources || {}).length > 0) {
      const snap = { ...cached.data, market: pack, dataState: 'cached', fetchedAt: cached.fetchedAt, fromSnapshot: true }
      if (Array.isArray(snap.normalized)) {
        const compIntegrity = filterCompetitorsForDomain(snap.normalized, domain)
        snap.normalized = compIntegrity.rows
        // Recompute gap cards with latest keyword spine when cached competitor payload is reused.
        try {
          const kwSnap = await loadSnapshotPayload(domain, 'keywords_agg')
          if (Array.isArray(kwSnap?.data?.normalized)) {
            snap.gaps = computeCompetitorGaps(kwSnap.data.normalized as KeywordRow[], compIntegrity.rows)
          }
        } catch {
          // keep existing gaps if any
        }
        return res.json(stampPayload(snap, domain, {
          giantsDropped: compIntegrity.giantsDropped,
          selfRowsDropped: compIntegrity.selfRowsDropped,
        }))
      }
      return res.json(stampPayload(snap, domain))
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
    SEMRUSH_API_KEY
      ? axios.get('https://api.semrush.com/', {
          params: {
            type: 'domain_organic_organic',
            key: SEMRUSH_API_KEY,
            domain,
            database: pack.semrushDatabase,
            display_limit: 10,
            export_columns: 'Dn,Cr,Np,Or,Ot,Oc,Ad',
          },
          timeout: 15000,
        })
      : Promise.reject('No SEMrush key'),
    DATAFORSEO_AUTH
      ? axios.post(
          'https://api.dataforseo.com/v3/dataforseo_labs/google/competitors_domain/live',
          [{ target: domain, language_name: pack.dfsLanguageName, location_code: pack.dfsLocationCode, limit: 10 }],
          { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' }, timeout: 20000 },
        )
      : Promise.reject('No DataForSEO'),
    EXA_API_KEY
      ? axios.post(
          'https://api.exa.ai/findSimilar',
          {
            url: `https://${domain}`,
            numResults: 10,
            contents: { text: { maxCharacters: 300 }, highlights: { numSentences: 2 } },
          },
          { headers: { 'x-api-key': EXA_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 },
        )
      : Promise.reject('No Exa key'),
    SERPSTAT_API_KEY
      ? serpstatRpc('SerpstatDomainProcedure.getDomainsCompetitors', {
          domain,
          se: pack.serpstatSe,
          size: 10,
        })
      : Promise.reject('No Serpstat key'),
  ])

  const [semrush, dataforseo, exa, serpstat] = calls
  if (semrush.status === 'fulfilled') { result.sources.semrush = parseSemrushCSV(semrush.value.data); result.activeSources.push('SEMrush') }
  else if (SEMRUSH_API_KEY) result.softDegraded.push('SEMrush')
  if (dataforseo.status === 'fulfilled') { result.sources.dataforseo = dataforseo.value.data; result.activeSources.push('DataForSEO') }
  else if (DATAFORSEO_AUTH) result.softDegraded.push('DataForSEO')
  if (exa.status === 'fulfilled') { result.sources.exa = exa.value.data?.results; result.activeSources.push('Exa') }
  else if (EXA_API_KEY) result.softDegraded.push('Exa')
  if (serpstat.status === 'fulfilled') {
    result.sources.serpstat = serpstat.value
    result.activeSources.push('Serpstat')
  } else if (SERPSTAT_API_KEY) {
    result.softDegraded.push('Serpstat')
  }
  if (SE_RANKING_API) {
    result.sources.seranking = { configured: true, active: false, note: 'SE Ranking auth unstable; skipped' }
  }

  const competitors = mergeCompetitors([
    competitorsFromSemrush(result.sources.semrush),
    competitorsFromDataForSEO(result.sources.dataforseo),
    competitorsFromExa(result.sources.exa),
    competitorsFromSerpstat(result.sources.serpstat),
  ])
  const compIntegrity = filterCompetitorsForDomain(competitors, domain)
  result.normalized = compIntegrity.rows

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
  result.gaps = computeCompetitorGaps(ourKeywords, compIntegrity.rows)

  // Real keyword gap matrix: pull ranked keywords for top 3 competitors (soft, limited rows).
  const competitorKeywordSets: Array<{ competitor: string; keywords: KeywordRow[] }> = []
  if (DATAFORSEO_AUTH || SEMRUSH_API_KEY || SERPSTAT_API_KEY) {
    const topComps = compIntegrity.rows
      .slice()
      .sort((a: any, b: any) => (Number(b.commonKeywords) || 0) - (Number(a.commonKeywords) || 0) || (Number(b.traffic) || 0) - (Number(a.traffic) || 0))
      .map((c: any) => canonicalizeDomain(c.domain))
      .filter(Boolean)
      .slice(0, 3)

    await Promise.all(
      topComps.map(async (compDomain: string) => {
        const collected: KeywordRow[] = []
        // DataForSEO ranked keywords for competitor
        if (DATAFORSEO_AUTH) {
          try {
            const r = await axios.post(
              'https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live',
              [{ target: compDomain, language_name: pack.dfsLanguageName, location_code: pack.dfsLocationCode, limit: 40 }],
              { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' }, timeout: 20000 },
            )
            collected.push(...keywordsFromDataForSEO(r.data))
          } catch {
            // soft
          }
        }
        // SEMrush organic keywords as backup / enrichment
        if (SEMRUSH_API_KEY && collected.length < 15) {
          try {
            const r = await axios.get('https://api.semrush.com/', {
              params: {
                type: 'domain_organic',
                key: SEMRUSH_API_KEY,
                domain: compDomain,
                database: pack.semrushDatabase,
                display_limit: 40,
                export_columns: 'Ph,Po,Pp,Nq,Cp,Co,Kd,Ur,Tr,Tc,Nr,Td',
              },
              timeout: 15000,
            })
            collected.push(...keywordsFromSemrush(parseSemrushCSV(r.data)))
          } catch {
            // soft
          }
        }
        // Serpstat as third soft source
        if (SERPSTAT_API_KEY && collected.length < 10) {
          try {
            const r = await serpstatRpc('SerpstatDomainProcedure.getDomainKeywords', {
              domain: compDomain,
              se: pack.serpstatSe,
              page: 1,
              size: 30,
            })
            collected.push(...keywordsFromSerpstat(r))
          } catch {
            // soft
          }
        }
        const merged = mergeKeywordRows([collected]).slice(0, 60)
        if (merged.length) competitorKeywordSets.push({ competitor: compDomain, keywords: merged })
      }),
    )
  }

  result.keywordGap = buildKeywordGapMatrix(ourKeywords, competitorKeywordSets)
  result.shareOfVoice = computeShareOfVoice(domain, ourKeywords, competitorKeywordSets)
  // Annotate gap estimate cards with real missing counts when available
  if (Array.isArray(result.gaps) && result.keywordGap?.rows?.length) {
    const missingByComp = new Map<string, number>()
    for (const row of result.keywordGap.rows) {
      if (row.kind !== 'missing') continue
      const key = canonicalizeDomain(row.competitor)
      missingByComp.set(key, (missingByComp.get(key) || 0) + 1)
    }
    result.gaps = result.gaps.map((g: any) => {
      const real = missingByComp.get(canonicalizeDomain(g.competitor))
      if (real == null) return g
      return {
        ...g,
        realMissingCount: real,
        ourMissingEstimate: real,
        note: `Live intersection vs matrix: ${real} missing keywords (they rank, we don't in tracked set).`,
      }
    })
  }

  const stampedCompetitors = stampPayload(result, domain, {
    giantsDropped: compIntegrity.giantsDropped,
    selfRowsDropped: compIntegrity.selfRowsDropped,
  })

  if (stampedCompetitors.activeSources.length) void persistSnapshot(domain, 'competitors_agg', stampedCompetitors)
  res.json(stampedCompetitors)
})

// Content analysis — Exa competitive content + Thorbit
app.post('/api/content/analyze', expensiveLimiter, async (req, res) => {
  const { domain, keyword } = req.body || {}
  if (!domain || !String(domain).trim()) return res.status(400).json({ error: 'domain required' })
  const result: Record<string, any> = { domain: canonicalizeDomain(domain), keyword, sources: {}, activeSources: [] }

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

  res.json(stampPayload(result, domain))
})

// Alerts — aggregated from all sources
app.get('/api/alerts/aggregated', expensiveLimiter, async (req, res) => {
  const { domain } = req.query as Record<string, string>
  if (!domain?.trim()) return res.status(400).json({ error: 'domain required' })
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

  res.json(stampPayload({
    alerts: [...ruleAlerts, ...alerts],
    activeSources,
    source: activeSources.join(', '),
  }, domain))
})

// Anomaly detection — statistical (MAD z-score) on snapshot history: traffic/visibility metrics + keyword drops
app.get('/api/anomalies/aggregated', expensiveLimiter, async (req, res) => {
  const { domain, limit } = req.query as Record<string, string>
  if (!domain?.trim()) return res.status(400).json({ error: 'domain required' })
  const clean = canonicalizeDomain(domain)
  const take = Math.min(Math.max(Number(limit) || 12, 4), 30)

  const [kwHistory, overviewHistory, competitorsHistory] = await Promise.all([
    loadSnapshotPayloadHistory(clean, 'keywords_agg', take),
    loadSnapshotPayloadHistory(clean, 'overview', take),
    loadSnapshotPayloadHistory(clean, 'competitors_agg', take),
  ])

  // Metric series: organic traffic / top10 keywords from overview snapshots
  const trafficSeries: MetricPoint[] = []
  const top10Series: MetricPoint[] = []
  for (const snap of overviewHistory) {
    const m = extractProviderMetrics('overview', snap.data as Record<string, any>)
    if (typeof m.organicTraffic === 'number') trafficSeries.push({ date: snap.fetchedAt, value: m.organicTraffic })
    if (typeof m.organicKeywords === 'number') top10Series.push({ date: snap.fetchedAt, value: m.organicKeywords })
  }

  // SOV series from competitors snapshots (feature added 2026-07-21 — older snapshots may lack it)
  const sovSeries: MetricPoint[] = []
  for (const snap of competitorsHistory) {
    const sov = (snap.data as any)?.shareOfVoice?.ourSov
    if (typeof sov === 'number') sovSeries.push({ date: snap.fetchedAt, value: sov })
  }

  const metricAnomalies = [
    detectMetricAnomaly({ metric: 'organicTraffic', label: 'Organic traffic', series: trafficSeries }),
    detectMetricAnomaly({ metric: 'top10Keywords', label: 'Top 10 keywords', series: top10Series }),
    detectMetricAnomaly({ metric: 'shareOfVoice', label: 'Share of Voice', series: sovSeries, minPoints: 3 }),
  ].filter(Boolean)

  // Keyword position series from keywords_agg snapshots
  const kwSnapshots = kwHistory.map((s) => ({
    date: s.fetchedAt,
    rows: (Array.isArray((s.data as any)?.normalized) ? (s.data as any).normalized : []) as KeywordRow[],
  }))
  const kwAnalysis = analyzeKeywordSeries({ snapshots: kwSnapshots })

  const snapshotsUsed = Math.max(kwSnapshots.length, overviewHistory.length, competitorsHistory.length)
  const note =
    snapshotsUsed >= 4
      ? `MAD z-score anomaly detection over ${snapshotsUsed} snapshots (baseline = trailing median).`
      : snapshotsUsed >= 2
        ? 'Limited history — keyword drops vs best trailing snapshot; metric anomalies need ≥4 points.'
        : 'Not enough snapshots yet — anomalies appear after the next syncs.'

  res.json(stampPayload({
    metricAnomalies,
    keywordDrops: kwAnalysis.drops,
    keywordsGained: kwAnalysis.gained,
    keywordsCompared: kwAnalysis.compared,
    snapshotsUsed,
    series: {
      traffic: trafficSeries,
      top10: top10Series,
      shareOfVoice: sovSeries,
    },
    note,
    activeSources: ['Rules Engine'],
    dataState: snapshotsUsed ? 'live' : 'unavailable',
  }, domain))
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

  // Writes must go through the service-role client after the global API auth gate — the anon client
  // is bound by RLS (authenticated role) and cannot create roster rows. Fail closed when unconfigured.
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE not configured — cannot create projects' })
  }

  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()

  try {
    // Idempotent create: reject a domain that already exists in the roster.
    const { data: existingDomain } = await supabaseAdmin
      .from('seo_domains')
      .select('id')
      .eq('domain', cleanDomain)
      .maybeSingle()
    if (existingDomain) {
      return res.status(409).json({ error: 'Project already exists', domain: cleanDomain })
    }

    // Get or create client
    let clientId: string
    const { data: existingClient } = await supabaseAdmin
      .from('seo_clients')
      .select('id')
      .eq('name', clientName || name)
      .maybeSingle()

    if (existingClient) {
      clientId = existingClient.id
    } else {
      const { data: newClient, error: clientErr } = await supabaseAdmin
        .from('seo_clients')
        .insert({ name: clientName || name })
        .select('id')
        .single()
      if (clientErr) return res.status(500).json({ error: 'Failed to create client', details: clientErr.message })
      clientId = newClient.id
    }

    // Create domain
    const { data: newDomain, error: domainErr } = await supabaseAdmin
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
  const { domain } = req.query as Record<string, string>
  if (!domain?.trim()) {
    return res.status(400).json({ error: 'domain required', tasks: [], source: 'error' })
  }
  const cleanDomain = canonicalizeDomain(domain)
  if (!cleanDomain) {
    return res.status(400).json({ error: 'invalid domain', tasks: [], source: 'error' })
  }

  if (supabaseAdmin) {
    try {
      const { data: domainRows } = await supabaseAdmin
        .from('seo_domains')
        .select('id, domain')
        .ilike('domain', cleanDomain)
        .limit(5)
      const domainRow =
        (domainRows || []).find((r: any) => canonicalizeDomain(r.domain) === cleanDomain) ||
        domainRows?.[0]
      if (domainRow?.id) {
        const { data: tasks } = await supabaseAdmin
          .from('seo_tasks')
          .select('id, title, status, priority, brief, acceptance_criteria, alert_id, domain_id, created_at, updated_at')
          .eq('domain_id', domainRow.id)
          .order('created_at', { ascending: false })
          .limit(50)
        return res.json({
          domain: cleanDomain,
          requestedDomain: domain,
          canonicalDomain: cleanDomain,
          tasks: (tasks || []).map((t: any) => ({
            id: t.id,
            domain: cleanDomain,
            title: t.title,
            status: t.status,
            priority: t.priority,
            brief: t.brief,
            acceptanceCriteria: t.acceptance_criteria || [],
            alertId: t.alert_id,
            createdAt: t.created_at,
          })),
          source: 'supabase',
          dataState: (tasks || []).length ? 'live' : 'unavailable',
          message: (tasks || []).length
            ? undefined
            : 'No durable tasks for this domain. Run Sync spine to generate from live alerts.',
          fetchedAt: new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error('[tasks] durable load failed', err)
    }
  }

  // Prod + any non-seed env: never invent fake investigation tasks from synthetic alerts.
  if (IS_PROD || !ALLOW_LOCAL_SEED) {
    return res.json({
      domain: cleanDomain,
      requestedDomain: domain,
      canonicalDomain: cleanDomain,
      tasks: [],
      source: 'empty',
      dataState: 'unavailable',
      message: 'No durable tasks for this domain. Run Sync spine to generate from live alerts.',
      fetchedAt: new Date().toISOString(),
    })
  }

  // Local-dev only fallback — still stamp domain on every task.
  const seedAlerts = generateAlerts({
    domain: cleanDomain,
    previousOrganicTraffic: 1000,
    organicTraffic: 730,
    brokenPagesWithBacklinks: 1,
    performanceScore: 62,
  })
  res.json({
    domain: cleanDomain,
    requestedDomain: domain,
    canonicalDomain: cleanDomain,
    tasks: seedAlerts.map(createSeoTaskFromAlert),
    source: 'rules-engine-local',
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

async function runNightlySync(opts: { limit?: number; createTasks?: boolean; sendDigest?: boolean; refresh?: boolean }) {
  if (!supabaseAdmin) throw new Error('SUPABASE_SERVICE_ROLE not configured')
  const limit = Math.min(Math.max(Number(opts.limit || 20), 1), 50)
  const createTasks = opts.createTasks !== false
  // Default true: nightly must refresh live metrics into seo_snapshots before deriving alerts.
  const refresh = opts.refresh !== false
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
    let hydrate: Record<string, any> | null = null
    let hydrateError: string | null = null
    if (refresh) {
      try {
        const pack = resolveMarket({ domain: d.domain })
        hydrate = await hydrateDomainOverview(d.domain, pack)
      } catch (e: any) {
        hydrateError = e?.message || String(e)
        console.error('[nightly-sync] hydrate failed', d.domain, hydrateError)
      }
    }
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
    results.push({
      domain: d.domain,
      alertsGenerated: alerts.length,
      ...persisted,
      hydrate: hydrate
        ? {
            activeSources: hydrate.activeSources || [],
            softDegraded: hydrate.softDegraded || [],
            writes: hydrate.writes || [],
            fetchedAt: hydrate.fetchedAt,
          }
        : null,
      hydrateError,
    })
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
    const scheduledReports = await runScheduledReports().catch((err: any) => ({ error: err?.message || String(err) }))
    res.json({ ...payload, scheduledReports })
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
    const scheduledReports = await runScheduledReports().catch((err: any) => ({ error: err?.message || String(err) }))
    res.json({ ...payload, scheduledReports })
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

  // Surface top portfolio-wide keyword opportunities + link cleanups when snapshot intel exists
  const opportunityFeed: Array<{
    domain: string
    keyword?: string
    kind: string
    position?: number | null
    volume?: number | null
    reason?: string
    module: 'keywords' | 'backlinks' | 'competitors'
  }> = []
  await Promise.all(
    uniqueFocus.slice(0, 8).map(async (domain) => {
      try {
        const [kwSnap, blSnap] = await Promise.all([
          loadSnapshotPayload(domain, 'keywords_agg'),
          loadSnapshotPayload(domain, 'backlinks_agg'),
        ])
        const rows = Array.isArray(kwSnap?.data?.normalized) ? kwSnap!.data.normalized : []
        const intel = kwSnap?.data?.intel || (rows.length ? computeKeywordIntel(rows) : null)
        for (const o of (intel?.opportunities || []).slice(0, 3)) {
          opportunityFeed.push({
            domain,
            keyword: o.keyword,
            kind: o.kind,
            position: o.position,
            volume: o.volume,
            reason: o.reason,
            module: 'keywords',
          })
        }
        const linkIntel =
          blSnap?.data?.linkIntel ||
          (blSnap?.data
            ? computeLinkIntel({
                normalizedLinks: blSnap.data.normalized || [],
                refdomains: blSnap.data.refdomains || [],
                domain,
              })
            : null)
        for (const o of (linkIntel?.opportunities || []).filter((x: any) => x.kind === 'cleanup_spam' || x.kind === 'strengthen').slice(0, 2)) {
          opportunityFeed.push({
            domain,
            keyword: o.domain,
            kind: o.kind,
            reason: o.reason,
            module: 'backlinks',
          })
        }
      } catch {
        // soft
      }
    }),
  )
  opportunityFeed.sort((a, b) => (b.volume || 0) - (a.volume || 0))

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
      opportunitySignals: opportunityFeed.length,
    },
    worst,
    hottestAlerts,
    movements: {
      improved: movements.improved.slice(0, 12),
      declined: movements.declined.slice(0, 12),
      newEntries: movements.newEntries.slice(0, 12),
    },
    gaps: gaps.slice(0, 15),
    opportunities: opportunityFeed.slice(0, 18),
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

  const body = (req.body || {}) as {
    domain?: string
    /** Default true — live-refresh provider metrics into seo_snapshots before alerts. */
    persist?: boolean
    createTasks?: boolean
    push?: boolean
    limit?: number
  }
  const createTasks = body.createTasks !== false
  // Default ON: previously /api/sync only re-derived alerts from stale snaps (no live fetch).
  const refresh = body.persist !== false
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
    let hydrate: Record<string, any> | null = null
    let hydrateError: string | null = null
    if (refresh) {
      try {
        const pack = resolveMarket({ domain: d.domain })
        hydrate = await hydrateDomainOverview(d.domain, pack)
      } catch (e: any) {
        hydrateError = e?.message || String(e)
        console.error('[api/sync] hydrate failed', d.domain, hydrateError)
      }
    }

    // Re-read snaps AFTER live hydrate so alerts/tasks see fresh metrics.
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
      hydrated: !!hydrate,
      hydrateError,
      activeSources: hydrate?.activeSources || [],
      softDegraded: hydrate?.softDegraded || [],
      writes: hydrate?.writes || [],
    })
  }

  res.json({
    ok: true,
    synced: results.length,
    refresh,
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

// Share links are persisted in seo_snapshots via ReportShareStore (serverless-safe). TTL 7 days.
const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000

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
    void (async () => {
    try {
    const body = (req as any).validatedBody
    const built = buildReportPayload(body)
    const id = `shr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
    const createdAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + SHARE_TTL_MS).toISOString()
    const domainId = await findDomainId(built.input.domain)
    if (!domainId) return res.status(404).json({ error: 'Domain not tracked — add it as a project first' })
    if (!supabaseAdmin) return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE not configured' })
    const store = new ReportShareStore(supabaseAdmin)
    await store.create(domainId, {
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
      path: `/api/reports/share?id=${id}`,
      htmlUrl: `${base}/api/reports/share?id=${id}&format=html`,
      markdownUrl: `${base}/api/reports/share?id=${id}&format=md`,
      domain: built.input.domain,
      locale: built.input.locale,
      template: built.input.template,
    })
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) })
    }
    })()
  },
)

app.get('/api/reports/share', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE not configured' })
    const store = new ReportShareStore(supabaseAdmin)
    const rec = await store.get(String((req.query as any).id || ''))
    if (!rec) return res.status(404).json({ error: 'Share link not found or expired' })
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
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// White-label scheduled reports — CRUD + send-now + cron
// ═══════════════════════════════════════════════════════════════════════════════

const scheduleSchema = z.object({
  template: z.enum(['weekly', 'monthly', 'executive', 'local-geo']).optional(),
  locale: z.enum(['he', 'en']).optional(),
  frequency: z.enum(['weekly', 'monthly']).optional(),
  recipients: z.array(z.string().email()).max(20).optional(),
  brandName: z.string().max(120).optional().nullable(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  clientName: z.string().max(120).optional().nullable(),
  market: z.string().max(80).optional().nullable(),
  enabled: z.boolean().optional(),
  sendDay: z.number().int().min(0).max(28).optional(),
  sendHour: z.number().int().min(0).max(23).optional(),
})

function scheduleStore(): ReportScheduleStore {
  if (!supabaseAdmin) throw new Error('SUPABASE_SERVICE_ROLE not configured')
  return new ReportScheduleStore(supabaseAdmin)
}

function scheduleOut(domainId: string, s: ReturnType<typeof normalizeSchedule>) {
  return { ...s, domainId }
}

app.get('/api/reports/schedules', async (req, res) => {
  const { domain } = req.query as Record<string, string>
  if (!domain?.trim()) return res.status(400).json({ error: 'domain required' })
  const clean = canonicalizeDomain(domain)
  try {
    const domainId = await findDomainId(clean)
    if (!domainId) return res.json({ schedules: [], domain: clean })
    const store = scheduleStore()
    const rows = await store.list(domainId)
    res.json({
      domain: clean,
      schedules: rows.map(({ schedule }) => scheduleOut(domainId, schedule)),
    })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) })
  }
})

app.post('/api/reports/schedules', validateBody(scheduleSchema.extend({ domain: domainSchema })), async (req, res) => {
  const body = (req as any).validatedBody as z.infer<typeof scheduleSchema> & { domain: string }
  const clean = canonicalizeDomain(body.domain)
  try {
    const domainId = await findDomainId(clean)
    if (!domainId) return res.status(404).json({ error: 'Domain not tracked — add it as a project first' })
    const store = scheduleStore()
    const schedule = await store.create(domainId, body)
    res.status(201).json({ schedule: scheduleOut(domainId, schedule) })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) })
  }
})

/** Vercel FS routing in this project only matches single-segment paths, so updates are via dedicated one-segment endpoints. */
app.post('/api/reports/schedules-update', validateBody(scheduleSchema.extend({ domain: domainSchema, id: z.string().min(1) })), async (req, res) => {
  const body = (req as any).validatedBody as z.infer<typeof scheduleSchema> & { domain: string; id: string }
  const clean = canonicalizeDomain(body.domain)
  try {
    const domainId = await findDomainId(clean)
    if (!domainId) return res.status(404).json({ error: 'Domain not found' })
    const store = scheduleStore()
    const updated = await store.update(domainId, body.id, body)
    if (!updated) return res.status(404).json({ error: 'Schedule not found' })
    res.json({ schedule: scheduleOut(domainId, updated) })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) })
  }
})

app.post('/api/reports/schedules-delete', validateBody(z.object({ domain: domainSchema, id: z.string().min(1) })), async (req, res) => {
  const body = (req as any).validatedBody as { domain: string; id: string }
  const clean = canonicalizeDomain(body.domain)
  try {
    const domainId = await findDomainId(clean)
    if (!domainId) return res.status(404).json({ error: 'Domain not found' })
    const store = scheduleStore()
    const removed = await store.remove(domainId, body.id)
    if (!removed) return res.status(404).json({ error: 'Schedule not found' })
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) })
  }
})

/** Send a schedule's report immediately (test/preview delivery). */
app.post('/api/reports/schedules-send', expensiveLimiter, validateBody(z.object({ domain: domainSchema, id: z.string().min(1) })), async (req, res) => {
  const body = (req as any).validatedBody as { domain: string; id: string }
  const clean = canonicalizeDomain(body.domain)
  try {
    const domainId = await findDomainId(clean)
    if (!domainId) return res.status(404).json({ error: 'Domain not found' })
    const store = scheduleStore()
    const rows = await store.list(domainId)
    const row = rows.find((r) => r.schedule.id === body.id)
    if (!row) return res.status(404).json({ error: 'Schedule not found' })

    const pack = marketFromRequest(req, clean)
    const built = buildScheduledReport({ domain: clean, schedule: row.schedule, marketLabel: pack.label })
    const result = await sendReportEmail({
      schedule: row.schedule,
      html: built.html,
      markdown: built.markdown,
      subject: built.subject,
      apiKey: process.env.RESEND_API_KEY || '',
    })
    await store.markRun(domainId, row.schedule.id, { ok: result.ok, error: result.error })
    res.status(result.ok ? 200 : 502).json({
      ...result,
      subject: built.subject,
      recipients: row.schedule.recipients,
      preview: result.ok ? undefined : { html: built.html.slice(0, 400) },
    })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) })
  }
})

/** Cron: send all due scheduled reports. Called by Vercel cron (and piggybacked from nightly-sync). */
async function runScheduledReports(now = new Date()) {
  if (!supabaseAdmin) throw new Error('SUPABASE_SERVICE_ROLE not configured')
  const store = scheduleStore()
  const dueRows = await store.due(now)
  const results: Array<{ domainId: string; scheduleId: string; ok: boolean; error?: string | null }> = []
  for (const { domainId, schedule } of dueRows.slice(0, 25)) {
    try {
      const { data: domainRow } = await supabaseAdmin.from('seo_domains').select('domain, market').eq('id', domainId).maybeSingle()
      const domain = canonicalizeDomain(String(domainRow?.domain || ''))
      if (!domain) {
        results.push({ domainId, scheduleId: schedule.id, ok: false, error: 'domain row missing' })
        continue
      }
      const built = buildScheduledReport({ domain, schedule, marketLabel: domainRow?.market || null })
      const result = await sendReportEmail({
        schedule,
        html: built.html,
        markdown: built.markdown,
        subject: built.subject,
        apiKey: process.env.RESEND_API_KEY || '',
      })
      await store.markRun(domainId, schedule.id, { ok: result.ok, error: result.error })
      results.push({ domainId, scheduleId: schedule.id, ok: result.ok, error: result.error })
    } catch (err: any) {
      results.push({ domainId, scheduleId: schedule.id, ok: false, error: err?.message || String(err) })
    }
  }
  return { due: dueRows.length, sent: results.filter((r) => r.ok).length, results, ranAt: now.toISOString() }
}

app.get('/api/cron/report-schedules', expensiveLimiter, async (_req, res) => {
  try {
    res.json(await runScheduledReports())
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) })
  }
})

app.post('/api/cron/report-schedules', expensiveLimiter, async (_req, res) => {
  try {
    res.json(await runScheduledReports())
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) })
  }
})

app.get('/api/local-seo/overview', async (req, res) => {
  const domain = String((req.query as any).domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!domain) return res.status(400).json({ error: 'domain required' })
  const market = (req.query as any).market || null
  try {
    const kwSnap = await loadSnapshotPayload(domain, 'keywords_agg')
    const normalized = Array.isArray(kwSnap?.data?.normalized) ? kwSnap!.data.normalized : []
    const signals = summarizeKeywordSerpSignals(normalized)
    const softDegraded = [
      ...(Array.isArray(kwSnap?.data?.softDegraded) ? kwSnap!.data.softDegraded : []),
    ]

    let localFalcon: any = null
    if (LOCAL_FALCON_API_KEY) {
      try {
        // Stable endpoints verified live: /v1/campaigns + /v1/reports + /v1/locations
        const [campaigns, reports, locations] = await Promise.all([
          axios.get('https://api.localfalcon.com/v1/campaigns', {
            params: { api_key: LOCAL_FALCON_API_KEY },
            timeout: 15000,
          }),
          axios.get('https://api.localfalcon.com/v1/reports', {
            params: { api_key: LOCAL_FALCON_API_KEY },
            timeout: 15000,
          }),
          axios.get('https://api.localfalcon.com/v1/locations', {
            params: { api_key: LOCAL_FALCON_API_KEY },
            timeout: 15000,
          }),
        ])
        localFalcon = {
          campaignsTotal: campaigns.data?.data?.total ?? campaigns.data?.total ?? null,
          reportsTotal: reports.data?.data?.total ?? reports.data?.total ?? null,
          locationsTotal: locations.data?.data?.total ?? locations.data?.total ?? null,
          sampleReports: (reports.data?.data?.reports || reports.data?.reports || []).slice?.(0, 3) || [],
        }
      } catch (e) {
        softDegraded.push('Local Falcon')
      }
    }

    const payload = buildLocalSeoOverview({
      domain,
      market,
      snapshotMeta: {
        keywordsCount: signals.keywordsCount,
        rankingLocalFeatures: signals.rankingLocalFeatures,
        lastFetchedAt: kwSnap?.fetchedAt || null,
        softDegraded,
        localFalcon,
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
  const domain = String((req.query as any).domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!domain) return res.status(400).json({ error: 'domain required' })
  const market = (req.query as any).market || null
  try {
    const kwSnap = await loadSnapshotPayload(domain, 'keywords_agg')
    const normalized = Array.isArray(kwSnap?.data?.normalized) ? kwSnap!.data.normalized : []
    const signals = summarizeKeywordSerpSignals(normalized)
    const softDegraded = [
      ...(Array.isArray(kwSnap?.data?.softDegraded) ? kwSnap!.data.softDegraded : []),
    ]

    let morningscore: any = null
    if (MORNINGSCORE_API_KEY) {
      try {
        const resolved = await morningscoreResolveDomainId(domain)
        if (resolved) {
          const detail = await morningscoreGet(`/v1/domains/${resolved.id}`, 20000)
          const history = await morningscoreGet(`/v1/${resolved.id}/morningscore-history`, 20000)
          morningscore = {
            domain: resolved.domain,
            score: detail?.score ?? null,
            keywords: detail?.keywords ?? null,
            traffic: detail?.traffic ?? null,
            historyHasData: Boolean(history?.has_data),
            historyPoints: Array.isArray(history?.data) ? history.data.slice(-6) : [],
          }
        } else {
          morningscore = { available: false, reason: 'domain_not_in_morningscore_account' }
        }
      } catch {
        softDegraded.push('Morningscore')
      }
    }

    const payload = buildGeoAiOverview({
      domain,
      market,
      snapshotMeta: {
        keywordsCount: signals.keywordsCount,
        aiOverviewCount: signals.aiOverviewCount,
        lastFetchedAt: kwSnap?.fetchedAt || null,
        softDegraded,
        topKeywords: signals.topKeywords,
        morningscore,
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
    serpstat: !!SERPSTAT_API_KEY,
    keywords_everywhere: !!KEYWORDS_EVERYWHERE_API_KEY,
    serpapi: !!SERPAPI_KEY,
    local_falcon: !!LOCAL_FALCON_API_KEY,
    mangools: !!MANGOOLS_API_KEY,
    morningscore: !!MORNINGSCORE_API_KEY,
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

// Public deployed-version probe so releases can verify the promoted Git SHA in production.
app.get('/api/version', (_req, res) => {
  res.json({
    ok: true,
    sha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown',
    ref: process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || null,
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    timestamp: new Date().toISOString(),
  })
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
