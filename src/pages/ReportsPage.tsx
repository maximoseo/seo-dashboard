import { useMemo, useState } from 'react'
import { DataCard } from '@/components/DataCard'
import DataStateBadge from '@/components/DataStateBadge'
import { useSEO } from '@/contexts/SEOContext'
import { authFetch } from '@/lib/authToken'

export default function ReportsPage() {
  const { domain } = useSEO()
  const [markdown, setMarkdown] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const sections = useMemo(() => [
    { title: 'Executive summary', body: `${domain} is monitored across rankings, backlinks, technical SEO, content, local SEO and GEO readiness.` },
    { title: 'KPI deltas', body: 'Use provider snapshots to compare organic traffic, Top 10 keywords, referring domains and Core Web Vitals.' },
    { title: 'Completed fixes', body: 'This report section is populated from verified tasks and deployment notes.' },
    { title: 'Open risks', body: 'Critical alerts and provider gaps are surfaced for operator follow-up.' },
    { title: 'Next actions', body: 'Prioritized actions are generated from the Tasks module with acceptance criteria.' },
  ], [domain])

  const generateMarkdown = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch('/api/reports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, sections }),
      })
      if (!res.ok) throw new Error(`Report preview failed: ${res.status}`)
      setMarkdown(await res.text())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Report preview unavailable')
    } finally {
      setLoading(false)
    }
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ domain, generatedAt: new Date().toISOString(), sections }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `seo-report-${domain}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 lg:space-y-5 max-w-[1400px]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Reports</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">Client-ready weekly/monthly report builder foundation</p>
        </div>
        <DataStateBadge state={markdown ? 'live' : error ? 'unavailable' : 'planned'} source="report API" />
      </div>

      <DataCard
        title="Report Builder"
        dataState={markdown ? 'live' : error ? 'unavailable' : 'planned'}
        headerRight={<div className="flex gap-2"><button onClick={generateMarkdown} disabled={loading} className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-light disabled:opacity-50">{loading ? 'Generating…' : 'Preview MD'}</button><button onClick={exportJson} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-fg-muted">Export JSON</button></div>}
      >
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {sections.map((section, index) => (
            <div key={section.title} className="rounded-xl border border-border bg-bg-darkest p-4">
              <p className="text-[11px] uppercase tracking-wide text-fg-dim">Section {index + 1}</p>
              <p className="mt-2 text-sm font-semibold text-fg">{section.title}</p>
            </div>
          ))}
        </div>
        {error && <p className="mt-3 text-xs text-yellow">{error}</p>}
        {markdown && <pre className="mt-4 max-h-72 overflow-auto rounded-xl border border-white/10 bg-bg-darkest p-4 text-xs text-fg-muted whitespace-pre-wrap">{markdown}</pre>}
      </DataCard>
    </div>
  )
}
