import type { Request, Response, NextFunction } from 'express'

/**
 * Minimal structured logger (P1.7). Emits single-line JSON with a level, message and fields, and
 * redacts sensitive values so credentials / cookies / tokens / recipient emails never reach logs.
 * The backend previously used bare console.* with no request correlation; this threads req.requestId.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const SENSITIVE_KEY = /(authorization|cookie|token|secret|api[-_]?key|password|refresh_?token|recipient|email|bearer)/i

/** Deep-clone with sensitive values redacted. Never mutates the input. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1)
    }
    return out
  }
  return value
}

export function log(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  // Stay quiet under tests unless explicitly enabled, so test output is not polluted.
  if (process.env.NODE_ENV === 'test' && !process.env.LOG_IN_TEST) return
  let line: string
  try {
    line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(redact(fields) as object) })
  } catch {
    line = JSON.stringify({ t: new Date().toISOString(), level, msg, note: 'unserializable-fields' })
  }
  if (level === 'error' || level === 'warn') console.error(line)
  else console.log(line)
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => log('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => log('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => log('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => log('error', msg, fields),
}

/** One structured access-log line per API request, carrying the correlation id and latency. */
export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now()
    res.on('finish', () => {
      log('info', 'api_request', {
        id: (req as unknown as { requestId?: string }).requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - start,
      })
    })
    next()
  }
}
