export type ProviderErrorClass = 'not_configured' | 'auth' | 'quota' | 'rate_limited' | 'network' | 'schema' | 'unknown'

export type ProviderResult<T> = {
  ok: boolean
  provider: string
  data?: T
  errorClass?: ProviderErrorClass
  message?: string
  latencyMs: number
  fetchedAt: string
  costUnits?: number
}

export async function withProviderResult<T>(
  provider: string,
  fetcher: () => Promise<T>,
  costUnits = 1,
  timeoutMs = 10_000,
): Promise<ProviderResult<T>> {
  const started = Date.now()
  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`Provider ${provider} network timeout after ${timeoutMs}ms`)), timeoutMs)
    })
    const data = await Promise.race([fetcher(), timeoutPromise])
    return { ok: true, provider, data, latencyMs: Date.now() - started, fetchedAt: new Date().toISOString(), costUnits }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown provider error'
    const errorClass: ProviderErrorClass = /quota/i.test(message)
      ? 'quota'
      : /rate|429/i.test(message)
        ? 'rate_limited'
        : /auth|401|403/i.test(message)
          ? 'auth'
          : /schema|parse/i.test(message)
            ? 'schema'
            : /network|timeout|ECONN/i.test(message)
              ? 'network'
              : 'unknown'
    return { ok: false, provider, errorClass, message, latencyMs: Date.now() - started, fetchedAt: new Date().toISOString(), costUnits }
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
