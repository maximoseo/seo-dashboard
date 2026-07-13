import { useEffect, useMemo, useState } from 'react'
import { DataCard } from '@/components/DataCard'
import DataStateBadge from '@/components/DataStateBadge'
import { useSEO } from '@/contexts/SEOContext'
import { useProject } from '@/contexts/ProjectContext'
import { authFetch } from '@/lib/authToken'

type Locale = 'he' | 'en'
type TemplateId = 'weekly' | 'monthly' | 'executive' | 'local-geo'

type TemplateMeta = {
  id: TemplateId
  labelEn: string
  labelHe: string
  descriptionEn: string
  descriptionHe: string
}

type PreviewResponse = {
  domain: string
  locale: Locale
  template: TemplateId
  market?: string
  clientName?: string | null
  sections: Array<{ title: string; body: string }>
  markdown: string
  html: string
  templates?: TemplateMeta[]
  generatedAt?: string
}

const FALLBACK_TEMPLATES: TemplateMeta[] = [
  { id: 'weekly', labelEn: 'Weekly performance', labelHe: 'דוח ביצועים שבועי', descriptionEn: 'Short weekly rollup', descriptionHe: 'סיכום שבועי קצר' },
  { id: 'monthly', labelEn: 'Monthly SEO', labelHe: 'דוח SEO חודשי', descriptionEn: 'Full monthly', descriptionHe: 'דוח חודשי מלא' },
  { id: 'executive', labelEn: 'Executive brief', labelHe: 'תקציר מנהלים', descriptionEn: 'One-page brief', descriptionHe: 'תקציר מנהלים' },
  { id: 'local-geo', labelEn: 'Local + GEO', labelHe: 'מקומי + GEO/AI', descriptionEn: 'Local + AI search', descriptionHe: 'מקומי + נראות AI' },
]

