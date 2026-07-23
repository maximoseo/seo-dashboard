import { describe, expect, it } from 'vitest'
import { defaultSectionsForTemplate, renderReportHtml } from './renderReport.js'

/**
 * Locks the XSS guarantee for shared/exported report HTML: attacker-controlled fields (domain,
 * brand name) must be escaped, never emitted as live markup.
 */
describe('report HTML is XSS-safe', () => {
  it('escapes malicious domain and brand name instead of emitting markup', () => {
    const html = renderReportHtml({
      domain: '<script>alert(1)</script>evil.com',
      locale: 'en',
      template: 'executive',
      brandName: '"><img src=x onerror=alert(1)>',
      sections: defaultSectionsForTemplate({ domain: 'x.com', locale: 'en', template: 'executive' }),
    })

    // No live injected tags.
    expect(html).not.toContain('<script>alert(1)')
    expect(html).not.toContain('<img src=x onerror')
    // Payloads survive only as escaped text.
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;img src=x')
  })

  it('ignores a non-hex brand color (no CSS injection)', () => {
    const html = renderReportHtml({
      domain: 'x.com',
      locale: 'en',
      template: 'executive',
      brandColor: 'red;} body{display:none}//',
      brandName: 'Acme',
      sections: defaultSectionsForTemplate({ domain: 'x.com', locale: 'en', template: 'executive' }),
    })
    expect(html).not.toContain('body{display:none}')
    expect(html).toContain('#0ea5e9') // fell back to the safe default
  })
})
