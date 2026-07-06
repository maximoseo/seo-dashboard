export const AUTH_USER_KEY = 'maximo:dashboard_auth_user'

export interface StoredAuthUser {
  email: string
  provider?: string
}

function isSameOriginApiRequest(input: RequestInfo | URL): boolean {
  if (typeof window === 'undefined') return false
  try {
    const url = typeof input === 'string'
      ? new URL(input, window.location.origin)
      : input instanceof URL
        ? input
        : new URL(input.url, window.location.origin)
    return url.origin === window.location.origin && url.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

export function setStoredAuth(user: StoredAuthUser): void {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

export function clearStoredAuth(): void {
  localStorage.removeItem(AUTH_USER_KEY)
}

export function getStoredAuthUser(): StoredAuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY)
    return raw ? JSON.parse(raw) as StoredAuthUser : null
  } catch {
    return null
  }
}

export function createAuthorizedHeaders(headers?: HeadersInit): Headers {
  // Auth is maintained by an httpOnly same-origin session cookie.
  // This helper intentionally does not attach bearer tokens.
  return new Headers(headers)
}

export function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const sameOriginApi = isSameOriginApiRequest(input)
  return fetch(input, {
    ...init,
    credentials: sameOriginApi ? 'same-origin' : init.credentials,
    headers: sameOriginApi ? createAuthorizedHeaders(init.headers) : init.headers,
  })
}
