export async function runBraveSearch(domain: string, apiKey: string) {
  const query = `site:${domain}`;
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', '10');

  const res = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  });

  if (!res.ok) {
    throw new Error(`Brave Search error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const webResults = data.web?.results ?? [];

  return {
    tool: 'brave-search',
    domain,
    query,
    totalEstimated: data.web?.total_count ?? 0,
    results: webResults.slice(0, 10).map((r: Record<string, unknown>) => ({
      title: r.title,
      url: r.url,
      description: r.description,
      age: r.age,
    })),
    infobox: data.infobox ? {
      title: data.infobox.title,
      description: data.infobox.description,
    } : null,
  };
}
