import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { DataCard } from '@/components/DataCard'
import DataStateBadge from '@/components/DataStateBadge'
import DomainIntegrityBar from '@/components/DomainIntegrityBar'
import SyncButton from '@/components/SyncButton'
import { useSEO } from '@/contexts/SEOContext'
import { useProject } from '@/contexts/ProjectContext'
import { usePages, refreshPages } from '@/api/client'
import { fetchContentAnalysis, fetchExaSearch, type ContentAnalysis } from '@/services/seoApi'
import { authFetch } from '@/lib/authToken'
import { canonicalizeDomain, hostBelongsToDomain } from '@/lib/domain'
import { useDomainSwitchCleanup } from '@/lib/useDomainQuery'

type Tab = 'pages' | 'gaps' | 'optimize' | 'research'

type GapRow = {
  keyword: string
  volume: number | null
  difficulty: number | null
  gap: string
  competitor?: string
  source?: string
}

function scoreTone(score: number) {
  if (score >= 70) return { bar: 'bg-green-400', pill: 'bg-green-500/20 text-green-300', label: 'Good' }
  if (score >= 50) return { bar: 'bg-yellow-400', pill: 'bg-yellow-500/20 text-yellow-300', label: 'Needs work' }
  return { bar: 'bg-red-400', pill: 'bg-red-500/20 text-red-300', label: 'Poor' }
}

