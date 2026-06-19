export async function runDataForSeo(domain: string, login: string, password: string) {
  const credentials = Buffer.from(`${login}:${password}`).toString('base64');
  const headers = {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json',
  };

  // Domain overview
  const overviewRes = await fetch('https://api.dataforseo.com/v3/domain_analytics/technologies/domain_technologies/live', {
    method: 'POST',
    headers,
    body: JSON.stringify([{ target: domain, limit: 1 }]),
  });

  let overview = null;
  if (overviewRes.ok) {
    const overviewData = await overviewRes.json();
    const result = overviewData?.tasks?.[0]?.result?.[0];
    overview = result ?? null;
  }

  // SERP overview
  const serpRes = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
    method: 'POST',
    headers,
    body: JSON.stringify([{ keyword: domain, location_code: 2840, language_code: 'en' }]),
  });

  let serpData = null;
  if (serpRes.ok) {
    const serpJson = await serpRes.json();
    const result = serpJson?.tasks?.[0]?.result?.[0];
    serpData = result ? {
      totalCount: result.se_results_count,
      items: (result.items ?? []).slice(0, 5).map((item: Record<string, unknown>) => ({
        type: item.type,
        position: item.rank_absolute,
        title: item.title,
        url: item.url,
        description: item.description,
      })),
    } : null;
  }

  return {
    tool: 'dataforseo',
    domain,
    overview,
    serpResults: serpData,
  };
}
