import { describe, expect, it } from 'vitest'
import {
  REPORT_TEMPLATES,
  defaultSectionsForTemplate,
  renderReportHtml,
  renderReportMarkdown,
} from './renderReport.js'

describe('report renderer', () => {
  it('exports four templates including local-geo', () => {
    expect(REPORT_TEMPLATES.map((t) => t.id).sort()).toEqual(
      ['executive', 'local-geo', 'monthly', 'weekly'].sort(),
    )
  })

  it('builds Hebrew monthly sections with RTL-ready markdown', () => {
    const sections = defaultSectionsForTemplate({
      domain: 'nyg.co.il',
      locale: 'he',
      template: 'monthly',
      market: 'Israel',
    })
    expect(sections.length).toBeGreaterThanOrEqual(6)
    const md = renderReportMarkdown({
      domain: 'nyg.co.il',
      locale: 'he',
      template: 'monthly',
      market: 'Israel',
      sections,
    })
    expect(md).toContain('דוח SEO')
    expect(md).toContain('סיכום מנהלים')
    expect(md).toContain('nyg.co.il')
  })

  it('renders compact print-ready Hebrew HTML', () => {
    const sections = defaultSectionsForTemplate({
      domain: 'selanahari.co.il',
      locale: 'he',
      template: 'executive',
    })
    const html = renderReportHtml({
      domain: 'selanahari.co.il',
      locale: 'he',
      template: 'executive',
      sections,
    })
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('lang="he"')
    expect(html).toContain('@page { margin: 1cm; }')
    expect(html.toLowerCase()).toContain('save as pdf')
  })
})
