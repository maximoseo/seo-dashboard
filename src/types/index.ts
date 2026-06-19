export interface Site {
  id: string;
  name: string;
  domain: string;
  favicon?: string;
  addedAt: string;
}

export type ToolStatus = 'connected' | 'available' | 'error' | 'loading';

export interface SeoTool {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  icon: string;
  status: ToolStatus;
  envVar: string;
  docsUrl?: string;
  capabilities: string[];
}

export type ToolCategory =
  | 'serp'
  | 'keywords'
  | 'backlinks'
  | 'technical'
  | 'content'
  | 'local'
  | 'indexing'
  | 'monitoring'
  | 'scraping'
  | 'social'
  | 'analytics';

export interface SiteMetrics {
  siteId: string;
  domainAuthority?: number;
  organicTraffic?: number;
  totalKeywords?: number;
  totalBacklinks?: number;
  pageSpeed?: number;
  indexedPages?: number;
  uptimePercent?: number;
  lastCrawled?: string;
}

export interface ToolResult {
  toolId: string;
  siteId: string;
  data: Record<string, unknown>;
  fetchedAt: string;
  error?: string;
}
