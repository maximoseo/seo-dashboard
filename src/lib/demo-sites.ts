import type { Site, SiteMetrics } from '@/types';

export const demoSites: Site[] = [
  {
    id: 'maximo-seo',
    name: 'MaximoSEO',
    domain: 'maximo-seo.ai',
    addedAt: '2024-11-15',
  },
  {
    id: 'cleanair-houston',
    name: 'Clean Air Houston Pro',
    domain: 'cleanairhoustonpro.net',
    addedAt: '2024-12-01',
  },
  {
    id: 'webs-co-il',
    name: 'Webs.co.il',
    domain: 'webs.co.il',
    addedAt: '2025-01-10',
  },
];

export const demoMetrics: Record<string, SiteMetrics> = {
  'maximo-seo': {
    siteId: 'maximo-seo',
    domainAuthority: 34,
    organicTraffic: 4820,
    totalKeywords: 1247,
    totalBacklinks: 892,
    pageSpeed: 94,
    indexedPages: 187,
    uptimePercent: 99.97,
    lastCrawled: '2026-06-19T08:30:00Z',
  },
  'cleanair-houston': {
    siteId: 'cleanair-houston',
    domainAuthority: 22,
    organicTraffic: 1560,
    totalKeywords: 423,
    totalBacklinks: 234,
    pageSpeed: 87,
    indexedPages: 45,
    uptimePercent: 99.85,
    lastCrawled: '2026-06-18T14:20:00Z',
  },
  'webs-co-il': {
    siteId: 'webs-co-il',
    domainAuthority: 41,
    organicTraffic: 8230,
    totalKeywords: 2870,
    totalBacklinks: 1540,
    pageSpeed: 91,
    indexedPages: 312,
    uptimePercent: 99.99,
    lastCrawled: '2026-06-19T06:15:00Z',
  },
};
