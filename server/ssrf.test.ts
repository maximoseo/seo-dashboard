import { describe, it, expect } from 'vitest'
import { assertPublicHttpUrl, isBlockedHost } from './security'

describe('SSRF url guard', () => {
  it.each(['localhost', '127.0.0.1', '10.0.0.5', '192.168.1.1', '169.254.169.254', '172.16.9.9', '::1', 'metadata.internal'])(
    'blocks internal/private host %s',
    (h) => expect(isBlockedHost(h)).toBe(true),
  )

  it.each(['example.com', '8.8.8.8', '93.184.216.34', 'sub.good.co.il', 'maximo-seo.ai'])(
    'allows public host %s',
    (h) => expect(isBlockedHost(h)).toBe(false),
  )

  it('rejects non-http(s) schemes', () => {
    expect(() => assertPublicHttpUrl('file:///etc/passwd')).toThrow()
    expect(() => assertPublicHttpUrl('ftp://host/x')).toThrow()
    expect(() => assertPublicHttpUrl('gopher://x')).toThrow()
  })

  it('rejects private targets and cloud metadata, allows public URLs', () => {
    expect(() => assertPublicHttpUrl('http://169.254.169.254/latest/meta-data/')).toThrow()
    expect(() => assertPublicHttpUrl('http://localhost:3000/admin')).toThrow()
    expect(() => assertPublicHttpUrl('http://10.1.2.3/internal')).toThrow()
    expect(assertPublicHttpUrl('https://example.com/report').host).toBe('example.com')
  })
})
