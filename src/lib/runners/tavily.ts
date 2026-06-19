export async function runTavily(domain: string, apiKey: string) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: `site:${domain} SEO analysis`,
      search_depth: 'advanced',
      include_domains: [domain],
      max_results: 10,
    }),
  });

  if (!res.ok) {
    throw new Error(`Tavily error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  return {
    tool: 'tavily',
    domain,
    results: (data.results ?? []).slice(0, 10).map((r: Record<string, unknown>) => ({
      title: r.title,
      url: r.url,
      content: typeof r.content === 'string' ? r.content.slice(0, 300) : '',
      score: r.score,
    })),
    answer: data.answer ?? null,
  };
}