export default function ReportsPage() {
  const { domain } = useSEO()
  const { activeProject } = useProject()
  const projectMarket = activeProject?.market || null

  const [locale, setLocale] = useState<Locale>('he')
  const [template, setTemplate] = useState<TemplateId>('monthly')
  const [templates, setTemplates] = useState<TemplateMeta[]>(FALLBACK_TEMPLATES)
  const [markdown, setMarkdown] = useState('')
  const [html, setHtml] = useState('')
  const [sections, setSections] = useState<Array<{ title: string; body: string }>>([])
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    void authFetch('/api/reports/templates')
      .then(async (res) => {
        if (!res.ok) return
        const body = await res.json()
        if (Array.isArray(body.templates) && body.templates.length) setTemplates(body.templates)
      })
      .catch(() => {})
  }, [])

  const generate = async (format: 'json' | 'html' | 'md' = 'json') => {
    setLoading(true)
    setError(null)
    setShareUrl(null)
    try {
      const res = await authFetch('/api/reports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain,
          locale,
          template,
          market: projectMarket,
          clientName: activeProject?.name || null,
          format,
        }),
      })
      if (!res.ok) throw new Error(`Report preview failed: ${res.status}`)
      if (format === 'html') {
        const text = await res.text()
        setHtml(text)
        setMarkdown('')
        return
      }
      if (format === 'md') {
        const text = await res.text()
        setMarkdown(text)
        return
      }
      const body = (await res.json()) as PreviewResponse
      setMarkdown(body.markdown || '')
      setHtml(body.html || '')
      setSections(body.sections || [])
      if (body.templates?.length) setTemplates(body.templates)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Report preview unavailable')
    } finally {
      setLoading(false)
    }
  }

  const createShare = async () => {
    setSharing(true)
    setError(null)
    try {
      const res = await authFetch('/api/reports/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain,
          locale,
          template,
          market: projectMarket,
          clientName: activeProject?.name || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Share failed: ${res.status}`)
      setShareUrl(body.htmlUrl || body.path || null)
      if (body.markdownUrl) setMarkdown((prev) => prev || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Share unavailable')
    } finally {
      setSharing(false)
    }
  }

  const openPrintable = () => {
    if (!html) {
      void generate('html').then(() => {
        // open after next paint once html set — fallback window dump of markdown
      })
      return
    }
    const w = window.open('', '_blank', 'noopener,noreferrer')
    if (!w) return
    w.document.open()
    w.document.write(html)
    w.document.close()
  }

  const exportJson = () => {
    const blob = new Blob(
      [JSON.stringify({ domain, locale, template, market: projectMarket, sections, generatedAt: new Date().toISOString() }, null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `seo-report-${domain}-${template}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportMarkdown = () => {
    if (!markdown) return
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `seo-report-${domain}-${template}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const state = error ? 'unavailable' : markdown || html ? 'live' : loading ? 'loading' : 'planned'
  const dir = locale === 'he' ? 'rtl' : 'ltr'

  const templateCards = useMemo(() => templates, [templates])

  return (
    <div className="max-w-[1400px] space-y-4 lg:space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-fg md:text-lg">Reports</h2>
          <p className="mt-0.5 text-xs text-fg-muted md:text-sm">
            תבניות דוח (עברית/EN), HTML להדפסה/PDF, וקישור שיתוף ל־{domain}
          </p>
        </div>
        <DataStateBadge state={state as any} source="report API" />
      </div>

      <DataCard
        title="Report Builder"
        dataState={state as any}
        headerRight={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void generate('json')}
              disabled={loading}
              className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-light disabled:opacity-50"
            >
              {loading ? 'Generating…' : 'Generate'}
            </button>
            <button onClick={openPrintable} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-fg-muted">
              HTML / PDF
            </button>
            <button
              onClick={() => void createShare()}
              disabled={sharing}
              className="rounded-lg border border-blue-400/30 bg-blue-400/10 px-3 py-1.5 text-xs font-medium text-blue-100 disabled:opacity-50"
            >
              {sharing ? 'Sharing…' : 'Share link'}
            </button>
            <button onClick={exportMarkdown} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-fg-muted">
              Export MD
            </button>
            <button onClick={exportJson} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-fg-muted">
              Export JSON
            </button>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {(['he', 'en'] as Locale[]).map((loc) => (
            <button
              key={loc}
              onClick={() => setLocale(loc)}
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                locale === loc
                  ? 'border-accent/40 bg-accent/15 text-accent-light'
                  : 'border-border text-fg-muted hover:border-border-light'
              }`}
            >
              {loc === 'he' ? 'עברית' : 'English'}
            </button>
          ))}
          {projectMarket && (
            <span className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-xs text-blue-100">
              Market: {projectMarket}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {templateCards.map((t) => (
            <button
              key={t.id}
              onClick={() => setTemplate(t.id)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                template === t.id
                  ? 'border-accent/50 bg-accent/10'
                  : 'border-border bg-bg-darkest hover:border-border-light'
              }`}
            >
              <p className="text-[11px] uppercase tracking-wide text-fg-dim">{t.id}</p>
              <p className="mt-1 text-sm font-semibold text-fg">{locale === 'he' ? t.labelHe : t.labelEn}</p>
              <p className="mt-1 text-xs text-fg-muted">{locale === 'he' ? t.descriptionHe : t.descriptionEn}</p>
            </button>
          ))}
        </div>

        {sections.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {sections.map((section, index) => (
              <div key={`${section.title}-${index}`} className="rounded-xl border border-border bg-bg-darkest p-4">
                <p className="text-[11px] uppercase tracking-wide text-fg-dim">Section {index + 1}</p>
                <p className="mt-2 text-sm font-semibold text-fg">{section.title}</p>
              </div>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-xs text-yellow">{error}</p>}
        {shareUrl && (
          <p className="mt-3 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-100">
            Share (7d):{' '}
            <a className="underline" href={shareUrl} target="_blank" rel="noreferrer">
              {shareUrl}
            </a>
          </p>
        )}
        {markdown && (
          <pre
            dir={dir}
            className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-bg-darkest p-4 text-xs text-fg-muted"
          >
            {markdown}
          </pre>
        )}
      </DataCard>
    </div>
  )
}
