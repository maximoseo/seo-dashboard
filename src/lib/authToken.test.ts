import { describe, expect, it } from 'vitest'
import { AUTH_USER_KEY, createAuthorizedHeaders } from './authToken'

describe('cookie-backed auth helpers', () => {
  it('stores only non-sensitive user metadata under a namespaced key', () => {
    expect(AUTH_USER_KEY).toBe('maximo:dashboard_auth_user')
  })

  it('does not create bearer authorization headers in browser code', () => {
    const headers = createAuthorizedHeaders({ 'Content-Type': 'application/json' })
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.has('Authorization')).toBe(false)
  })
})
