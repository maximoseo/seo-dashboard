/** Maps tool IDs to the environment variable that holds their API key/credentials */
export const toolEnvMap: Record<string, string | string[]> = {
  serpapi: 'SERPAPI_KEY',
  dataforseo: ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'],
  semrush: 'SEMRUSH_API_KEY',
  seranking: 'SERANKING_API_KEY',
  serpstat: 'SERPSTAT_API_KEY',
  ahrefs: 'AHREFS_API_KEY',
  'keywords-everywhere': 'KEYWORDS_EVERYWHERE_API_KEY',
  mangools: 'MANGOOLS_API_KEY',
  topicalmap: 'TOPICALMAP_API_KEY',
  answerthepublic: 'ANSWERTHEPUBLIC_API_KEY',
  frase: 'FRASE_API_KEY',
  morningscore: 'MORNINGSCORE_API_KEY',
  gtmetrix: 'GTMETRIX_API_KEY',
  browserless: 'BROWSERLESS_API_KEY',
  betteruptime: 'BETTERUPTIME_API_KEY',
  'omega-indexer': 'OMEGA_INDEXER_API_KEY',
  'google-maps': 'GOOGLE_MAPS_API_KEY',
  'google-places': 'GOOGLE_PLACES_API_KEY',
  callrail: 'CALLRAIL_API_KEY',
  firecrawl: 'FIRECRAWL_API_KEY',
  apify: 'APIFY_API_KEY',
  microlink: 'MICROLINK_API_KEY',
  publer: 'PUBLER_API_KEY',
  metricool: 'METRICOOL_API_KEY',
  'brave-search': 'BRAVE_SEARCH_API_KEY',
  tavily: 'TAVILY_API_KEY',
  exa: 'EXA_API_KEY',
  macroscope: 'MACROSCOPE_API_KEY',
  sentry: 'SENTRY_AUTH_TOKEN',
  supadata: 'SUPADATA_API_KEY',
  switchy: 'SWITCHY_API_KEY',
};

export function isToolConfigured(toolId: string): boolean {
  const envVars = toolEnvMap[toolId];
  if (!envVars) return false;
  if (Array.isArray(envVars)) {
    return envVars.every((v) => Boolean(process.env[v]));
  }
  return Boolean(process.env[envVars]);
}

export function getToolKey(toolId: string): string | null {
  const envVars = toolEnvMap[toolId];
  if (!envVars || Array.isArray(envVars)) return null;
  return process.env[envVars] ?? null;
}

export function getToolCredentials(toolId: string): Record<string, string> | null {
  const envVars = toolEnvMap[toolId];
  if (!envVars) return null;
  if (Array.isArray(envVars)) {
    const creds: Record<string, string> = {};
    for (const v of envVars) {
      const val = process.env[v];
      if (!val) return null;
      creds[v] = val;
    }
    return creds;
  }
  const val = process.env[envVars];
  if (!val) return null;
  return { [envVars]: val };
}