export default function ContentPage() {
  const { domain } = useSEO()
  const { activeProject } = useProject()
  useDomainSwitchCleanup(domain)
  const market = activeProject?.market || null
  const clean = canonicalizeDomain(domain)
  const qc = useQueryClient()
  const { data: pagesData, isLoading: pagesLoading, error: pagesError, isFetching, dataUpdatedAt, refetch } = usePages(domain, market)

  const [activeTab, setActiveTab] = useState<Tab>('pages')
  const [contentData, setContentData] = useState<ContentAnalysis | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [contentError, setContentError] = useState<string | null>(null)
  const [exaResults, setExaResults] = useState<any>(null)
  const [exaLoading, setExaLoading] = useState(false)
  const [analyzeUrl, setAnalyzeUrl] = useState('')
  const [analyzeKeyword, setAnalyzeKeyword] = useState('')
  const [gaps, setGaps] = useState<GapRow[]>([])
  const [gapsLoading, setGapsLoading] = useState(false)
  const [gapsError, setGapsError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  // Reset all local analysis when domain switches — never keep Maximo demo / prior site state
  useEffect(() => {
    setContentData(null)
    setContentError(null)
    setExaResults(null)
    setGaps([])
    setGapsError(null)
    setAnalyzeUrl(clean ? `https://${clean}/` : '')
    setAnalyzeKeyword('')
    setActiveTab('pages')
  }, [clean])

  // Content gaps from the domain's competitor + keyword spine only
  useEffect(() => {
    if (!clean || activeTab !== 'gaps') return
    let cancelled = false
    setGapsLoading(true)
    setGapsError(null)
    const params = new URLSearchParams({ domain: clean })
    if (market?.trim()) params.set('market', market.trim())
    authFetch(`/api/competitors/aggregated?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Competitors API ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        if (data?.domain && canonicalizeDomain(data.domain) !== clean) {
          setGaps([])
          setGapsError('Domain mismatch in competitors payload')
          return
        }
        const rows: GapRow[] = Array.isArray(data?.gaps)
          ? data.gaps.map((g: any) => ({
              keyword: g.keyword || g.topic || g.competitor || 'Gap',
              volume: g.volume != null ? Number(g.volume) : null,
              difficulty: g.difficulty != null ? Number(g.difficulty) : null,
              gap: g.note || g.gap || (g.ourMissingEstimate != null ? `Missing est. ${g.ourMissingEstimate}` : 'Opportunity'),
              competitor: g.competitor || g.domain,
              source: g.source || 'competitors',
            }))
          : []
        // Fallback: high-volume keywords where we rank poorly from keywords snapshot via competitors normalized opaque notes
        if (!rows.length && Array.isArray(data?.normalized)) {
          for (const c of data.normalized.slice(0, 12)) {
            rows.push({
              keyword: `Overlap vs ${c.domain || 'competitor'}`,
              volume: c.traffic != null ? Math.round(Number(c.traffic)) : null,
              difficulty: c.relevance != null ? Math.round(Number(c.relevance)) : null,
              gap: `${c.commonKeywords ?? '—'} shared keywords · review content depth`,
              competitor: c.domain,
              source: c.source || 'competitors',
            })
          }
        }
        setGaps(rows)
      })
      .catch((e) => {
        if (!cancelled) {
          setGaps([])
          setGapsError(e instanceof Error ? e.message : 'Failed to load gaps')
        }
      })
      .finally(() => {
        if (!cancelled) setGapsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [clean, market, activeTab])

  const pages = useMemo(() => {
    const raw = Array.isArray(pagesData?.normalized) ? pagesData.normalized : []
    return raw
      .filter((p: any) => hostBelongsToDomain(p.url || '', clean))
      .map((p: any) => {
        const words = Number(p.wordCount || 0) || 0
        const traffic = Number(p.traffic || 0) || 0
        const score = Number(p.score || 0) || Math.min(99, 40 + Math.min(30, words / 50) + Math.min(20, traffic / 50))
        const issues = Array.isArray(p.onpageIssues) ? p.onpageIssues.length : 0
        return {
          url: String(p.url || ''),
          title: String(p.title || p.url || ''),
          words,
          traffic,
          keywords: Number(p.keywords || 0) || 0,
          score: Math.round(score),
          issues,
          h1: String(p.h1 || ''),
          source: String(p.source || ''),
          status: (score >= 70 ? 'good' : score >= 50 ? 'needs-work' : 'poor') as 'good' | 'needs-work' | 'poor',
        }
      }) as Array<{
        url: string
        title: string
        words: number
        traffic: number
        keywords: number
        score: number
        issues: number
        h1: string
        source: string
        status: 'good' | 'needs-work' | 'poor'
      }>
  }, [pagesData, clean])

  const handleForceSync = async () => {
    if (!clean) return
    setSyncing(true)
    try {
      const fresh = await refreshPages(clean, market)
      qc.setQueryData(['pages', clean, market?.trim() || ''], fresh)
      await refetch()
    } catch {
      // keep cache
    } finally {
      setSyncing(false)
    }
  }

  const handleResearch = async () => {
    if (!analyzeKeyword.trim() || !clean) return
    setExaLoading(true)
    try {
      // Bias research to the active market/domain context; still competitive, not domain-only
      const data = await fetchExaSearch(`${analyzeKeyword.trim()} ${clean} OR competitors`, 8)
      setExaResults(data)
    } catch {
      setExaResults(null)
    } finally {
      setExaLoading(false)
    }
  }

  const handleAnalyze = async () => {
    if (!clean) return
    setContentLoading(true)
    setContentError(null)
    try {
      const url = analyzeUrl.trim() || `https://${clean}/`
      // Guard: only analyze URLs on this domain (or blank → homepage)
      if (url && !hostBelongsToDomain(url, clean) && !url.includes(clean)) {
        setContentError(`URL must belong to ${clean}`)
        setContentData(null)
        return
      }
      const keyword =
        analyzeKeyword.trim() ||
        url.split('/').filter(Boolean).pop()?.replace(/[-_]/g, ' ') ||
        clean
      const data = await fetchContentAnalysis(clean, keyword)
      setContentData(data)
    } catch (e) {
      setContentError(e instanceof Error ? e.message : 'Analysis failed')
      setContentData(null)
    } finally {
      setContentLoading(false)
    }
  }

  const activeSources = contentData?.activeSources || pagesData?.activeSources || []
  const dataState = pagesError
    ? 'unavailable'
    : pagesLoading
      ? 'loading'
      : pages.length
        ? pagesData?.dataState === 'cached'
          ? 'cached'
          : 'live'
        : 'unavailable'

  return (
    <div className="space-y-4 lg:space-y-5 pt-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Content Analysis</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">
            Real page inventory + opportunities for <span className="font-medium text-fg">{clean || '—'}</span>
            {activeProject?.name ? ` · ${activeProject.name}` : ''}
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          <SyncButton onClick={handleForceSync} loading={syncing || isFetching} label="Refresh pages" loadingLabel="Syncing…" />
          <DataStateBadge
            state={dataState as any}
            source={(activeSources as string[]).join(', ') || 'content'}
            fetchedAt={pagesData?.fetchedAt || (dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : null)}
          />
        </div>
      </div>

      <DomainIntegrityBar
        activeDomain={clean}
        payloadDomain={pagesData?.canonicalDomain || pagesData?.domain || clean}
        dataState={pagesData?.dataState}
        fetchedAt={pagesData?.fetchedAt}
        fromSnapshot={Boolean(pagesData?.fromSnapshot)}
        rowCount={pages.length}
        foreignDropped={Number(pagesData?.integrity?.foreignRowsDropped || 0)}
      />

      <div className="flex gap-1 bg-bg-card border border-border rounded-lg p-1 w-full sm:w-fit flex-wrap">
        {([
          { id: 'pages', label: 'Pages' },
          { id: 'gaps', label: 'Gaps' },
          { id: 'optimize', label: 'Optimize' },
          { id: 'research', label: 'Research' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 md:px-4 py-1.5 rounded text-xs md:text-sm font-medium transition-colors touch-target-reset ${
              activeTab === tab.id ? 'bg-accent text-white' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'pages' && (
        <DataCard title={`Content inventory · ${clean || 'domain'}`} dataState={dataState as any} fetchedAt={pagesData?.fetchedAt}>
          {pagesLoading && (
            <div className="animate-pulse space-y-2.5 p-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-white/[0.05]" />
              ))}
            </div>
          )}
          {!pagesLoading && pages.length === 0 && (
            <div className="text-center py-10 px-4">
              <p className="text-sm font-medium text-fg">No content pages for {clean || 'this domain'}</p>
              <p className="mt-1 text-xs text-fg-muted">
                Pull top pages from SEMrush / DataForSEO / Ahrefs. Demo Maximo rows are never shown.
              </p>
              {pagesError && <p className="mt-2 text-xs text-red-300">{pagesError instanceof Error ? pagesError.message : 'Pages API failed'}</p>}
              <button onClick={handleForceSync} className="mt-3 px-3 py-1.5 rounded-lg border border-accent/30 text-xs text-accent-light">
                Refresh pages
              </button>
            </div>
          )}

          <div className="md:hidden space-y-2.5">
            {pages.map((item) => {
              const tone = scoreTone(item.score)
              return (
                <div key={item.url} className="p-3.5 bg-bg-darkest rounded-lg border border-border card-glow">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-fg">{item.title}</p>
                      <p className="text-[11px] text-fg-dim break-all">{item.url}</p>
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${tone.pill}`}>{tone.label}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-fg-dim">
                    <span>{item.words ? `${item.words.toLocaleString()} words` : 'words —'}</span>
                    <span>KWs: {item.keywords || '—'}</span>
                    <span>Traffic: {item.traffic ? Math.round(item.traffic).toLocaleString() : '—'}</span>
                    {item.issues > 0 && <span className="text-amber-300">{item.issues} on-page</span>}
                  </div>
                  <div className="mt-2 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, item.score)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="hidden md:block overflow-x-auto table-scroll">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-fg-dim">
                  <th className="text-left py-2 px-3 font-medium">Page</th>
                  <th className="text-right py-2 px-3 font-medium">Words</th>
                  <th className="text-right py-2 px-3 font-medium">Keywords</th>
                  <th className="text-right py-2 px-3 font-medium">Traffic</th>
                  <th className="text-right py-2 px-3 font-medium">Score</th>
                  <th className="text-right py-2 px-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((item) => {
                  const tone = scoreTone(item.score)
                  return (
                    <tr key={item.url} className="border-b border-border/50 hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3">
                        <p className="text-fg font-medium">{item.title}</p>
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:text-accent-light break-all">
                          {item.url}
                        </a>
                        {item.h1 && <p className="text-[11px] text-fg-dim mt-0.5">H1: {item.h1}</p>}
                      </td>
                      <td className="py-2.5 px-3 text-right text-fg-muted tabular-nums">{item.words ? item.words.toLocaleString() : '—'}</td>
                      <td className="py-2.5 px-3 text-right text-fg-muted tabular-nums">{item.keywords || '—'}</td>
                      <td className="py-2.5 px-3 text-right text-fg-muted tabular-nums">{item.traffic ? Math.round(item.traffic).toLocaleString() : '—'}</td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, item.score)}%` }} />
                          </div>
                          <span className="text-fg-muted w-8 text-right tabular-nums">{item.score}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${tone.pill}`}>{tone.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </DataCard>
      )}

      {activeTab === 'gaps' && (
        <DataCard title="Content gap opportunities" dataState={gapsLoading ? 'loading' : gapsError ? 'unavailable' : gaps.length ? 'live' : 'unavailable'} fetchedAt={null}>
          {gapsLoading && (
            <div className="animate-pulse space-y-2 p-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-xl bg-white/[0.05]" />
              ))}
            </div>
          )}
          {!gapsLoading && gaps.length === 0 && (
            <div className="text-center py-10 px-4">
              <p className="text-sm font-medium text-fg">No gap signals for {clean || 'this domain'}</p>
              <p className="mt-1 text-xs text-fg-muted">
                Gaps are derived from this domain&apos;s competitor aggregate — not generic SEO demo adhesives.
              </p>
              {gapsError && <p className="mt-2 text-xs text-red-300">{gapsError}</p>}
            </div>
          )}
          <div className="space-y-2">
            {gaps.map((gap, i) => (
              <motion.div
                key={`${gap.keyword}-${i}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 bg-bg-darkest rounded-lg border border-border"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">{gap.keyword}</p>
                    {gap.competitor && <p className="text-[11px] text-fg-dim mt-0.5">vs {gap.competitor}</p>}
                    <p className="text-xs text-fg-muted mt-1">{gap.gap}</p>
                  </div>
                  <div className="text-right shrink-0 text-xs text-fg-muted">
                    {gap.volume != null && <p>Vol: {Number(gap.volume).toLocaleString()}</p>}
                    {gap.difficulty != null && <p>Signal: {gap.difficulty}</p>}
                    {gap.source && <p className="text-[10px] text-fg-dim mt-1">{gap.source}</p>}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </DataCard>
      )}

      {activeTab === 'optimize' && (
        <div className="space-y-4">
          <DataCard title="On-page optimizer" dataState={contentLoading ? 'loading' : contentData ? 'live' : 'unavailable'}>
            <div className="space-y-4">
              <p className="text-xs text-fg-muted">
                Analyze a URL on <span className="text-fg font-medium">{clean}</span> only. Foreign URLs are rejected.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder={`https://${clean || 'example.com'}/page`}
                  value={analyzeUrl}
                  onChange={(e) => setAnalyzeUrl(e.target.value)}
                  className="flex-1 bg-bg-darkest border border-border rounded-lg px-3 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent"
                />
                <input
                  type="text"
                  placeholder="Focus keyword (optional)"
                  value={analyzeKeyword}
                  onChange={(e) => setAnalyzeKeyword(e.target.value)}
                  className="sm:w-48 bg-bg-darkest border border-border rounded-lg px-3 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent"
                />
                <button
                  onClick={handleAnalyze}
                  disabled={contentLoading || !clean}
                  className="bg-accent hover:bg-accent/80 text-white text-sm px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {contentLoading ? 'Analyzing…' : 'Analyze'}
                </button>
              </div>
              {contentError && <p className="text-xs text-red-300">{contentError}</p>}

              {contentData?.thorbit?.suggestions && contentData.thorbit.suggestions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-fg">Suggestions</h4>
                    <span className="text-[10px] bg-pink-500/20 text-pink-300 border border-pink-500/30 px-1.5 py-0.5 rounded">Thorbit</span>
                  </div>
                  {contentData.thorbit.suggestions.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 bg-bg-darkest rounded-lg border border-border">
                      <span className="text-accent mt-0.5">•</span>
                      <p className="text-xs md:text-sm text-fg-muted">{s}</p>
                    </div>
                  ))}
                </div>
              )}

              {contentData?.exa && (
                <div className="text-xs text-fg-dim">
                  Exa sources active: own/competitive content attached for this domain analysis.
                </div>
              )}

              {!contentData && !contentLoading && !contentError && (
                <div className="text-center py-8 text-fg-muted text-sm">
                  Run analyze on a page of this project to get real suggestions. No canned maximo-seo demo content.
                </div>
              )}
            </div>
          </DataCard>
        </div>
      )}

      {activeTab === 'research' && (
        <DataCard title="Competitive content research" dataState={exaLoading ? 'loading' : exaResults ? 'live' : 'unavailable'}>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Topic to research (e.g. technical SEO checklist)"
                value={analyzeKeyword}
                onChange={(e) => setAnalyzeKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleResearch()}
                className="flex-1 bg-bg-darkest border border-border rounded-lg px-3 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleResearch}
                disabled={exaLoading || !clean}
                className="bg-accent hover:bg-accent/80 text-white text-sm px-4 py-2.5 rounded-lg disabled:opacity-50"
              >
                {exaLoading ? 'Searching…' : 'Research'}
              </button>
            </div>
            {Array.isArray(exaResults?.results) && exaResults.results.length > 0 && (
              <div className="space-y-2">
                {exaResults.results.map((r: any, i: number) => (
                  <motion.div
                    key={r.url || i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3.5 bg-bg-darkest rounded-lg border border-border"
                  >
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-accent hover:text-accent-light line-clamp-1">
                      {r.title || r.url}
                    </a>
                    <p className="text-[11px] text-fg-dim mt-0.5 truncate">{r.url}</p>
                    {r.text && <p className="text-xs text-fg-muted mt-1 line-clamp-2">{String(r.text).slice(0, 220)}</p>}
                  </motion.div>
                ))}
              </div>
            )}
            {!exaResults && !exaLoading && (
              <div className="text-center py-8 text-sm text-fg-muted">
                Semantic research via Exa for topics relevant to {clean || 'this project'}.
              </div>
            )}
          </div>
        </DataCard>
      )}
    </div>
  )
}
