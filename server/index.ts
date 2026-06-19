import express from 'express'
import cors from 'cors'
import NodeCache from 'node-cache'
import axios from 'axios'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = process.env.PORT || 3001

// Caches: 5min for realtime, 24h for historical
const realtimeCache = new NodeCache({ stdTTL: 300 })
const historicalCache = new NodeCache({ stdTTL: 86400 })

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173', 'https://seo-dashboard.maximo-seo.ai', 'https://seo-dashboard-gzb6.onrender.com', process.env.FRONTEND_URL || ''].filter(Boolean) }))
app.use(express.json())

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

// ═══════════════════════════════════════════════════════════════════════════════
// AHREFS ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/ahrefs/domain-rating', async (req, res) => {
  const { target, date } = req.query as Record<string, string>
  try {
    const data = await withCache(realtimeCache, `ahrefs_dr_${target}_${date}`, async () => {
      const r = await axios.get('https://api.ahrefs.com/v3/site-explorer/domain-rating', {
        params: { target, date }, headers: { Authorization: `Bearer ${AHREFS_API_KEY}` },
      })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.status(502).json({ error: 'Ahrefs unavailable', detail: e.message }) }
})

app.get('/api/ahrefs/metrics', async (req, res) => {
  const { target, date, mode } = req.query as Record<string, string>
  try {
    const data = await withCache(realtimeCache, `ahrefs_metrics_${target}_${date}`, async () => {
      const r = await axios.get('https://api.ahrefs.com/v3/site-explorer/metrics', {
        params: { target, date, mode: mode || 'subdomains' }, headers: { Authorization: `Bearer ${AHREFS_API_KEY}` },
      })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.status(502).json({ error: 'Ahrefs unavailable', detail: e.message }) }
})

app.get('/api/ahrefs/organic-keywords', async (req, res) => {
  const { target, date, mode, limit, select, order_by } = req.query as Record<string, string>
  try {
    const data = await withCache(realtimeCache, `ahrefs_kw_${target}_${date}_${limit}`, async () => {
      const r = await axios.get('https://api.ahrefs.com/v3/site-explorer/organic-keywords', {
        params: { target, date, mode: mode || 'subdomains', limit: limit || '50', select, order_by },
        headers: { Authorization: `Bearer ${AHREFS_API_KEY}` },
      })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.status(502).json({ error: 'Ahrefs unavailable', detail: e.message }) }
})

app.get('/api/ahrefs/refdomains', async (req, res) => {
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
  } catch (e: any) { res.status(502).json({ error: 'Ahrefs unavailable', detail: e.message }) }
})

app.get('/api/ahrefs/backlinks-stats', async (req, res) => {
  const { target, mode } = req.query as Record<string, string>
  try {
    const data = await withCache(realtimeCache, `ahrefs_bl_${target}`, async () => {
      const r = await axios.get('https://api.ahrefs.com/v3/site-explorer/backlinks-stats', {
        params: { target, mode: mode || 'subdomains' }, headers: { Authorization: `Bearer ${AHREFS_API_KEY}` },
      })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.status(502).json({ error: 'Ahrefs unavailable', detail: e.message }) }
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

app.get('/api/semrush/domain-overview', async (req, res) => {
  const { domain } = req.query as Record<string, string>
  try {
    const data = await withCache(realtimeCache, `semrush_overview_${domain}`, async () => {
      const r = await axios.get('https://api.semrush.com/', {
        params: { type: 'domain_ranks', key: SEMRUSH_API_KEY, domain, database: 'us', export_columns: 'Dn,Rk,Or,Ot,Oc,Ad,At,Ac' },
      })
      const rows = parseSemrushCSV(r.data)
      return rows[0] || null
    })
    res.json(data)
  } catch (e: any) { res.status(502).json({ error: 'SEMrush unavailable', detail: e.message }) }
})

app.get('/api/semrush/competitors', async (req, res) => {
  const { domain } = req.query as Record<string, string>
  try {
    const data = await withCache(historicalCache, `semrush_competitors_${domain}`, async () => {
      const r = await axios.get('https://api.semrush.com/', {
        params: { type: 'domain_organic_organic', key: SEMRUSH_API_KEY, domain, database: 'us', display_limit: 10, export_columns: 'Dn,Cr,Np,Or,Ot,Oc,Ad' },
      })
      return parseSemrushCSV(r.data)
    })
    res.json(data)
  } catch (e: any) { res.status(502).json({ error: 'SEMrush unavailable', detail: e.message }) }
})

app.get('/api/semrush/keyword-overview', async (req, res) => {
  const { keyword, database } = req.query as Record<string, string>
  try {
    const data = await withCache(historicalCache, `semrush_kw_${keyword}_${database || 'us'}`, async () => {
      const r = await axios.get('https://api.semrush.com/', {
        params: { type: 'phrase_this', key: SEMRUSH_API_KEY, phrase: keyword, database: database || 'us', export_columns: 'Ph,Nq,Cp,Co,Nr,Td' },
      })
      const rows = parseSemrushCSV(r.data)
      return rows[0] || null
    })
    res.json(data)
  } catch (e: any) { res.status(502).json({ error: 'SEMrush unavailable', detail: e.message }) }
})

app.get('/api/semrush/domain-keywords', async (req, res) => {
  const { domain, limit } = req.query as Record<string, string>
  try {
    const data = await withCache(realtimeCache, `semrush_dkw_${domain}_${limit}`, async () => {
      const r = await axios.get('https://api.semrush.com/', {
        params: { type: 'domain_organic', key: SEMRUSH_API_KEY, domain, database: 'us', display_limit: limit || 50, export_columns: 'Ph,Po,Pp,Nq,Cp,Co,Kd,Ur,Tr,Tc,Nr,Td' },
      })
      return parseSemrushCSV(r.data)
    })
    res.json(data)
  } catch (e: any) { res.status(502).json({ error: 'SEMrush unavailable', detail: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// DATAFORSEO ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/dataforseo/serp', async (req, res) => {
  const { keyword, location_code, language_code } = req.body
  try {
    const data = await withCache(realtimeCache, `dfs_serp_${keyword}_${location_code}`, async () => {
      const r = await axios.post('https://api.dataforseo.com/v3/serp/google/organic/live/advanced',
        [{ keyword, location_code: location_code || 2840, language_code: language_code || 'en', depth: 10 }],
        { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' } })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.status(502).json({ error: 'DataForSEO unavailable', detail: e.message }) }
})

app.post('/api/dataforseo/onpage', async (req, res) => {
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
  } catch (e: any) { res.status(502).json({ error: 'DataForSEO unavailable', detail: e.message }) }
})

app.post('/api/dataforseo/backlinks', async (req, res) => {
  const { target, limit } = req.body
  try {
    const data = await withCache(realtimeCache, `dfs_bl_${target}_${limit}`, async () => {
      const r = await axios.post('https://api.dataforseo.com/v3/backlinks/backlinks/live',
        [{ target, limit: limit || 50, order_by: ['rank,desc'], filters: ['dofollow,=,true'] }],
        { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' } })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.status(502).json({ error: 'DataForSEO unavailable', detail: e.message }) }
})

app.post('/api/dataforseo/domain-summary', async (req, res) => {
  const { target } = req.body
  try {
    const data = await withCache(realtimeCache, `dfs_domain_${target}`, async () => {
      const r = await axios.post('https://api.dataforseo.com/v3/backlinks/domain_pages_summary/live',
        [{ target, include_subdomains: true }],
        { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' } })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.status(502).json({ error: 'DataForSEO unavailable', detail: e.message }) }
})

app.post('/api/dataforseo/ranked-keywords', async (req, res) => {
  const { target, limit } = req.body
  try {
    const data = await withCache(realtimeCache, `dfs_rkw_${target}_${limit}`, async () => {
      const r = await axios.post('https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live',
        [{ target, language_name: 'English', location_code: 2840, limit: limit || 50 }],
        { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' } })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.status(502).json({ error: 'DataForSEO unavailable', detail: e.message }) }
})

app.post('/api/dataforseo/competitors', async (req, res) => {
  const { target, limit } = req.body
  try {
    const data = await withCache(historicalCache, `dfs_comp_${target}_${limit}`, async () => {
      const r = await axios.post('https://api.dataforseo.com/v3/dataforseo_labs/google/competitors_domain/live',
        [{ target, language_name: 'English', location_code: 2840, limit: limit || 10 }],
        { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' } })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.status(502).json({ error: 'DataForSEO unavailable', detail: e.message }) }
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
  } catch (e: any) { res.status(502).json({ error: 'PageSpeed unavailable', detail: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// GTMETRIX
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/gtmetrix/test', async (req, res) => {
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
  } catch (e: any) { res.status(502).json({ error: 'GTmetrix unavailable', detail: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// EXA SEARCH (MCP equivalent — semantic web search)
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/exa/search', async (req, res) => {
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
  } catch (e: any) { res.status(502).json({ error: 'Exa unavailable', detail: e.message }) }
})

app.post('/api/exa/find-similar', async (req, res) => {
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
  } catch (e: any) { res.status(502).json({ error: 'Exa unavailable', detail: e.message }) }
})

app.post('/api/exa/contents', async (req, res) => {
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
  } catch (e: any) { res.status(502).json({ error: 'Exa unavailable', detail: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// BROWSERLESS (MCP equivalent — scraping + Lighthouse)
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/browserless/scrape', async (req, res) => {
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
  } catch (e: any) { res.status(502).json({ error: 'Browserless unavailable', detail: e.message }) }
})

app.post('/api/browserless/lighthouse', async (req, res) => {
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
  } catch (e: any) { res.status(502).json({ error: 'Browserless Lighthouse unavailable', detail: e.message }) }
})

app.post('/api/browserless/screenshot', async (req, res) => {
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
  } catch (e: any) { res.status(502).json({ error: 'Browserless screenshot unavailable', detail: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// THORBIT (MCP equivalent — content optimization)
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/thorbit/analyze', async (req, res) => {
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
  } catch (e: any) { res.status(502).json({ error: 'Thorbit unavailable', detail: e.message }) }
})

app.post('/api/thorbit/suggestions', async (req, res) => {
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
  } catch (e: any) { res.status(502).json({ error: 'Thorbit unavailable', detail: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// SE RANKING
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/seranking/domain', async (req, res) => {
  const { domain } = req.query as Record<string, string>
  try {
    const data = await withCache(realtimeCache, `ser_domain_${domain}`, async () => {
      const r = await axios.get('https://api4.seranking.com/research/us/overview/', {
        params: { domain }, headers: { Authorization: `Token ${SE_RANKING_API}` },
      })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.status(502).json({ error: 'SE Ranking unavailable', detail: e.message }) }
})

app.get('/api/seranking/keywords', async (req, res) => {
  const { domain, limit } = req.query as Record<string, string>
  try {
    const data = await withCache(realtimeCache, `ser_kw_${domain}_${limit}`, async () => {
      const r = await axios.get('https://api4.seranking.com/research/us/keywords/', {
        params: { domain, limit: limit || 50 }, headers: { Authorization: `Token ${SE_RANKING_API}` },
      })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.status(502).json({ error: 'SE Ranking unavailable', detail: e.message }) }
})

app.get('/api/seranking/competitors', async (req, res) => {
  const { domain } = req.query as Record<string, string>
  try {
    const data = await withCache(historicalCache, `ser_comp_${domain}`, async () => {
      const r = await axios.get('https://api4.seranking.com/research/us/competitors/', {
        params: { domain }, headers: { Authorization: `Token ${SE_RANKING_API}` },
      })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.status(502).json({ error: 'SE Ranking unavailable', detail: e.message }) }
})

app.get('/api/seranking/backlinks', async (req, res) => {
  const { domain } = req.query as Record<string, string>
  try {
    const data = await withCache(realtimeCache, `ser_bl_${domain}`, async () => {
      const r = await axios.get('https://api4.seranking.com/backlinks/info/', {
        params: { domain }, headers: { Authorization: `Token ${SE_RANKING_API}` },
      })
      return r.data
    })
    res.json(data)
  } catch (e: any) { res.status(502).json({ error: 'SE Ranking unavailable', detail: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// AGGREGATED MULTI-SOURCE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// Overview: combines ALL sources
app.get('/api/overview', async (req, res) => {
  const { domain } = req.query as Record<string, string>
  const today = new Date().toISOString().split('T')[0]
  const result: Record<string, any> = { domain, sources: {}, activeSources: [] }

  const calls = await Promise.allSettled([
    // Ahrefs DR + metrics
    axios.get('https://api.ahrefs.com/v3/site-explorer/domain-rating', {
      params: { target: domain, date: today }, headers: { Authorization: `Bearer ${AHREFS_API_KEY}` }, timeout: 10000,
    }),
    axios.get('https://api.ahrefs.com/v3/site-explorer/metrics', {
      params: { target: domain, date: today, mode: 'subdomains' }, headers: { Authorization: `Bearer ${AHREFS_API_KEY}` }, timeout: 10000,
    }),
    // SEMrush overview
    axios.get('https://api.semrush.com/', {
      params: { type: 'domain_ranks', key: SEMRUSH_API_KEY, domain, database: 'us', export_columns: 'Dn,Rk,Or,Ot,Oc,Ad,At,Ac' }, timeout: 10000,
    }),
    // DataForSEO domain summary
    axios.post('https://api.dataforseo.com/v3/backlinks/domain_pages_summary/live',
      [{ target: domain, include_subdomains: true }],
      { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' }, timeout: 10000 }),
    // SE Ranking overview
    SE_RANKING_API ? axios.get('https://api4.seranking.com/research/us/overview/', {
      params: { domain }, headers: { Authorization: `Token ${SE_RANKING_API}` }, timeout: 10000,
    }) : Promise.reject('No API key'),
    // Exa — find similar sites
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
    result.sources.seranking = seranking.value.data
    result.activeSources.push('SE Ranking')
  }
  if (exa.status === 'fulfilled') {
    result.sources.exa = { similarSites: exa.value.data?.results?.slice(0, 5) }
    result.activeSources.push('Exa')
  }

  res.json(result)
})

// Aggregated keywords from multiple sources
app.get('/api/keywords/aggregated', async (req, res) => {
  const { domain, limit } = req.query as Record<string, string>
  const today = new Date().toISOString().split('T')[0]
  const result: Record<string, any> = { domain, sources: {}, activeSources: [] }

  const calls = await Promise.allSettled([
    axios.get('https://api.ahrefs.com/v3/site-explorer/organic-keywords', {
      params: { target: domain, date: today, mode: 'subdomains', limit: limit || '50' },
      headers: { Authorization: `Bearer ${AHREFS_API_KEY}` }, timeout: 10000,
    }),
    axios.get('https://api.semrush.com/', {
      params: { type: 'domain_organic', key: SEMRUSH_API_KEY, domain, database: 'us', display_limit: limit || 50, export_columns: 'Ph,Po,Pp,Nq,Cp,Co,Kd,Ur,Tr,Tc,Nr,Td' },
      timeout: 10000,
    }),
    axios.post('https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live',
      [{ target: domain, language_name: 'English', location_code: 2840, limit: Number(limit) || 50 }],
      { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' }, timeout: 10000 }),
    SE_RANKING_API ? axios.get('https://api4.seranking.com/research/us/keywords/', {
      params: { domain, limit: limit || 50 }, headers: { Authorization: `Token ${SE_RANKING_API}` }, timeout: 10000,
    }) : Promise.reject('No API key'),
  ])

  const [ahrefs, semrush, dataforseo, seranking] = calls
  if (ahrefs.status === 'fulfilled') { result.sources.ahrefs = ahrefs.value.data; result.activeSources.push('Ahrefs') }
  if (semrush.status === 'fulfilled') { result.sources.semrush = parseSemrushCSV(semrush.value.data); result.activeSources.push('SEMrush') }
  if (dataforseo.status === 'fulfilled') { result.sources.dataforseo = dataforseo.value.data; result.activeSources.push('DataForSEO') }
  if (seranking.status === 'fulfilled') { result.sources.seranking = seranking.value.data; result.activeSources.push('SE Ranking') }

  res.json(result)
})

// Aggregated backlinks from multiple sources
app.get('/api/backlinks/aggregated', async (req, res) => {
  const { domain } = req.query as Record<string, string>
  const result: Record<string, any> = { domain, sources: {}, activeSources: [] }

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
    SE_RANKING_API ? axios.get('https://api4.seranking.com/backlinks/info/', {
      params: { domain }, headers: { Authorization: `Token ${SE_RANKING_API}` }, timeout: 10000,
    }) : Promise.reject('No API key'),
  ])

  const [ahrefsStats, ahrefsRD, dataforseo, seranking] = calls
  if (ahrefsStats.status === 'fulfilled') {
    result.sources.ahrefs = { stats: ahrefsStats.value.data }
    if (ahrefsRD.status === 'fulfilled') result.sources.ahrefs.refdomains = ahrefsRD.value.data
    result.activeSources.push('Ahrefs')
  }
  if (dataforseo.status === 'fulfilled') {
    result.sources.dataforseo = dataforseo.value.data?.tasks?.[0]?.result?.[0]
    if (result.sources.dataforseo) result.activeSources.push('DataForSEO')
  }
  if (seranking.status === 'fulfilled') { result.sources.seranking = seranking.value.data; result.activeSources.push('SE Ranking') }

  res.json(result)
})

// Aggregated vitals from multiple sources
app.post('/api/vitals/aggregated', async (req, res) => {
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
app.get('/api/competitors/aggregated', async (req, res) => {
  const { domain } = req.query as Record<string, string>
  const result: Record<string, any> = { domain, sources: {}, activeSources: [] }

  const calls = await Promise.allSettled([
    axios.get('https://api.semrush.com/', {
      params: { type: 'domain_organic_organic', key: SEMRUSH_API_KEY, domain, database: 'us', display_limit: 10, export_columns: 'Dn,Cr,Np,Or,Ot,Oc,Ad' },
      timeout: 10000,
    }),
    axios.post('https://api.dataforseo.com/v3/dataforseo_labs/google/competitors_domain/live',
      [{ target: domain, language_name: 'English', location_code: 2840, limit: 10 }],
      { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' }, timeout: 10000 }),
    SE_RANKING_API ? axios.get('https://api4.seranking.com/research/us/competitors/', {
      params: { domain }, headers: { Authorization: `Token ${SE_RANKING_API}` }, timeout: 10000,
    }) : Promise.reject('No API key'),
    EXA_API_KEY ? axios.post('https://api.exa.ai/findSimilar', {
      url: `https://${domain}`, numResults: 10,
      contents: { text: { maxCharacters: 300 }, highlights: { numSentences: 2 } },
    }, { headers: { 'x-api-key': EXA_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 }) : Promise.reject('No API key'),
  ])

  const [semrush, dataforseo, seranking, exa] = calls
  if (semrush.status === 'fulfilled') { result.sources.semrush = parseSemrushCSV(semrush.value.data); result.activeSources.push('SEMrush') }
  if (dataforseo.status === 'fulfilled') { result.sources.dataforseo = dataforseo.value.data; result.activeSources.push('DataForSEO') }
  if (seranking.status === 'fulfilled') { result.sources.seranking = seranking.value.data; result.activeSources.push('SE Ranking') }
  if (exa.status === 'fulfilled') { result.sources.exa = exa.value.data?.results; result.activeSources.push('Exa') }

  res.json(result)
})

// Content analysis — Exa competitive content + Thorbit
app.post('/api/content/analyze', async (req, res) => {
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
app.get('/api/alerts/aggregated', async (req, res) => {
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

  res.json({ alerts, activeSources: ['Ahrefs', 'PageSpeed', 'SE Ranking', 'DataForSEO'].filter(Boolean) })
})

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK + TOOLS STATUS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/health', async (_req, res) => {
  const statuses: Record<string, { ok: boolean; latency?: number; error?: string; configured: boolean }> = {}

  const checks = [
    { name: 'ahrefs', configured: !!AHREFS_API_KEY, fn: () => axios.get('https://api.ahrefs.com/v3/site-explorer/domain-rating', { params: { target: 'ahrefs.com', date: new Date().toISOString().split('T')[0] }, headers: { Authorization: `Bearer ${AHREFS_API_KEY}` }, timeout: 5000 }) },
    { name: 'semrush', configured: !!SEMRUSH_API_KEY, fn: () => axios.get('https://api.semrush.com/', { params: { type: 'domain_ranks', key: SEMRUSH_API_KEY, domain: 'semrush.com', database: 'us', export_columns: 'Dn' }, timeout: 5000 }) },
    { name: 'dataforseo', configured: !!(DATAFORSEO_LOGIN && DATAFORSEO_PASSWORD), fn: () => axios.get('https://api.dataforseo.com/v3/appendix/user_data', { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}` }, timeout: 5000 }) },
    { name: 'pagespeed', configured: !!PAGESPEED_API_KEY, fn: () => axios.get('https://www.googleapis.com/pagespeedonline/v5/runPagespeed', { params: { url: 'https://google.com', strategy: 'mobile', key: PAGESPEED_API_KEY }, timeout: 15000 }) },
    { name: 'gtmetrix', configured: !!GTMETRIX_API_KEY, fn: () => axios.get('https://gtmetrix.com/api/2.0/status', { headers: { Authorization: `Basic ${Buffer.from(`${GTMETRIX_EMAIL}:${GTMETRIX_API_KEY}`).toString('base64')}` }, timeout: 5000 }) },
    { name: 'seranking', configured: !!SE_RANKING_API, fn: () => axios.get('https://api4.seranking.com/system/status', { headers: { Authorization: `Token ${SE_RANKING_API}` }, timeout: 5000 }) },
    { name: 'exa', configured: !!EXA_API_KEY, fn: () => axios.post('https://api.exa.ai/search', { query: 'test', numResults: 1 }, { headers: { 'x-api-key': EXA_API_KEY, 'Content-Type': 'application/json' }, timeout: 5000 }) },
    { name: 'browserless', configured: !!BROWSERLESS_API_KEY, fn: () => axios.get(`https://chrome.browserless.io/pressure?token=${BROWSERLESS_API_KEY}`, { timeout: 5000 }) },
    { name: 'thorbit', configured: !!THORBIT_API_KEY, fn: () => axios.get('https://api.thorbit.com/v1/status', { headers: { Authorization: `Bearer ${THORBIT_API_KEY}` }, timeout: 5000 }) },
  ]

  await Promise.allSettled(
    checks.map(async ({ name, configured, fn }) => {
      if (!configured) { statuses[name] = { ok: false, error: 'Not configured', configured: false }; return }
      const start = Date.now()
      try {
        await fn()
        statuses[name] = { ok: true, latency: Date.now() - start, configured: true }
      } catch (e: any) {
        statuses[name] = { ok: false, error: e.message, latency: Date.now() - start, configured: true }
      }
    })
  )

  res.json({ statuses, cacheStats: { realtime: realtimeCache.getStats(), historical: historicalCache.getStats() } })
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

app.listen(PORT, () => {
  console.log(`SEO Dashboard API server running on port ${PORT}`)
})

export default app
