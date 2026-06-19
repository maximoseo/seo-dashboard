import { NextRequest, NextResponse } from 'next/server';
import { isToolConfigured, getToolKey } from '@/lib/tool-keys';
import { runSerpApi } from '@/lib/runners/serpapi';
import { runDataForSeo } from '@/lib/runners/dataforseo';
import { runGtmetrix } from '@/lib/runners/gtmetrix';
import { runFirecrawl } from '@/lib/runners/firecrawl';
import { runBraveSearch } from '@/lib/runners/brave-search';
import { runTavily } from '@/lib/runners/tavily';
import { runGoogleMaps } from '@/lib/runners/google-maps';

type ToolRunner = (domain: string, ...args: string[]) => Promise<Record<string, unknown>>;

const runners: Record<string, ToolRunner> = {
  serpapi: (domain) => {
    const key = getToolKey('serpapi');
    if (!key) throw new Error('SERPAPI_KEY not configured');
    return runSerpApi(domain, key);
  },
  dataforseo: (domain) => {
    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;
    if (!login || !password) throw new Error('DataForSEO credentials not configured');
    return runDataForSeo(domain, login, password);
  },
  gtmetrix: (domain) => {
    const key = getToolKey('gtmetrix');
    if (!key) throw new Error('GTMETRIX_API_KEY not configured');
    return runGtmetrix(domain, key);
  },
  firecrawl: (domain) => {
    const key = getToolKey('firecrawl');
    if (!key) throw new Error('FIRECRAWL_API_KEY not configured');
    return runFirecrawl(domain, key);
  },
  'brave-search': (domain) => {
    const key = getToolKey('brave-search');
    if (!key) throw new Error('BRAVE_SEARCH_API_KEY not configured');
    return runBraveSearch(domain, key);
  },
  tavily: (domain) => {
    const key = getToolKey('tavily');
    if (!key) throw new Error('TAVILY_API_KEY not configured');
    return runTavily(domain, key);
  },
  'google-maps': (domain) => {
    const key = getToolKey('google-maps');
    if (!key) throw new Error('GOOGLE_MAPS_API_KEY not configured');
    return runGoogleMaps(domain, key);
  },
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { domain, toolId } = body as { domain?: string; toolId?: string };

  if (!domain || !toolId) {
    return NextResponse.json(
      { error: 'Missing domain or toolId' },
      { status: 400 }
    );
  }

  if (!isToolConfigured(toolId)) {
    return NextResponse.json(
      { error: `Tool ${toolId} is not configured. Set the required environment variable.`, configured: false },
      { status: 422 }
    );
  }

  const runner = runners[toolId];
  if (!runner) {
    return NextResponse.json(
      { error: `No runner implemented for tool: ${toolId}. Available: ${Object.keys(runners).join(', ')}`, implemented: false },
      { status: 501 }
    );
  }

  try {
    const result = await runner(domain);
    return NextResponse.json({
      success: true,
      domain,
      toolId,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: message, domain, toolId },
      { status: 500 }
    );
  }
}
