/** Human-friendly API error extraction for Zod-validated backend responses. */

export type ApiErrorBody = {
  error?: string
  message?: string
  messages?: string[]
  details?: Array<{ path?: Array<string | number>; message?: string; code?: string }>
}

export async function readApiError(res: Response, fallback = 'Request failed'): Promise<string> {
  let body: ApiErrorBody = {}
  try {
    body = (await res.json()) as ApiErrorBody
  } catch {
    // non-JSON
  }
  if (body.messages?.length) return body.messages.join(' · ')
  if (body.error) return body.error
  if (body.message) return body.message
  if (Array.isArray(body.details) && body.details.length) {
    return body.details
      .map((d) => {
        const path = d.path?.length ? `${d.path.join('.')}: ` : ''
        return `${path}${d.message || 'invalid'}`
      })
      .join(' · ')
  }
  return `${fallback} (${res.status})`
}
