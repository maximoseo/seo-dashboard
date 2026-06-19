export async function runGtmetrix(domain: string, apiKey: string) {
  const credentials = Buffer.from(`${apiKey}:`).toString('base64');
  const headers = {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json',
  };

  // Start a test
  const startRes = await fetch('https://gtmetrix.com/api/2.0/tests', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      url: `https://${domain}`,
      location: '1',
      browser: '3',
    }),
  });

  if (!startRes.ok) {
    const err = await startRes.text();
    throw new Error(`GTmetrix start error: ${startRes.status} ${err}`);
  }

  const startData = await startRes.json();
  const testId = startData?.data?.id;

  if (!testId) {
    throw new Error('GTmetrix: no test ID returned');
  }

  // Poll for results (max 60s)
  let attempts = 0;
  const maxAttempts = 12;
  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    attempts++;

    const pollRes = await fetch(`https://gtmetrix.com/api/2.0/tests/${testId}`, {
      headers: { 'Authorization': `Basic ${credentials}` },
    });

    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    const state = pollData?.data?.attributes?.state;

    if (state === 'completed') {
      const attrs = pollData.data.attributes;
      return {
        tool: 'gtmetrix',
        domain,
        testId,
        grade: attrs.gtmetrix_grade,
        performanceScore: attrs.performance_score,
        structureScore: attrs.structure_score,
        lcp: attrs.largest_contentful_paint,
        tbt: attrs.total_blocking_time,
        cls: attrs.cumulative_layout_shift,
        fullyLoaded: attrs.fully_loaded_time,
        pageSize: attrs.page_bytes,
        requests: attrs.page_elements,
        reportUrl: attrs.report_url,
      };
    }

    if (state === 'error') {
      throw new Error(`GTmetrix test failed: ${pollData?.data?.attributes?.error ?? 'unknown'}`);
    }
  }

  return {
    tool: 'gtmetrix',
    domain,
    testId,
    status: 'timeout',
    message: 'Test is still running. Check back in a minute.',
  };
}
