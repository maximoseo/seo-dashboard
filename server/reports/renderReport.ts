export interface ReportSection {
  title: string
  body: string
}

export type ReportLocale = 'en' | 'he'
export type ReportTemplateId = 'weekly' | 'monthly' | 'executive' | 'local-geo'

export interface SeoReportInput {
  domain: string
  generatedAt?: string
  locale?: ReportLocale
  template?: ReportTemplateId
  clientName?: string | null
  market?: string | null
  /** White-label: agency brand shown in the header/footer instead of generic title. */
  brandName?: string | null
  /** White-label: accent hex color for the brand header bar (e.g. '#0ea5e9'). */
  brandColor?: string | null
  sections: ReportSection[]
}

export interface ReportTemplateMeta {
  id: ReportTemplateId
  labelEn: string
  labelHe: string
  descriptionEn: string
  descriptionHe: string
}

export const REPORT_TEMPLATES: ReportTemplateMeta[] = [
  {
    id: 'weekly',
    labelEn: 'Weekly performance',
    labelHe: 'דוח ביצועים שבועי',
    descriptionEn: 'Short operator/client weekly rollup',
    descriptionHe: 'סיכום שבועי קצר ללקוח/מפעיל',
  },
  {
    id: 'monthly',
    labelEn: 'Monthly SEO',
    labelHe: 'דוח SEO חודשי',
    descriptionEn: 'Full monthly including rankings, risks, next actions',
    descriptionHe: 'דוח חודשי מלא עם דירוגים, סיכונים והמשך עבודה',
  },
  {
    id: 'executive',
    labelEn: 'Executive brief',
    labelHe: 'תקציר מנהלים',
    descriptionEn: 'One-page business language summary',
    descriptionHe: 'תקציר בשפה עסקית לעמוד אחד',
  },
  {
    id: 'local-geo',
    labelEn: 'Local + GEO',
    labelHe: 'מקומי + GEO/AI',
    descriptionEn: 'Local pack + AI answer visibility focus',
    descriptionHe: 'מיקוד local pack + נראות ב-AI answers',
  },
]

const HE_SECTION_TITLES: Record<string, string> = {
  'Executive summary': 'סיכום מנהלים',
  'KPI deltas': 'שינויי KPI',
  'Completed fixes': 'תיקונים שבוצעו',
  'Open risks': 'סיכונים פתוחים',
  'Next actions': 'פעולות המשך',
  'Rank movements': 'תנועות דירוג',
  'Competitor gaps': 'פערי מתחרים',
  'Local SEO': 'קידום מקומי',
  'GEO / AI Search': 'GEO / חיפוש AI',
  'Market context': 'הקשר שוק',
}

