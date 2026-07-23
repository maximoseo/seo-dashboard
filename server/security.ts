import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'node:crypto'

/**
 * Web-security + observability middleware (P1.6 / P1.7).
 *  - requestId:       correlation id on every response (and req.requestId for logs).
 *  - securityHeaders: baseline headers + a Content-Security-Policy (Report-Only first, then enforce).
 *  - csrfGuard:       reject cross-origin state-changing requests that ride an ambient session cookie.
 */

/** Attach/propagate a request id; echo it on the response for tracing. */
export function requestId() {
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = String(req.headers['x-request-id'] || '')
    const id = /^[\w-]{8,128}$/.test(incoming) ? incoming : randomUUID()
    ;(req as unknown as { requestId: string }).requestId = id
    res.setHeader('x-request-id', id)
    next()
  }
}

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "script-src 'self'",
  "connect-src 'self' https:",
  "form-action 'self'",
].join('; ')

/**
 * Baseline security headers plus CSP. Ship CSP as Report-Only first so violations can be measured
 * against the real app before switching to enforcing (set CSP_ENFORCE=1).
 */
export function securityHeaders() {
  const enforce = process.env.CSP_ENFORCE === '1'
  const cspHeader = enforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only'
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    res.setHeader(cspHeader, CSP_DIRECTIVES)
    next()
  }
}

function hostOf(url: string | undefined | null): string | null {
  if (!url) return null
  try { return new URL(url).host } catch { return null }
}

/**
 * CSRF defence for cookie-authenticated mutations. Bearer/API-key/cron requests use explicit headers
 * (not ambient cookies) and are exempt. A state-changing request that carries the session cookie must
 * come from an allowed origin (same host or a configured frontend origin).
 */
export function csrfGuard(allowedOrigins: string[], sessionCookieName: string) {
  const allowedHosts = new Set(
    allowedOrigins.map(hostOf).filter((h): h is string => Boolean(h)),
  )
  const mutating = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
  return (req: Request, res: Response, next: NextFunction) => {
    if (!mutating.has(req.method)) return next()

    const hasAuthHeader = Boolean(req.headers['authorization'])
    const hasSessionCookie = String(req.headers['cookie'] || '').includes(`${sessionCookieName}=`)
    // Not cookie-authenticated => not CSRF-able.
    if (hasAuthHeader || !hasSessionCookie) return next()

    const originHost = hostOf(req.headers['origin'] as string) || hostOf(req.headers['referer'] as string)
    const selfHost = String(req.headers['host'] || '')
    // No Origin/Referer at all: a non-browser client, cannot be a forged cross-site form/fetch.
    if (!originHost) return next()
    if (originHost === selfHost || allowedHosts.has(originHost)) return next()

    return res.status(403).json({ error: 'Cross-origin request blocked (CSRF protection).', origin: originHost })
  }
}
