/**
 * Static Why / Fix / Validate guidance for common site-audit issue titles.
 * Keys are normalized issue titles (lowercase, stripped). Unknown keys fall
 * back to a generic template — never invent metrics.
 */
export type IssueGuidance = {
  why: string
  fix: string
  validate: string
}

const byTitle: Record<string, IssueGuidance> = {
  'missing title tags': {
    why: 'Title tags are a primary ranking and SERP signal. Empty titles waste crawl budget and CTR.',
    fix: 'Give each indexable URL a unique title (roughly 50–60 characters) that matches the topical H1.',
    validate: 'Re-run site audit or recheck the URL; confirm title appears in the Pages inventory.',
  },
  'missing h1 tags': {
    why: 'H1 anchors topical relevance for search and accessibility.',
    fix: 'Ensure each indexable page has exactly one H1 that describes the page topic.',
    validate: 'Re-run audit and open the page drawer / crawled page row for that URL.',
  },
  '4xx client errors': {
    why: '4xx responses waste crawl budget and break internal/external journeys.',
    fix: 'Restore the resource, 301 to a valid equivalent, or remove links pointing to the dead URL.',
    validate: 'Hit the URL with a 200/301 response and re-run the technical audit.',
  },
  '5xx server errors': {
    why: 'Server errors block indexing and tank trust for that URL cluster.',
    fix: 'Investigate hosting/app logs, fix the failing handler, and retest under production traffic.',
    validate: 'Confirm stable 2xx for the URLs that previously returned 5xx, then re-audit.',
  },
  'broken pages': {
    why: 'Broken pages are dead ends for users and bots.',
    fix: 'Fix the resource, redirect, or prune inbound links.',
    validate: 'Re-crawl with DataForSEO / re-run Site Audit and check Errors count.',
  },
  'thin content': {
    why: 'Thin pages rarely rank and can dilute topical authority.',
    fix: 'Expand helpful content, merge thin templates, or noindex low-value utility pages.',
    validate: 'Word count and on-page score should improve on re-audit for those URLs.',
  },
  'duplicate title tags': {
    why: 'Duplicate titles force engines to pick one SERP snippet for multiple URLs.',
    fix: 'Rewrite titles so each indexable template has a unique, intent-matched title.',
    validate: 'Filter Issues for titles after a fresh crawl — count should drop.',
  },
  'missing meta descriptions': {
    why: 'Missing descriptions hand SERP snippet control to the search engine.',
    fix: 'Add unique meta descriptions (roughly 140–160 characters) for priority URLs.',
    validate: 'Re-audit notices for meta description checks.',
  },
  'noindex pages': {
    why: 'noindex intentionally removes pages from the index — verify that is intended.',
    fix: 'Remove noindex from pages that should rank; keep it on pure utility/filter URLs.',
    validate: 'Check robots/meta on the live URL and confirm issue severity after re-audit.',
  },
  'https mixed content': {
    why: 'Mixed HTTP assets on HTTPS pages can break locks and trigger browser warnings.',
    fix: 'Serve all scripts, images, and CSS over HTTPS (or protocol-relative).',
    validate: 'Load the page over HTTPS with browser console clean, then re-audit.',
  },
}

const generic: IssueGuidance = {
  why: 'This technical issue can hurt crawl efficiency, relevance, or user trust for the affected URLs.',
  fix: 'Open a sample URL, fix the underlying template or status response, then re-run Site Audit.',
  validate: 'Errors/Warnings should drop on a fresh crawl after the deploy lands.',
}

export function guidanceForIssue(title: string, category?: string): IssueGuidance {
  const key = (title || '').trim().toLowerCase()
  if (key && byTitle[key]) return byTitle[key]
  // soft match
  for (const [k, v] of Object.entries(byTitle)) {
    if (key.includes(k) || k.includes(key)) return v
  }
  if ((category || '').toLowerCase() === 'http') {
    return {
      why: 'HTTP status issues block or stall discovery.',
      fix: 'Restore a valid response or clean inbound links.',
      validate: 'Status codes must leave the error class after re-crawl.',
    }
  }
  return generic
}
