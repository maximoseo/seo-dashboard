/**
 * SEO Dashboard — Data Normalization Layer
 * 
 * This module provides normalization functions for each SEO provider.
 * UI components consume ONLY the canonical models returned here,
 * never raw provider payloads. This eliminates the "space in key → 0"
 * class of bugs by providing a single source of truth.
 */

// ─── Helper: safe number coercion ────────────────────────────────────────────
// Returns null for "no data" (not 0), so the UI can distinguish
// "missing" from "a real zero".
export const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(String(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// ─── Helper: pick first non-null value from a list of keys ───────────────────
const pick = (o: Record<string, unknown>, ...keys: string[]): number | null => {
  for (const k of keys) {
    if (o?.[k] != null && o?.[k] !== '') {
      const n = num(o[k]);
      if (n !== null) return n;
    }
  }
  return null;
};

// ─── Helper: pick string value ───────────────────────────────────────────────
const pickStr = (o: Record<string, unknown>, ...keys: string[]): string | null => {
  for (const k of keys) {
    if (o?.[k] != null && String(o[k]).trim() !== '') {
      return String(o[k]).trim();
    }
  }
  return null;
};

// ═══════════════════════════════════════════════════════════════════════════════
// CANONICAL DOMAIN MODELS
// ═══════════════════════════════════════════════════════════════════════════════

export interface NormalizedSemrush {
  organicKeywords: number | null;
  organicTraffic: number | null;
  adwordsKeywords: number | null;
  adwordsTraffic: number | null;
  backlinks: number | null;
  domainRank: number | null;
  raw: Record<string, unknown>;
}

export interface NormalizedAhrefs {
  domainRating: number | null;
  organicTraffic: number | null;
  organicKeywords: number | null;
  refDomains: number | null;
  backlinks: number | null;
  raw: Record<string, unknown>;
}

export interface NormalizedKeyword {
  keyword: string;
  position: number | null;
  volume: number | null;
  difficulty: number | null;
  trend: 'up' | 'down' | 'stable' | null;
  url: string | null;
  serpFeatures: string[];
  source: string;
  raw?: Record<string, unknown>;
}

export interface NormalizedBacklink {
  sourceUrl: string;
  targetUrl: string;
  domainRating: number | null;
  anchorText: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  type: 'dofollow' | 'nofollow' | null;
  source: string;
  raw?: Record<string, unknown>;
}

export interface NormalizedDomainOverview {
  domain: string;
  organicTraffic: number | null;
  organicKeywords: number | null;
  backlinks: number | null;
  refDomains: number | null;
  domainRating: number | null;
  sources: string[];
  lastFetched: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NORMALIZATION FUNCTIONS — one per provider
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Normalize SEMrush domain_ranks response.
 * SEMrush returns CSV-style data with semicolon separators.
 * Field names vary: "Organic Keywords", "organic_keywords", "Or", etc.
 */
export function normalizeSemrush(raw: Record<string, unknown> | null | undefined): NormalizedSemrush {
  if (!raw || typeof raw !== 'object') {
    return {
      organicKeywords: null,
      organicTraffic: null,
      adwordsKeywords: null,
      adwordsTraffic: null,
      backlinks: null,
      domainRank: null,
      raw: {},
    };
  }

  return {
    organicKeywords: pick(raw, 'Organic Keywords', 'organic_keywords', 'Or'),
    organicTraffic: pick(raw, 'Organic Traffic', 'organic_traffic', 'Ot'),
    adwordsKeywords: pick(raw, 'Adwords Keywords', 'adwords_keywords', 'Ad'),
    adwordsTraffic: pick(raw, 'Adwords Traffic', 'adwords_traffic', 'At'),
    backlinks: pick(raw, 'Backlinks', 'backlinks'),
    domainRank: pick(raw, 'Rank', 'rank', 'Rk', 'Domain Rank'),
    raw,
  };
}

/**
 * Normalize Ahrefs metrics response.
 * Ahrefs v3 API returns nested objects under "metrics" key.
 */
export function normalizeAhrefs(raw: Record<string, unknown> | null | undefined): NormalizedAhrefs {
  if (!raw) {
    return {
      domainRating: null,
      organicTraffic: null,
      organicKeywords: null,
      refDomains: null,
      backlinks: null,
      raw: {},
    };
  }

  // Ahrefs v3 returns { domain_rating: { rating: 45 } } or flat fields
  const dr = raw.domain_rating as Record<string, unknown> | undefined;
  const metrics = raw.metrics as Record<string, unknown> | undefined;

  return {
    domainRating: dr ? num(dr.rating) : pick(raw, 'domain_rating', 'dr'),
    organicTraffic: metrics ? pick(metrics, 'org_traffic', 'organic_traffic') : pick(raw, 'org_traffic'),
    organicKeywords: metrics ? pick(metrics, 'org_keywords', 'organic_keywords') : pick(raw, 'org_keywords'),
    refDomains: metrics ? pick(metrics, 'refdomains', 'ref_domains') : pick(raw, 'refdomains'),
    backlinks: metrics ? pick(metrics, 'backlinks') : pick(raw, 'backlinks'),
    raw,
  };
}

/**
 * Normalize DataForSEO ranked keywords response.
 */
export function normalizeDataForSEOKeywords(raw: Record<string, unknown> | null | undefined): NormalizedKeyword[] {
  if (!raw) return [];

  const tasks = raw.tasks as unknown[];
  if (!Array.isArray(tasks)) return [];

  const results: NormalizedKeyword[] = [];

  for (const task of tasks) {
    const taskData = (task as Record<string, unknown>);
    const taskResults = taskData?.result as unknown[];
    if (!Array.isArray(taskResults)) continue;

    for (const taskResult of taskResults) {
      const r = taskResult as Record<string, unknown>;
      const items = r?.items as unknown[];
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        const kw = item as Record<string, unknown>;
        results.push({
          keyword: pickStr(kw, 'keyword', 'key') || '',
          position: pick(kw, 'rank', 'position', 'pos'),
          volume: pick(kw, 'search_volume', 'volume', 'monthly_search_volume'),
          difficulty: pick(kw, 'competition', 'difficulty', 'kd'),
          trend: null, // DataForSEO doesn't provide trend directly
          url: pickStr(kw, 'url', 'landing_page', 'full_url'),
          serpFeatures: [],
          source: 'dataforseo',
          raw: kw,
        });
      }
    }
  }

  return results;
}

/**
 * Normalize Ahrefs organic keywords response.
 */
export function normalizeAhrefsKeywords(raw: Record<string, unknown> | null | undefined): NormalizedKeyword[] {
  if (!raw) return [];

  const keywords = raw.keywords as unknown[];
  if (!Array.isArray(keywords)) return [];

  return keywords.map((item) => {
    const kw = item as Record<string, unknown>;
    return {
      keyword: pickStr(kw, 'keyword') || '',
      position: pick(kw, 'position', 'rank'),
      volume: pick(kw, 'volume', 'search_volume'),
      difficulty: pick(kw, 'difficulty', 'kd', 'keyword_difficulty'),
      trend: (pick(kw, 'position_trend') ?? 0) > 0 ? 'up' as const : (pick(kw, 'position_trend') ?? 0) < 0 ? 'down' as const : 'stable' as const,
      url: pickStr(kw, 'url', 'landing_page'),
      serpFeatures: [],
      source: 'ahrefs',
      raw: kw,
    };
  });
}

/**
 * Normalize SEMrush domain keywords (CSV-style).
 */
export function normalizeSemrushKeywords(rows: Record<string, string>[] | null | undefined): NormalizedKeyword[] {
  if (!rows || !Array.isArray(rows)) return [];

  return rows.map((row) => ({
    keyword: pickStr(row, 'Keyword', 'Ph') || '',
    position: pick(row, 'Position', 'Po'),
    volume: pick(row, 'Search Volume', 'Nq'),
    difficulty: pick(row, 'Keyword Difficulty', 'Kd'),
    trend: null,
    url: pickStr(row, 'URL', 'Ur'),
    serpFeatures: [],
    source: 'semrush',
    raw: row,
  }));
}

/**
 * Create a unified domain overview from multiple normalized sources.
 * This is the single object BOTH the stat strip AND the metric cards
 * should consume — eliminating contradictions.
 */
export function normalizeOverview(
  semrush: NormalizedSemrush | null,
  ahrefs: NormalizedAhrefs | null,
  dataforseo: Record<string, unknown> | null,
): NormalizedDomainOverview {
  // Priority: GSC (not available yet) > Ahrefs > SEMrush > DataForSEO
  // For now, use Ahrefs as primary for traffic/keywords, SEMrush as cross-check
  
  const sources: string[] = [];
  if (semrush) sources.push('SEMrush');
  if (ahrefs) sources.push('Ahrefs');
  if (dataforseo) sources.push('DataForSEO');

  return {
    domain: '',
    organicTraffic: ahrefs?.organicTraffic ?? semrush?.organicTraffic ?? null,
    organicKeywords: ahrefs?.organicKeywords ?? semrush?.organicKeywords ?? null,
    backlinks: ahrefs?.backlinks ?? (dataforseo ? num(dataforseo.backlinks) : null),
    refDomains: ahrefs?.refDomains ?? null,
    domainRating: ahrefs?.domainRating ?? null,
    sources,
    lastFetched: new Date().toISOString(),
  };
}

/**
 * Format a number for display: 45200 → "45.2K"
 */
export function formatMetric(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/**
 * Format a percentage: 0.523 → "52.3%"
 */
export function formatPercent(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

/**
 * Format a position as integer: 3.7 → "4"
 */
export function formatPosition(n: number | null | undefined): string {
  if (n == null) return '—';
  return String(Math.round(n));
}
