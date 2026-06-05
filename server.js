const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Create an axios instance that follows redirects and ignores SSL errors
const fetcher = axios.create({
  timeout: 15000,
  maxRedirects: 5,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; SEO-Dashboard/1.0; +https://seo-dashboard.maximo-seo.ai)'
  },
  httpsAgent: new https.Agent({ rejectUnauthorized: false })
});

app.post('/api/analyze', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const start = Date.now();
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    const response = await fetcher.get(normalized, { responseType: 'text' });
    const loadTime = Date.now() - start;
    const html = response.data;
    const $ = cheerio.load(html);
    const finalUrl = response.request?.res?.responseUrl || normalized;
    const isSSL = finalUrl.startsWith('https');

    // Title
    const title = $('title').first().text().trim();
    const titleLength = title.length;

    // Meta description
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    const descLength = metaDesc.length;

    // Meta viewport
    const viewport = $('meta[name="viewport"]').attr('content') || '';

    // Canonical
    const canonical = $('link[rel="canonical"]').attr('href') || '';

    // Robots
    const robots = $('meta[name="robots"]').attr('content') || '';

    // Open Graph
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';

    // Headers analysis
    const h1 = [];
    $('h1').each((_, el) => h1.push($(el).text().trim()));
    const h2 = [];
    $('h2').each((_, el) => h2.push($(el).text().trim()));
    const h3Count = $('h3').length;

    // Images
    const images = [];
    $('img').each((_, el) => {
      images.push({
        src: ($(el).attr('src') || '').substring(0, 200),
        alt: ($(el).attr('alt') || '').substring(0, 100),
        hasAlt: !!$(el).attr('alt')
      });
    });
    const imagesWithoutAlt = images.filter(i => !i.hasAlt).length;

    // Links
    const internalLinks = [];
    const externalLinks = [];
    const linkHostname = new URL(finalUrl).hostname;
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      try {
        const h = new URL(href, finalUrl);
        if (h.hostname === linkHostname || href.startsWith('/')) {
          internalLinks.push(href);
        } else {
          externalLinks.push(href);
        }
      } catch { internalLinks.push(href); }
    });

    // Schema
    const schemas = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try { schemas.push(JSON.parse($(el).html())); } catch {}
    });

    // Word count
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const wordCount = bodyText.split(/\s+/).length;

    // Text/HTML ratio
    const htmlSize = html.length;
    const textRatio = Math.round((bodyText.length / htmlSize) * 100);

    // Score calculations
    const scores = {
      title: calcTitleScore(title, titleLength),
      description: calcDescScore(metaDesc, descLength),
      headings: calcHeadingScore(h1.length, h2.length),
      images: calcImageScore(images.length, imagesWithoutAlt),
      links: calcLinkScore(internalLinks.length, externalLinks.length),
      schema: calcSchemaScore(schemas.length, schemas),
      mobile: calcMobileScore(viewport),
      performance: calcPerfScore(loadTime, htmlSize),
      seo: 0
    };
    scores.seo = Math.round(Object.values(scores).reduce((a, v) => a + v, 0) / (Object.keys(scores).length - 1));

    res.json({
      success: true,
      url: finalUrl,
      ssl: isSSL,
      loadTime,
      htmlSize,
      title,
      titleLength,
      metaDesc,
      descLength,
      viewport,
      canonical,
      robots,
      og: { title: ogTitle, description: ogDesc, image: ogImage },
      headings: { h1, h2, h3Count },
      images: { total: images.length, withoutAlt: imagesWithoutAlt, list: images.slice(0, 20) },
      links: { internal: internalLinks.length, external: externalLinks.length },
      schemas,
      wordCount,
      textRatio,
      scores
    });
  } catch (err) {
    const code = err.response?.status || err.code || 'UNKNOWN';
    res.json({ success: false, error: `Failed to fetch: ${code} — ${err.message}` });
  }
});

function calcTitleScore(title, len) {
  if (!title) return 0;
  if (len >= 10 && len <= 65) return 100;
  if (len > 0 && len < 10) return 30;
  if (len > 65) return 60;
  return 0;
}

function calcDescScore(desc, len) {
  if (!desc) return 0;
  if (len >= 70 && len <= 160) return 100;
  if (len > 0 && len < 70) return 40;
  if (len > 160) return 60;
  return 0;
}

function calcHeadingScore(h1c, h2c) {
  if (h1c === 1 && h2c >= 1) return 100;
  if (h1c === 1 && h2c === 0) return 60;
  if (h1c === 0) return 0;
  if (h1c > 1) return 40;
  return 0;
}

function calcImageScore(total, noAlt) {
  if (total === 0) return 80;
  const pct = (total - noAlt) / total * 100;
  if (pct >= 90) return 100;
  if (pct >= 50) return 60;
  if (pct >= 25) return 30;
  return 10;
}

function calcLinkScore(internal, external) {
  if (internal === 0 && external === 0) return 0;
  if (internal >= 5 && external >= 1) return 100;
  if (internal >= 5) return 80;
  if (internal > 0) return 50;
  return 20;
}

function calcSchemaScore(count, schemas) {
  if (count === 0) return 0;
  const types = schemas.map(s => s['@type']).filter(Boolean);
  const unique = new Set(types.flat());
  if (unique.size >= 3) return 100;
  if (unique.size >= 2) return 70;
  if (unique.size === 1) return 40;
  return 20;
}

function calcMobileScore(viewport) {
  if (viewport && viewport.includes('width=device-width')) return 100;
  if (viewport) return 50;
  return 0;
}

function calcPerfScore(loadMs, htmlSize) {
  const kb = htmlSize / 1024;
  let score = 100;
  if (loadMs > 5000) score -= 40;
  else if (loadMs > 2000) score -= 20;
  else if (loadMs > 1000) score -= 10;
  if (kb > 500) score -= 30;
  else if (kb > 200) score -= 15;
  return Math.max(0, score);
}

app.listen(PORT, () => console.log(`SEO Dashboard running on port ${PORT}`));
