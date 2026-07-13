export type MarketPack = {
  code: 'il' | 'us' | 'global'
  label: string
  semrushDatabase: string
  serankingRegion: 'il' | 'us'
  dfsLocationCode: number
  dfsLanguageName: string
  dfsLanguageCode: string
  serpLanguage: string
  country: string
}

const MARKETS: Record<string, MarketPack> = {
  il: {
    code: 'il',
    label: 'Israel',
    semrushDatabase: 'il',
    serankingRegion: 'il',
    dfsLocationCode: 2376, // Israel — DataForSEO
    dfsLanguageName: 'Hebrew',
    dfsLanguageCode: 'he',
    serpLanguage: 'he',
    country: 'IL',
  },
  us: {
    code: 'us',
    label: 'United States',
    semrushDatabase: 'us',
    serankingRegion: 'us',
    dfsLocationCode: 2840,
    dfsLanguageName: 'English',
    dfsLanguageCode: 'en',
    serpLanguage: 'en',
    country: 'US',
  },
  global: {
    code: 'global',
    label: 'Global / US default',
    semrushDatabase: 'us',
    serankingRegion: 'us',
    dfsLocationCode: 2840,
    dfsLanguageName: 'English',
    dfsLanguageCode: 'en',
    serpLanguage: 'en',
    country: 'US',
  },
}

/** Map free-text market labels + domain TLDs → concrete provider params. Default IL for .co.il */
export function resolveMarket(input?: {
  market?: string | null
  domain?: string | null
  override?: string | null
}): MarketPack {
  const override = String(input?.override || '').trim().toLowerCase()
  if (override === 'il' || override === 'israel') return MARKETS.il
  if (override === 'us' || override === 'usa' || override === 'united states') return MARKETS.us
  if (override === 'global' || override === 'ww') return MARKETS.global

  const market = String(input?.market || '').trim().toLowerCase()
  const domain = String(input?.domain || '').trim().toLowerCase().replace(/^www\./, '')

  if (market.includes('israel') || market === 'il' || market.includes('עברית') || market.includes('🇮🇱')) {
    return MARKETS.il
  }
  if (market.includes('united states') || market === 'us' || market.includes('usa') || market.includes('english / us')) {
    return MARKETS.us
  }

  // Domain-based default — Israeli agency OS
  if (domain.endsWith('.co.il') || domain.endsWith('.org.il') || domain.endsWith('.net.il') || domain.endsWith('.ac.il') || domain.endsWith('.gov.il')) {
    return MARKETS.il
  }

  // Explicit global mixed labels still default IL-first when TLD unknown? Prefer us for global brands.
  if (market.includes('global') || market.includes('world')) return MARKETS.global
  if (!market || market === 'unassigned market') {
    // Agency default: IL when unspecified
    return MARKETS.il
  }

  return MARKETS.global
}

export function serankingResearchUrl(pack: MarketPack, resource: 'overview' | 'keywords' | 'competitors'): string {
  return `https://api4.seranking.com/research/${pack.serankingRegion}/${resource}/`
}
