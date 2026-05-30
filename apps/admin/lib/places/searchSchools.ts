const PLACES_URL = 'https://places.googleapis.com/v1/places:autocomplete'

export interface PlacesSchoolResult {
  name: string
  subtitle: string
  source: 'places'
}

interface SearchOpts {
  apiKey: string
  region?: string  // ISO 3166-1 alpha-2, default 'ph'
}

/**
 * Call Google Places `:autocomplete` server-side. Returns the same shape that
 * mobile's useSchoolSearch already consumes, so the only mobile change is the
 * URL it fetches.
 *
 * Throws on HTTP non-OK so the proxy route can return a 502 + log the failure.
 */
export async function searchSchools(
  query: string,
  opts: SearchOpts,
): Promise<PlacesSchoolResult[]> {
  const res = await fetch(PLACES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': opts.apiKey,
      'X-Goog-FieldMask': 'suggestions.placePrediction.structuredFormat',
    },
    body: JSON.stringify({
      input: query,
      includedPrimaryTypes: ['school', 'secondary_school', 'university'],
      includedRegionCodes: [opts.region ?? 'ph'],
    }),
  })

  if (!res.ok) {
    throw new Error(`Google Places HTTP ${res.status}`)
  }

  const json = await res.json() as {
    suggestions?: Array<{
      placePrediction: {
        structuredFormat: {
          mainText: { text: string }
          secondaryText: { text: string }
        }
      }
    }>
  }

  return (json.suggestions ?? []).map(s => ({
    name: s.placePrediction.structuredFormat.mainText.text,
    subtitle: s.placePrediction.structuredFormat.secondaryText.text,
    source: 'places' as const,
  }))
}