export function defaultSectionsForTemplate(input: {
  domain: string
  locale?: ReportLocale
  template?: ReportTemplateId
  market?: string | null
  clientName?: string | null
}): ReportSection[] {
  const locale = input.locale || 'he'
  const template = input.template || 'monthly'
  const domain = input.domain
  const market = input.market || (locale === 'he' ? 'ישראל' : 'Israel')
  const client = input.clientName || domain

  if (locale === 'he') {
    if (template === 'executive') {
      return [
        {
          title: 'סיכום מנהלים',
          body: `${client} (${domain}) מנוטר בשוק ${market}. הדוח מסכם מצב אורגני, סיכונים ופעולות להמשך — בשפה עסקית ללא מונחי SEO מיותרים.`,
        },
        {
          title: 'שינויי KPI',
          body: 'השוואה ל-30 הימים האחרונים: תנועה אורגנית, מילות מפתח בטופ 10/20, דומיינים מפנים וציון בריאות. המספרים נשלפים מסנאפשוטים של ספקים כשקיימים.',
        },
        {
          title: 'סיכונים פתוחים',
          body: 'רשימת התראות קריטיות/אזהרה שנשארו פתוחות — דירוגים שנפלו, דפים שבורים עם קישורים, ביצועי Core Web Vitals.',
        },
        {
          title: 'פעולות המשך',
          body: 'עד 5 פעולות עם עדיפות והגדרת "הושלם" (acceptance criteria) מתוך מודול Tasks.',
        },
      ]
    }
    if (template === 'local-geo') {
      return [
        {
          title: 'קידום מקומי',
          body: `סטטוס Local SEO ל-${domain}: GBP, ביקורות, עקביות NAP ורשת דירוגים מקומית (Local Falcon / GSC local where available).`,
        },
        {
          title: 'GEO / חיפוש AI',
          body: 'נראות ב-AI Overviews, שלמות entity/schema, והזדמנויות לצטטוט/ציטוט ע"י מנועי תשובות.',
        },
        {
          title: 'תנועות דירוג',
          body: 'מילות מפתח שירדו/עלו/חדשות בשוק היעד — מבוסס snapshot keywords.',
        },
        {
          title: 'פעולות המשך',
          body: 'משימות מקומיות + תוכני תשובה קצרים (Atomic Answers) לשיפור ציטוט AI.',
        },
      ]
    }
    if (template === 'weekly') {
      return [
        {
          title: 'סיכום מנהלים',
          body: `סיכום שבועי ל-${client} (${domain}) · שוק ${market}.`,
        },
        {
          title: 'תנועות דירוג',
          body: 'Top drops, top improvements, new/lost keywords מהשבוע האחרון.',
        },
        {
          title: 'תיקונים שבוצעו',
          body: 'משימות שעברו ל-verified השבוע.',
        },
        {
          title: 'פעולות המשך',
          body: '3–5 משימות לעדיפות השבוע הבא.',
        },
      ]
    }
    // monthly default he
    return [
      {
        title: 'סיכום מנהלים',
        body: `${domain} מנוטר ב-rankings, backlinks, technical SEO, content, local ו-GEO בשוק ${market}.`,
      },
      {
        title: 'הקשר שוק',
        body: `שוק מדווח: ${market}. ברירת מחדל לסוכנות ישראלית: IL (he / .co.il).`,
      },
      {
        title: 'שינויי KPI',
        body: 'השווה traffic אורגני, Top 10 keywords, referring domains ו-Core Web Vitals מול חודש קודם.',
      },
      {
        title: 'תנועות דירוג',
        body: 'דגימת מילות מפתח שעלו/ירדו או חדשות — עם volume ומיקום.',
      },
      {
        title: 'פערי מתחרים',
        body: 'אומדן פערי שוק מול מתחרים שנשמרו ב-competitors snapshot.',
      },
      {
        title: 'תיקונים שבוצעו',
        body: 'נשלף ממשימות verified + הערות deploy.',
      },
      {
        title: 'סיכונים פתוחים',
        body: 'התראות קריטיות וחוסרי נתונים מספקים (soft-degrade).',
      },
      {
        title: 'פעולות המשך',
        body: 'תעדוף מתוך Tasks עם קריטריוני קבלה.',
      },
    ]
  }

  // English templates
  if (template === 'executive') {
    return [
      { title: 'Executive summary', body: `${client} (${domain}) monitored in ${market}. Business summary of organic health, risks and next steps.` },
      { title: 'KPI deltas', body: '30-day deltas for organic traffic, Top 10/20 keywords, referring domains and health score from provider snapshots.' },
      { title: 'Open risks', body: 'Open critical/warning alerts still requiring operator action.' },
      { title: 'Next actions', body: 'Up to 5 prioritized tasks with acceptance criteria.' },
    ]
  }
  if (template === 'local-geo') {
    return [
      { title: 'Local SEO', body: `Local status for ${domain}: GBP, reviews, NAP consistency, geo-grid readiness.` },
      { title: 'GEO / AI Search', body: 'AI Overview visibility, entity completeness and citation opportunities.' },
      { title: 'Rank movements', body: 'Improved / declined / new keywords for the target market.' },
      { title: 'Next actions', body: 'Local + GEO follow-ups generated from module checks and alert backlog.' },
    ]
  }
  if (template === 'weekly') {
    return [
      { title: 'Executive summary', body: `Weekly rollup for ${client} (${domain}) · market ${market}.` },
      { title: 'Rank movements', body: 'Top drops, improvements, new/lost keywords this week.' },
      { title: 'Completed fixes', body: 'Tasks verified this week.' },
      { title: 'Next actions', body: '3–5 actions for next week.' },
    ]
  }
  return [
    { title: 'Executive summary', body: `${domain} is monitored across rankings, backlinks, technical SEO, content, local SEO and GEO readiness in ${market}.` },
    { title: 'Market context', body: `Reported market: ${market}. Agency default is Israel (IL / he) unless overridden.` },
    { title: 'KPI deltas', body: 'Compare organic traffic, Top 10 keywords, referring domains and Core Web Vitals vs previous period.' },
    { title: 'Rank movements', body: 'Keyword up/down/new signals from the keywords snapshot spine.' },
    { title: 'Competitor gaps', body: 'Estimated gaps vs pinned competitors from competitors snapshot.' },
    { title: 'Completed fixes', body: 'Populated from verified tasks and deployment notes.' },
    { title: 'Open risks', body: 'Critical alerts and provider soft-degrade gaps.' },
    { title: 'Next actions', body: 'Prioritized actions from the Tasks module with acceptance criteria.' },
  ]
}

