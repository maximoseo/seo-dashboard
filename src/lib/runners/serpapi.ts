export async function runSerpApi(domain: string, apiKey: string) {
  const query = `site:${domain}`;
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('engine', 'google');
  url.searchParams.set('num', '10');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`SerpAPI error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  const organicResults = data.organic_results ?? [];
  const totalResults = data.search_information?.total_results ?? 0;
  const timeTaken = data.search_information?.time_taken_displayed ?? 0;

  return {
    tool: 'serpapi',
    query,
    totalResults,
    timeTaken,
    topResults: organicResults.slice(0, 5).map((r: Record<string, unknown>) => ({
      position: r.position,
      title: r.title,
      link: r.link,
      snippet: r.snippet,
    })),
    relatedSearches: (data.related_searches ?? []).slice(0, 5).map((r: Record<string, string>) => r.query),
    knowledgeGraph: data.knowledge_graph ? {
      title: data.knowledge_graph.title,
      type: data.knowledge_graph.type,
      description: data.knowledge_graph.description,
    } : null,
  };
}
