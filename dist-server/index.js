import express from 'express';
import cors from 'cors';
import NodeCache from 'node-cache';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
// Caches: 5min for realtime, 24h for historical
const realtimeCache = new NodeCache({ stdTTL: 300 });
const historicalCache = new NodeCache({ stdTTL: 86400 });
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173', process.env.FRONTEND_URL || ''].filter(Boolean) }));
app.use(express.json());
// ─── Env vars ────────────────────────────────────────────────────────────────
const AHREFS_API_KEY = process.env.AHREFS_API_KEY || process.env.AHREFS_API || '';
const SEMRUSH_API_KEY = process.env.SEMRUSH_API || '';
const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN || '';
const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD || '';
const PAGESPEED_API_KEY = process.env.GOOGLE_GEMINI_API || process.env.PAGESPEED_API_KEY || '';
const GTMETRIX_API_KEY = process.env.GTMETRIX_API || '';
const GTMETRIX_EMAIL = process.env.GTMETRIX_EMAIL || 'tomerake@gmail.com';
const SE_RANKING_API = process.env.SE_RANKING_API || '';
const SERPSTAT_API = process.env.SERPSTAT_API || '';
const KEYWORDS_EVERYWHERE_API = process.env.KEYWORDS_EVERYWHERE_API || '';
const DATAFORSEO_AUTH = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64');
// ─── Helper: cache wrapper ────────────────────────────────────────────────────
async function withCache(cache, key, fetcher) {
    const cached = cache.get(key);
    if (cached !== undefined)
        return cached;
    const data = await fetcher();
    cache.set(key, data);
    return data;
}
// ─── Ahrefs endpoints ─────────────────────────────────────────────────────────
app.get('/api/ahrefs/domain-rating', async (req, res) => {
    const { target, date } = req.query;
    const key = `ahrefs_dr_${target}_${date}`;
    try {
        const data = await withCache(realtimeCache, key, async () => {
            const r = await axios.get('https://api.ahrefs.com/v3/site-explorer/domain-rating', {
                params: { target, date },
                headers: { Authorization: `Bearer ${AHREFS_API_KEY}` },
            });
            return r.data;
        });
        res.json(data);
    }
    catch (e) {
        res.status(502).json({ error: 'Ahrefs unavailable', detail: e.message });
    }
});
app.get('/api/ahrefs/metrics', async (req, res) => {
    const { target, date, mode } = req.query;
    const key = `ahrefs_metrics_${target}_${date}`;
    try {
        const data = await withCache(realtimeCache, key, async () => {
            const r = await axios.get('https://api.ahrefs.com/v3/site-explorer/metrics', {
                params: { target, date, mode: mode || 'subdomains' },
                headers: { Authorization: `Bearer ${AHREFS_API_KEY}` },
            });
            return r.data;
        });
        res.json(data);
    }
    catch (e) {
        res.status(502).json({ error: 'Ahrefs unavailable', detail: e.message });
    }
});
app.get('/api/ahrefs/organic-keywords', async (req, res) => {
    const { target, date, mode, limit, select, order_by } = req.query;
    const key = `ahrefs_kw_${target}_${date}_${limit}`;
    try {
        const data = await withCache(realtimeCache, key, async () => {
            const r = await axios.get('https://api.ahrefs.com/v3/site-explorer/organic-keywords', {
                params: { target, date, mode: mode || 'subdomains', limit: limit || '50', select, order_by },
                headers: { Authorization: `Bearer ${AHREFS_API_KEY}` },
            });
            return r.data;
        });
        res.json(data);
    }
    catch (e) {
        res.status(502).json({ error: 'Ahrefs unavailable', detail: e.message });
    }
});
app.get('/api/ahrefs/refdomains', async (req, res) => {
    const { target, mode, limit, select, order_by } = req.query;
    const key = `ahrefs_rd_${target}_${limit}`;
    try {
        const data = await withCache(realtimeCache, key, async () => {
            const r = await axios.get('https://api.ahrefs.com/v3/site-explorer/refdomains', {
                params: { target, mode: mode || 'subdomains', limit: limit || '20', select, order_by },
                headers: { Authorization: `Bearer ${AHREFS_API_KEY}` },
            });
            return r.data;
        });
        res.json(data);
    }
    catch (e) {
        res.status(502).json({ error: 'Ahrefs unavailable', detail: e.message });
    }
});
app.get('/api/ahrefs/backlinks-stats', async (req, res) => {
    const { target, mode } = req.query;
    const key = `ahrefs_bl_${target}`;
    try {
        const data = await withCache(realtimeCache, key, async () => {
            const r = await axios.get('https://api.ahrefs.com/v3/site-explorer/backlinks-stats', {
                params: { target, mode: mode || 'subdomains' },
                headers: { Authorization: `Bearer ${AHREFS_API_KEY}` },
            });
            return r.data;
        });
        res.json(data);
    }
    catch (e) {
        res.status(502).json({ error: 'Ahrefs unavailable', detail: e.message });
    }
});
// ─── SEMrush endpoints ────────────────────────────────────────────────────────
app.get('/api/semrush/domain-overview', async (req, res) => {
    const { domain } = req.query;
    const key = `semrush_overview_${domain}`;
    try {
        const data = await withCache(realtimeCache, key, async () => {
            const r = await axios.get('https://api.semrush.com/', {
                params: {
                    type: 'domain_ranks',
                    key: SEMRUSH_API_KEY,
                    domain,
                    database: 'us',
                    export_columns: 'Dn,Rk,Or,Ot,Oc,Ad,At,Ac',
                },
            });
            // SEMrush returns CSV
            const lines = r.data.split('\n').filter(Boolean);
            if (lines.length < 2)
                return null;
            const headers = lines[0].split(';');
            const values = lines[1].split(';');
            const obj = {};
            headers.forEach((h, i) => { obj[h] = values[i]; });
            return obj;
        });
        res.json(data);
    }
    catch (e) {
        res.status(502).json({ error: 'SEMrush unavailable', detail: e.message });
    }
});
app.get('/api/semrush/competitors', async (req, res) => {
    const { domain } = req.query;
    const key = `semrush_competitors_${domain}`;
    try {
        const data = await withCache(historicalCache, key, async () => {
            const r = await axios.get('https://api.semrush.com/', {
                params: {
                    type: 'domain_organic_organic',
                    key: SEMRUSH_API_KEY,
                    domain,
                    database: 'us',
                    display_limit: 10,
                    export_columns: 'Dn,Cr,Np,Or,Ot,Oc,Ad',
                },
            });
            const lines = r.data.split('\n').filter(Boolean);
            if (lines.length < 2)
                return [];
            const headers = lines[0].split(';');
            return lines.slice(1).map((line) => {
                const values = line.split(';');
                const obj = {};
                headers.forEach((h, i) => { obj[h] = values[i]; });
                return obj;
            });
        });
        res.json(data);
    }
    catch (e) {
        res.status(502).json({ error: 'SEMrush unavailable', detail: e.message });
    }
});
app.get('/api/semrush/keyword-overview', async (req, res) => {
    const { keyword, database } = req.query;
    const key = `semrush_kw_${keyword}_${database || 'us'}`;
    try {
        const data = await withCache(historicalCache, key, async () => {
            const r = await axios.get('https://api.semrush.com/', {
                params: {
                    type: 'phrase_this',
                    key: SEMRUSH_API_KEY,
                    phrase: keyword,
                    database: database || 'us',
                    export_columns: 'Ph,Nq,Cp,Co,Nr,Td',
                },
            });
            const lines = r.data.split('\n').filter(Boolean);
            if (lines.length < 2)
                return null;
            const headers = lines[0].split(';');
            const values = lines[1].split(';');
            const obj = {};
            headers.forEach((h, i) => { obj[h] = values[i]; });
            return obj;
        });
        res.json(data);
    }
    catch (e) {
        res.status(502).json({ error: 'SEMrush unavailable', detail: e.message });
    }
});
// ─── DataForSEO endpoints ─────────────────────────────────────────────────────
app.post('/api/dataforseo/serp', async (req, res) => {
    const { keyword, location_code, language_code } = req.body;
    const key = `dfs_serp_${keyword}_${location_code}`;
    try {
        const data = await withCache(realtimeCache, key, async () => {
            const r = await axios.post('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', [{ keyword, location_code: location_code || 2840, language_code: language_code || 'en', depth: 10 }], { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' } });
            return r.data;
        });
        res.json(data);
    }
    catch (e) {
        res.status(502).json({ error: 'DataForSEO unavailable', detail: e.message });
    }
});
app.post('/api/dataforseo/onpage', async (req, res) => {
    const { target, max_crawl_pages } = req.body;
    const key = `dfs_onpage_${target}`;
    try {
        const data = await withCache(historicalCache, key, async () => {
            // Step 1: create task
            const taskRes = await axios.post('https://api.dataforseo.com/v3/on_page/task_post', [{ target, max_crawl_pages: max_crawl_pages || 10, load_resources: true, enable_javascript: false }], { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' } });
            const taskId = taskRes.data?.tasks?.[0]?.id;
            if (!taskId)
                throw new Error('No task ID returned');
            // Wait for completion (poll up to 30s)
            for (let i = 0; i < 6; i++) {
                await new Promise(r => setTimeout(r, 5000));
                const statusRes = await axios.get(`https://api.dataforseo.com/v3/on_page/summary/${taskId}`, { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}` } });
                const status = statusRes.data?.tasks?.[0]?.status_code;
                if (status === 20000) {
                    const pagesRes = await axios.get(`https://api.dataforseo.com/v3/on_page/pages/${taskId}`, { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}` } });
                    return { summary: statusRes.data, pages: pagesRes.data };
                }
            }
            throw new Error('On-page audit timed out');
        });
        res.json(data);
    }
    catch (e) {
        res.status(502).json({ error: 'DataForSEO unavailable', detail: e.message });
    }
});
app.post('/api/dataforseo/backlinks', async (req, res) => {
    const { target, limit } = req.body;
    const key = `dfs_bl_${target}_${limit}`;
    try {
        const data = await withCache(realtimeCache, key, async () => {
            const r = await axios.post('https://api.dataforseo.com/v3/backlinks/backlinks/live', [{ target, limit: limit || 50, order_by: ['rank,desc'], filters: ['dofollow,=,true'] }], { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' } });
            return r.data;
        });
        res.json(data);
    }
    catch (e) {
        res.status(502).json({ error: 'DataForSEO unavailable', detail: e.message });
    }
});
app.post('/api/dataforseo/domain-summary', async (req, res) => {
    const { target } = req.body;
    const key = `dfs_domain_${target}`;
    try {
        const data = await withCache(realtimeCache, key, async () => {
            const r = await axios.post('https://api.dataforseo.com/v3/backlinks/domain_pages_summary/live', [{ target, include_subdomains: true }], { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' } });
            return r.data;
        });
        res.json(data);
    }
    catch (e) {
        res.status(502).json({ error: 'DataForSEO unavailable', detail: e.message });
    }
});
// ─── PageSpeed Insights ───────────────────────────────────────────────────────
app.get('/api/pagespeed', async (req, res) => {
    const { url, strategy } = req.query;
    const key = `psi_${url}_${strategy || 'mobile'}`;
    try {
        const data = await withCache(realtimeCache, key, async () => {
            const r = await axios.get('https://www.googleapis.com/pagespeedonline/v5/runPagespeed', {
                params: {
                    url,
                    strategy: strategy || 'mobile',
                    key: PAGESPEED_API_KEY,
                    category: ['performance', 'accessibility', 'best-practices', 'seo'],
                },
            });
            return r.data;
        });
        res.json(data);
    }
    catch (e) {
        res.status(502).json({ error: 'PageSpeed unavailable', detail: e.message });
    }
});
// ─── GTmetrix ─────────────────────────────────────────────────────────────────
app.post('/api/gtmetrix/test', async (req, res) => {
    const { url } = req.body;
    const key = `gtm_${url}`;
    try {
        const data = await withCache(realtimeCache, key, async () => {
            // Create test
            const auth = Buffer.from(`${GTMETRIX_EMAIL}:${GTMETRIX_API_KEY}`).toString('base64');
            const createRes = await axios.post('https://gtmetrix.com/api/2.0/tests', { data: { type: 'test', attributes: { url } } }, { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/vnd.api+json' } });
            const testId = createRes.data?.data?.id;
            if (!testId)
                throw new Error('No test ID');
            // Poll for completion
            for (let i = 0; i < 12; i++) {
                await new Promise(r => setTimeout(r, 5000));
                const statusRes = await axios.get(`https://gtmetrix.com/api/2.0/tests/${testId}`, { headers: { Authorization: `Basic ${auth}` } });
                const state = statusRes.data?.data?.attributes?.state;
                if (state === 'completed')
                    return statusRes.data;
                if (state === 'error')
                    throw new Error('GTmetrix test failed');
            }
            throw new Error('GTmetrix test timed out');
        });
        res.json(data);
    }
    catch (e) {
        res.status(502).json({ error: 'GTmetrix unavailable', detail: e.message });
    }
});
// ─── SE Ranking ───────────────────────────────────────────────────────────────
app.get('/api/seranking/keywords', async (req, res) => {
    const { project_id } = req.query;
    const key = `ser_kw_${project_id}`;
    try {
        const data = await withCache(realtimeCache, key, async () => {
            const r = await axios.get('https://api4.seranking.com/research/us/overview/', {
                params: { domain: project_id },
                headers: { Authorization: `Token ${SE_RANKING_API}` },
            });
            return r.data;
        });
        res.json(data);
    }
    catch (e) {
        res.status(502).json({ error: 'SE Ranking unavailable', detail: e.message });
    }
});
app.get('/api/seranking/domain', async (req, res) => {
    const { domain } = req.query;
    const key = `ser_domain_${domain}`;
    try {
        const data = await withCache(realtimeCache, key, async () => {
            const r = await axios.get(`https://api4.seranking.com/research/us/overview/`, {
                params: { domain },
                headers: { Authorization: `Token ${SE_RANKING_API}` },
            });
            return r.data;
        });
        res.json(data);
    }
    catch (e) {
        res.status(502).json({ error: 'SE Ranking unavailable', detail: e.message });
    }
});
// ─── Serpstat ─────────────────────────────────────────────────────────────────
app.post('/api/serpstat/domain', async (req, res) => {
    const { domain } = req.body;
    const key = `serpstat_domain_${domain}`;
    try {
        const data = await withCache(realtimeCache, key, async () => {
            const r = await axios.get('https://api.serpstat.com/v4/', {
                params: {
                    token: SERPSTAT_API,
                    method: 'SerpstatDomainProcedure.getDomainsInfo',
                    domains: domain,
                    se: 'g_us',
                },
            });
            return r.data;
        });
        res.json(data);
    }
    catch (e) {
        res.status(502).json({ error: 'Serpstat unavailable', detail: e.message });
    }
});
// ─── Keywords Everywhere ──────────────────────────────────────────────────────
app.post('/api/keywords-everywhere', async (req, res) => {
    const { keywords } = req.body;
    const key = `kie_${keywords?.join(',')}`;
    try {
        const data = await withCache(historicalCache, key, async () => {
            const params = new URLSearchParams();
            params.append('dataSource', 'gkp');
            params.append('country', 'us');
            params.append('currency', 'USD');
            keywords?.forEach((kw) => params.append('kw[]', kw));
            const r = await axios.post('https://api.keywordseverywhere.com/v1/get_keyword_data', params, { headers: { Authorization: `Bearer ${KEYWORDS_EVERYWHERE_API}`, 'Content-Type': 'application/x-www-form-urlencoded' } });
            return r.data;
        });
        res.json(data);
    }
    catch (e) {
        res.status(502).json({ error: 'Keywords Everywhere unavailable', detail: e.message });
    }
});
// ─── Aggregated endpoints ─────────────────────────────────────────────────────
// Overview: combines Ahrefs + SEMrush + DataForSEO
app.get('/api/overview', async (req, res) => {
    const { domain } = req.query;
    const results = { domain, sources: {} };
    await Promise.allSettled([
        // Ahrefs DR
        axios.get('https://api.ahrefs.com/v3/site-explorer/domain-rating', {
            params: { target: domain, date: new Date().toISOString().split('T')[0] },
            headers: { Authorization: `Bearer ${AHREFS_API_KEY}` },
        }).then(r => { results.sources.ahrefs = r.data; }),
        // SEMrush overview
        axios.get('https://api.semrush.com/', {
            params: { type: 'domain_ranks', key: SEMRUSH_API_KEY, domain, database: 'us', export_columns: 'Dn,Rk,Or,Ot,Oc,Ad,At,Ac' },
        }).then(r => {
            const lines = r.data.split('\n').filter(Boolean);
            if (lines.length >= 2) {
                const headers = lines[0].split(';');
                const values = lines[1].split(';');
                const obj = {};
                headers.forEach((h, i) => { obj[h] = values[i]; });
                results.sources.semrush = obj;
            }
        }),
        // DataForSEO domain summary
        axios.post('https://api.dataforseo.com/v3/backlinks/domain_pages_summary/live', [{ target: domain, include_subdomains: true }], { headers: { Authorization: `Basic ${DATAFORSEO_AUTH}`, 'Content-Type': 'application/json' } }).then(r => { results.sources.dataforseo = r.data?.tasks?.[0]?.result?.[0]; }),
    ]);
    res.json(results);
});
// Health check + API status
app.get('/api/health', async (_req, res) => {
    const statuses = {};
    const checks = [
        {
            name: 'ahrefs',
            fn: () => axios.get('https://api.ahrefs.com/v3/site-explorer/domain-rating', {
                params: { target: 'ahrefs.com', date: new Date().toISOString().split('T')[0] },
                headers: { Authorization: `Bearer ${AHREFS_API_KEY}` },
                timeout: 5000,
            }),
        },
        {
            name: 'semrush',
            fn: () => axios.get('https://api.semrush.com/', {
                params: { type: 'domain_ranks', key: SEMRUSH_API_KEY, domain: 'semrush.com', database: 'us', export_columns: 'Dn' },
                timeout: 5000,
            }),
        },
        {
            name: 'dataforseo',
            fn: () => axios.get('https://api.dataforseo.com/v3/appendix/user_data', {
                headers: { Authorization: `Basic ${DATAFORSEO_AUTH}` },
                timeout: 5000,
            }),
        },
        {
            name: 'pagespeed',
            fn: () => axios.get('https://www.googleapis.com/pagespeedonline/v5/runPagespeed', {
                params: { url: 'https://google.com', strategy: 'mobile', key: PAGESPEED_API_KEY },
                timeout: 10000,
            }),
        },
    ];
    await Promise.allSettled(checks.map(async ({ name, fn }) => {
        const start = Date.now();
        try {
            await fn();
            statuses[name] = { ok: true, latency: Date.now() - start };
        }
        catch (e) {
            statuses[name] = { ok: false, error: e.message, latency: Date.now() - start };
        }
    }));
    res.json({ statuses, cacheStats: { realtime: realtimeCache.getStats(), historical: historicalCache.getStats() } });
});
// Cache management
app.post('/api/cache/clear', (_req, res) => {
    realtimeCache.flushAll();
    historicalCache.flushAll();
    res.json({ ok: true, message: 'All caches cleared' });
});
// ─── Serve static frontend in production ─────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, '../dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}
app.listen(PORT, () => {
    console.log(`SEO Dashboard API server running on port ${PORT}`);
});
export default app;