export function localizeSectionTitle(title: string, locale: ReportLocale): string {
  if (locale !== 'he') return title
  return HE_SECTION_TITLES[title] || title
}

export function renderReportMarkdown(input: SeoReportInput): string {
  const generatedAt = input.generatedAt || new Date().toISOString()
  const locale = input.locale || 'en'
  const template = input.template || 'monthly'
  const title =
    locale === 'he'
      ? `# דוח SEO — ${input.domain}`
      : `# SEO Report — ${input.domain}`
  const metaBits = [
    locale === 'he' ? `נוצר: ${generatedAt}` : `Generated: ${generatedAt}`,
    locale === 'he' ? `תבנית: ${template}` : `Template: ${template}`,
    input.market ? (locale === 'he' ? `שוק: ${input.market}` : `Market: ${input.market}`) : null,
    input.clientName ? (locale === 'he' ? `לקוח: ${input.clientName}` : `Client: ${input.clientName}`) : null,
  ].filter(Boolean)
  const sections = input.sections
    .map((section) => {
      const heading = localizeSectionTitle(section.title, locale)
      return `## ${heading}\n\n${section.body}`
    })
    .join('\n\n')
  return `${title}\n\n${metaBits.join(' · ')}\n\n${sections}\n`
}

/** Self-contained print-friendly HTML (browser "Save as PDF" / print) — Hebrew RTL means dir=rtl + compact margins. */
export function renderReportHtml(input: SeoReportInput): string {
  const locale = input.locale || 'en'
  const rtl = locale === 'he'
  const md = renderReportMarkdown(input)
  const brandName = input.brandName?.trim() || null
  const brandColor = /^#[0-9a-fA-F]{6}$/.test(input.brandColor || '') ? input.brandColor! : '#0ea5e9'
  const bodyHtml = md
    .split('\n')
    .map((line) => {
      if (line.startsWith('# ')) return `<h1>${escapeHtml(line.slice(2))}</h1>`
      if (line.startsWith('## ')) return `<h2>${escapeHtml(line.slice(3))}</h2>`
      if (!line.trim()) return '<br/>'
      return `<p>${escapeHtml(line)}</p>`
    })
    .join('\n')

  const brandHeader = brandName
    ? `  <div class="brand-bar" style="background:${escapeHtml(brandColor)}">
    <div class="brand-name">${escapeHtml(brandName)}</div>
    <div class="brand-tag">${rtl ? 'דוח ביצועים' : 'Performance Report'}</div>
  </div>`
    : ''
  const brandFooter = brandName
    ? `  <div class="brand-footer">${rtl ? `הופק עבורך על ידי ${escapeHtml(brandName)}` : `Prepared for you by ${escapeHtml(brandName)}`}</div>`
    : ''

  return `<!doctype html>
<html lang="${rtl ? 'he' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.domain)} — SEO Report${brandName ? ` · ${escapeHtml(brandName)}` : ''}</title>
  <style>
    @page { margin: 1cm; }
    body {
      font-family: ${rtl ? "'Assistant', 'Segoe UI', Tahoma, Arial, sans-serif" : "Inter, system-ui, -apple-system, Segoe UI, sans-serif"};
      font-size: 10.5pt;
      line-height: 1.45;
      color: #111;
      margin: 0;
      padding: 16px 18px 28px;
      max-width: 820px;
    }
    h1 { font-size: 18pt; margin: 0 0 8px; }
    h2 { font-size: 12.5pt; margin: 18px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    p { margin: 0 0 6px; }
    .meta { color: #555; font-size: 9.5pt; margin-bottom: 14px; }
    .print-hint { color: #777; font-size: 9pt; margin-top: 24px; }
    .brand-bar { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-radius: 8px; margin: -4px -6px 16px; color: #fff; }
    .brand-name { font-size: 14pt; font-weight: 700; letter-spacing: 0.2px; }
    .brand-tag { font-size: 9pt; opacity: 0.85; }
    .brand-footer { margin-top: 28px; padding-top: 10px; border-top: 2px solid ${escapeHtml(brandColor)}; color: #555; font-size: 9.5pt; }
    @media print { .print-hint { display: none; } }
  </style>
</head>
<body>
${brandHeader}
  ${bodyHtml}
  <p class="print-hint">${rtl ? 'להדפסה / PDF: Ctrl/Cmd+P → Save as PDF' : 'Print / PDF: Ctrl/Cmd+P → Save as PDF'}</p>
${brandFooter}
</body>
</html>`
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
