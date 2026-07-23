import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from './index'

describe('security + observability middleware', () => {
  it('sets and echoes a request id', async () => {
    const r = await request(app).get('/api/health')
    expect(r.status).toBe(200)
    expect(r.headers['x-request-id']).toBeTruthy()

    const r2 = await request(app).get('/api/health').set('x-request-id', 'trace-abc-123456')
    expect(r2.headers['x-request-id']).toBe('trace-abc-123456')
  })

  it('sends CSP (report-only) + baseline security headers', async () => {
    const r = await request(app).get('/api/health')
    expect(r.headers['content-security-policy-report-only']).toContain("default-src 'self'")
    expect(r.headers['x-frame-options']).toBe('DENY')
    expect(r.headers['x-content-type-options']).toBe('nosniff')
  })

  it('blocks a cross-origin cookie-authenticated mutation (CSRF)', async () => {
    const r = await request(app)
      .post('/api/projects')
      .set('Cookie', 'maximo_dashboard_session=forged')
      .set('Origin', 'https://evil.example')
      .send({ name: 'x', domain: 'x.com' })
    expect(r.status).toBe(403)
  })

  it('allows an allowed-origin cookie mutation past CSRF (then hits auth, not 403)', async () => {
    const r = await request(app)
      .post('/api/projects')
      .set('Cookie', 'maximo_dashboard_session=forged')
      .set('Origin', 'https://seo-dashboard.maximo-seo.ai')
      .send({ name: 'x', domain: 'x.com' })
    expect(r.status).not.toBe(403)
  })

  it('exempts bearer-authenticated cross-origin mutations from CSRF', async () => {
    const r = await request(app)
      .post('/api/projects')
      .set('Authorization', 'Bearer whatever')
      .set('Origin', 'https://evil.example')
      .send({ name: 'x', domain: 'x.com' })
    expect(r.status).not.toBe(403)
  })
})
