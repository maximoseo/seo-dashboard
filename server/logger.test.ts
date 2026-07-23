import { describe, it, expect, vi } from 'vitest'
import { redact, log } from './logger'

describe('logger redaction', () => {
  it('redacts sensitive keys, keeps the rest, and never mutates the input', () => {
    const input = {
      authorization: 'Bearer x',
      nested: { apiKey: 'k', ok: 1 },
      list: [{ token: 't' }, 'plain'],
      email: 'a@b.com',
      keep: 'value',
    }
    const out = redact(input) as any
    expect(out.authorization).toBe('[redacted]')
    expect(out.nested.apiKey).toBe('[redacted]')
    expect(out.nested.ok).toBe(1)
    expect(out.list[0].token).toBe('[redacted]')
    expect(out.list[1]).toBe('plain')
    expect(out.email).toBe('[redacted]')
    expect(out.keep).toBe('value')
    // input untouched
    expect(input.authorization).toBe('Bearer x')
    expect(input.nested.apiKey).toBe('k')
  })

  it('is silent under test env unless LOG_IN_TEST is set', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    log('info', 'hi', { a: 1 })
    log('error', 'boom', { secret: 'x' })
    expect(logSpy).not.toHaveBeenCalled()
    expect(errSpy).not.toHaveBeenCalled()
    logSpy.mockRestore()
    errSpy.mockRestore()
  })
})
