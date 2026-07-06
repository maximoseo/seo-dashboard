/**
 * SEO Dashboard — Daily Snapshot Job
 * 
 * This script runs daily via N8N cron and captures key SEO metrics
 * from multiple providers, saving them to Supabase seo_snapshots table.
 * 
 * N8N Setup:
 * 1. Create a Schedule Trigger (daily at 06:00)
 * 2. Add a Code node with this script
 * 3. Set environment variables in N8N credentials
 */

const SUPABASE_URL = $env.SUPABASE_URL || 'https://wtpczvyupmavzrxisvcm.supabase.co';
const SUPABASE_KEY = $env.SUPABASE_SERVICE_KEY;
const PROXY_URL = $env.SEO_DASHBOARD_PROXY || 'https://seo-dashboard-gzb6.onrender.com';

// Sites to track (from Google Sheets or hardcoded)
const SITES = [
  { id: 'galoz', domain: 'galoz.co.il' },
  { id: 'topsun', domain: 'topsun.co.il' },
  { id: 'topmedica', domain: 'topmedica.co.il' },
  { id: 'arbelpro', domain: 'arbelpro.co.il' },
  { id: 'detelix', domain: 'detelix.com' },
  { id: 'amir-peleg', domain: 'amir-peleg.com' },
  { id: 'betipul', domain: 'betipul.org' },
  { id: 'nyg', domain: 'nyg.co.il' },
  { id: 'urielcenter', domain: 'urielcenter.co.il' },
  { id: 'd-alon', domain: 'd-alon.co.il' },
];

async function insertSnapshot(siteId, domain, source, metric, value) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/seo_snapshots`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      site_id: siteId,
      domain: domain,
      source: source,
      metric: metric,
      value: value,
    }),
  });
  return res.ok;
}

async function fetchProxy(endpoint, params = {}) {
  const url = new URL(`${PROXY_URL}/api/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${$env.DASHBOARD_API_KEY || 'dev'}` },
    signal: AbortSignal.timeout(15000),
  });
  
  if (!res.ok) return null;
  return res.json();
}

const results = [];

for (const site of SITES) {
  try {
    // 1. Ahrefs metrics
    const ahrefsMetrics = await fetchProxy('ahrefs/metrics', { target: site.domain, date: new Date().toISOString().split('T')[0] });
    if (ahrefsMetrics?.metrics) {
      const m = ahrefsMetrics.metrics;
      if (m.org_traffic != null) await insertSnapshot(site.id, site.domain, 'ahrefs', 'organic_traffic', m.org_traffic);
      if (m.org_keywords != null) await insertSnapshot(site.id, site.domain, 'ahrefs', 'organic_keywords', m.org_keywords);
      if (m.refdomains != null) await insertSnapshot(site.id, site.domain, 'ahrefs', 'refdomains', m.refdomains);
      if (m.backlinks != null) await insertSnapshot(site.id, site.domain, 'ahrefs', 'backlinks', m.backlinks);
    }

    // 2. Ahrefs Domain Rating
    const ahrefsDR = await fetchProxy('ahrefs/domain-rating', { target: site.domain, date: new Date().toISOString().split('T')[0] });
    if (ahrefsDR?.domain_rating?.rating != null) {
      await insertSnapshot(site.id, site.domain, 'ahrefs', 'domain_rating', ahrefsDR.domain_rating.rating);
    }

    // 3. SEMrush overview
    const semrush = await fetchProxy('semrush/domain-overview', { domain: site.domain });
    if (semrush) {
      const num = (v) => { const n = Number(String(v).replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : null; };
      if (semrush['Organic Keywords']) await insertSnapshot(site.id, site.domain, 'semrush', 'organic_keywords', num(semrush['Organic Keywords']));
      if (semrush['Organic Traffic']) await insertSnapshot(site.id, site.domain, 'semrush', 'organic_traffic', num(semrush['Organic Traffic']));
    }

    // 4. PageSpeed score
    const pagespeed = await fetchProxy('pagespeed', { url: `https://${site.domain}`, strategy: 'mobile' });
    if (pagespeed?.lighthouseResult?.categories) {
      const cats = pagespeed.lighthouseResult.categories;
      if (cats.performance?.score != null) await insertSnapshot(site.id, site.domain, 'pagespeed', 'performance_score_mobile', Math.round(cats.performance.score * 100));
      if (cats.seo?.score != null) await insertSnapshot(site.id, site.domain, 'pagespeed', 'seo_score_mobile', Math.round(cats.seo.score * 100));
      if (cats.accessibility?.score != null) await insertSnapshot(site.id, site.domain, 'pagespeed', 'a11y_score_mobile', Math.round(cats.accessibility.score * 100));
    }

    results.push({ site: site.domain, status: 'success', metrics: 7 });
  } catch (e) {
    results.push({ site: site.domain, status: 'error', error: e.message });
  }
}

return { json: { date: new Date().toISOString(), sites_processed: SITES.length, results } };
