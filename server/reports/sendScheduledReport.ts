import { renderReportHtml, renderReportMarkdown, defaultSectionsForTemplate, type ReportLocale, type ReportTemplateId } from './renderReport.js'
import type { ReportSchedule } from './scheduleStore.js'

export interface SendResult {
  ok: boolean
  provider: 'resend'
  id?: string | null
  error?: string | null
}

const DEFAULT_FROM = 'reports@maximo-seo.com'

/**
 * Build the white-label report (HTML + markdown) for a schedule.
 */
export function buildScheduledReport(input: {
  domain: string
  schedule: ReportSchedule
  marketLabel?: string | null
}): { html: string; markdown: string; subject: string } {
  const { domain, schedule } = input
  const locale: ReportLocale = schedule.locale || 'he'
  const template: ReportTemplateId = schedule.template || 'monthly'
  const market = schedule.market || input.marketLabel || null

  const sections = defaultSectionsForTemplate({
    domain,
    locale,
    template,
    market,
    clientName: schedule.clientName || null,
  })

  const reportInput = {
    domain,
    locale,
    template,
    market,
    clientName: schedule.clientName || null,
    brandName: schedule.brandName || null,
    brandColor: schedule.brandColor || null,
    sections,
    generatedAt: new Date().toISOString(),
  }

  const html = renderReportHtml(reportInput)
  const markdown = renderReportMarkdown(reportInput)

  const freqLabel = schedule.frequency === 'weekly' ? (locale === 'he' ? 'שבועי' : 'Weekly') : (locale === 'he' ? 'חודשי' : 'Monthly')
  const brand = schedule.brandName?.trim()
  const subject = brand
    ? `${brand} — ${locale === 'he' ? 'דוח SEO' : 'SEO Report'} ${freqLabel} — ${domain}`
    : `${locale === 'he' ? 'דוח SEO' : 'SEO Report'} ${freqLabel} — ${domain}`

  return { html, markdown, subject }
}

/**
 * Send the report email via Resend. Requires RESEND_API_KEY env.
 * From address uses the verified maximo-seo.com domain with the white-label brand as display name.
 */
export async function sendReportEmail(input: {
  schedule: ReportSchedule
  html: string
  markdown: string
  subject: string
  apiKey: string
  fromAddress?: string
}): Promise<SendResult> {
  const { schedule, html, markdown, subject, apiKey } = input
  if (!apiKey) return { ok: false, provider: 'resend', error: 'RESEND_API_KEY not configured' }
  if (!schedule.recipients.length) return { ok: false, provider: 'resend', error: 'No recipients' }

  const brand = schedule.brandName?.trim()
  const fromAddress = input.fromAddress || DEFAULT_FROM
  const from = brand ? `${brand} <${fromAddress}>` : fromAddress

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: schedule.recipients,
        subject,
        html,
        text: markdown,
      }),
    })
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string }
    if (!res.ok) {
      return { ok: false, provider: 'resend', error: `Resend HTTP ${res.status}: ${body.message || body.name || 'unknown'}` }
    }
    return { ok: true, provider: 'resend', id: body.id || null }
  } catch (err: any) {
    return { ok: false, provider: 'resend', error: err?.message || String(err) }
  }
}
