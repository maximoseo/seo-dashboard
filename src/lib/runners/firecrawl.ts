export async function runFirecrawl(domain: string, apiKey: string) {
  const url = `https://${domain}`;

  // Scrape the main page
  const scrapeRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['markdown', 'links'],
    }),
  });

  if (!scrapeRes.ok) {
    const err = await scrapeRes.text();
    throw new Error(`Firecrawl scrape error: ${scrapeRes.status} ${err}`);
  }

  const scrapeData = await scrapeRes.json();
  const metadata = scrapeData?.data?.metadata ?? {};
  const links = scrapeData?.data?.links ?? [];
  const markdown = scrapeData?.data?.markdown ?? '';

  // Map site
  const mapRes = await fetch('https://api.firecrawl.dev/v1/map', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, limit: 50 }),
  });

  let siteMap: string[] = [];
  if (mapRes.ok) {
    const mapData = await mapRes.json();
    siteMap = (mapData?.links ?? []).slice(0, 50);
  }

  return {
    tool: 'firecrawl',
    domain,
    metadata: {
      title: metadata.title,
      description: metadata.description,
      language: metadata.language,
      ogImage: metadata.ogImage,
      statusCode: metadata.statusCode,
    },
    contentLength: markdown.length,
    internalLinks: links.filter((l: string) => l.includes(domain)).length,
    externalLinks: links.filter((l: string) => !l.includes(domain)).length,
    totalLinks: links.length,
    siteMapUrls: siteMap.length,
    siteMapSample: siteMap.slice(0, 10),
  };
}
