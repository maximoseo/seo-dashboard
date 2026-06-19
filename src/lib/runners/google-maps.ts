export async function runGoogleMaps(domain: string, apiKey: string) {
  // Search for the business on Google Places
  const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  searchUrl.searchParams.set('query', domain);
  searchUrl.searchParams.set('key', apiKey);

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    throw new Error(`Google Maps error: ${searchRes.status}`);
  }

  const searchData = await searchRes.json();
  const results = searchData.results ?? [];

  if (results.length === 0) {
    return {
      tool: 'google-maps',
      domain,
      found: false,
      message: 'No Google Maps results found for this domain',
    };
  }

  const top = results[0];
  const placeId = top.place_id;

  // Get place details
  const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  detailsUrl.searchParams.set('place_id', placeId);
  detailsUrl.searchParams.set('key', apiKey);
  detailsUrl.searchParams.set('fields', 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,reviews,opening_hours,types,url');

  const detailsRes = await fetch(detailsUrl.toString());
  let details = null;

  if (detailsRes.ok) {
    const detailsData = await detailsRes.json();
    const r = detailsData.result ?? {};
    details = {
      name: r.name,
      address: r.formatted_address,
      phone: r.formatted_phone_number,
      website: r.website,
      rating: r.rating,
      totalReviews: r.user_ratings_total,
      mapsUrl: r.url,
      types: r.types,
      isOpen: r.opening_hours?.open_now,
      recentReviews: (r.reviews ?? []).slice(0, 3).map((rev: Record<string, unknown>) => ({
        rating: rev.rating,
        text: typeof rev.text === 'string' ? rev.text.slice(0, 200) : '',
        time: rev.relative_time_description,
      })),
    };
  }

  return {
    tool: 'google-maps',
    domain,
    found: true,
    placesResults: results.length,
    topResult: {
      name: top.name,
      address: top.formatted_address,
      rating: top.rating,
      totalReviews: top.user_ratings_total,
      types: top.types,
    },
    details,
  };
}
