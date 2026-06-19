import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { DataCard } from '@/components/DataCard'
import { useSEO } from '@/contexts/SEOContext'
import { fetchContentAnalysis, fetchExaSearch, type ContentAnalysis } from '@/services/seoApi'

const contentItems = [
  { url: '/blog/seo-guide', title: 'Complete SEO Guide 2024', words: 3200, score: 82, issues: 2, status: 'good' },
  { url: '/blog/keyword-research', title: 'Keyword Research Tutorial', words: 1800, score: 61, issues: 5, status: 'needs-work' },
  { url: '/services/seo-audit', title: 'SEO Audit Services', words: 950, score: 45, issues: 8, status: 'poor' },
  { url: '/blog/backlink-building', title: 'Backlink Building Strategies', words: 2400, score: 74, issues: 3, status: 'good' },
  { url: '/about', title: 'About Maximo SEO', words: 620, score: 38, issues: 11, status: 'poor' },
]

const contentGaps = [
  { keyword: 'technical seo checklist', volume: 8100, difficulty: 42, gap: 'Missing' },
  { keyword: 'seo tools comparison', volume: 5400, difficulty: 55, gap: 'Thin content' },
  { keyword: 'local seo guide', volume: 12000, difficulty: 38, gap: 'Missing' },
  { keyword: 'seo reporting template', volume: 3600, difficulty: 29, gap: 'Missing' },
  { keyword: 'core web vitals optimization', volume: 4800, difficulty: 47, gap: 'Thin content' },
]

export default function ContentPage() {
  const { domain } = useSEO()
  const [activeTab, setActiveTab] = useState<'pages' | 'gaps' | 'optimize' | 'research'>('pages')
  const [contentData, setContentData] = useState<ContentAnalysis | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [exaResults, setExaResults] = useState<any>(null)
  const [exaLoading, setExaLoading] = useState(false)
  const [analyzeUrl, setAnalyzeUrl] = useState('')
  const [analyzeKeyword, setAnalyzeKeyword] = useState('')

  // Load content analysis on mount
  useEffect(() => {
    setContentLoading(true)
    fetchContentAnalysis(domain)
      .then(data => setContentData(data))
      .catch(() => setContentData(null))
      .finally(() => setContentLoading(false))
  }, [domain])

  const handleResearch = async () => {
    if (!analyzeKeyword.trim()) return
    setExaLoading(true)
    try {
      const data = await fetchExaSearch(`best ${analyzeKeyword} guide blog post`, 8)
      setExaResults(data)
    } catch {
      setExaResults(null)
    } finally {
      setExaLoading(false)
    }
  }

  const handleAnalyze = async () => {
    if (!analyzeUrl.trim()) return
    setContentLoading(true)
    try {
      const keyword = analyzeUrl.split('/').pop()?.replace(/-/g, ' ') || ''
      const data = await fetchContentAnalysis(domain, keyword)
      setContentData(data)
    } catch {
      // keep existing data
    } finally {
      setContentLoading(false)
    }
  }

  const activeSources = contentData?.activeSources || []

  return (
    <div className="space-y-4 lg:space-y-5 pt-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Content Analysis</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">Content optimization and gap analysis for {domain}</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <span className="text-[11px] md:text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded touch-target-reset">Exa</span>
          <span className="text-[11px] md:text-xs bg-pink-500/20 text-pink-300 border border-pink-500/30 px-2 py-1 rounded touch-target-reset">Thorbit</span>
          <span className="text-[11px] md:text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-1 rounded touch-target-reset">DataForSEO</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg-card border border-border rounded-lg p-1 w-full sm:w-fit flex-wrap">
        {(['pages', 'gaps', 'optimize', 'research'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 md:px-4 py-1.5 rounded text-xs md:text-sm font-medium transition-colors capitalize touch-target-reset ${
              activeTab === tab ? 'bg-accent text-white' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {tab === 'gaps' ? 'Content Gaps' : tab === 'optimize' ? 'Optimize' : tab === 'research' ? 'Research' : 'Pages'}
          </button>
        ))}
      </div>

      {activeTab === 'pages' && (
        <DataCard title="Content Performance" sources={['DataForSEO', 'Thorbit']}>
          {/* Mobile card view */}
          <div className="md:hidden space-y-2.5">
            {contentItems.map((item, i) => (
              <div key={i} className="p-3.5 bg-bg-darkest rounded-lg border border-border card-glow">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">{item.title}</p>
                    <p className="text-[11px] text-fg-dim">{item.url}</p>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 touch-target-reset ${
                    item.status === 'good' ? 'bg-green-500/20 text-green-300' :
                    item.status === 'needs-work' ? 'bg-yellow-500/20 text-yellow-300' :
                    'bg-red-500/20 text-red-300'
                  }`}>
                    {item.status === 'needs-work' ? 'Needs Work' : item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-fg-dim">
                  <span>{item.words.toLocaleString()} words</span>
                  <span>Score: <span className="text-fg-muted font-medium">{item.score}</span></span>
                  <span className={`px-1.5 py-0.5 rounded ${item.issues > 5 ? 'bg-red-500/20 text-red-300' : item.issues > 2 ? 'bg-yellow-500/20 text-yellow-300' : 'bg-green-500/20 text-green-300'}`}>
                    {item.issues} issues
                  </span>
                </div>
                <div className="mt-2 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.score >= 70 ? 'bg-green-400' : item.score >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                    style={{ width: `${item.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-fg-dim font-medium">Page</th>
                  <th className="text-right py-2 px-3 text-fg-dim font-medium">Words</th>
                  <th className="text-right py-2 px-3 text-fg-dim font-medium">Score</th>
                  <th className="text-right py-2 px-3 text-fg-dim font-medium">Issues</th>
                  <th className="text-right py-2 px-3 text-fg-dim font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {contentItems.map((item, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3">
                      <p className="text-fg font-medium">{item.title}</p>
                      <p className="text-xs text-fg-dim">{item.url}</p>
                    </td>
                    <td className="py-2.5 px-3 text-right text-fg-muted">{item.words.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${item.score >= 70 ? 'bg-green-400' : item.score >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                            style={{ width: `${item.score}%` }}
                          />
                        </div>
                        <span className="text-fg-muted w-8 text-right">{item.score}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`text-xs px-1.5 py-0.5 rounded touch-target-reset ${item.issues > 5 ? 'bg-red-500/20 text-red-300' : item.issues > 2 ? 'bg-yellow-500/20 text-yellow-300' : 'bg-green-500/20 text-green-300'}`}>
                        {item.issues}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full touch-target-reset ${
                        item.status === 'good' ? 'bg-green-500/20 text-green-300' :
                        item.status === 'needs-work' ? 'bg-yellow-500/20 text-yellow-300' :
                        'bg-red-500/20 text-red-300'
                      }`}>
                        {item.status === 'needs-work' ? 'Needs Work' : item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataCard>
      )}

      {activeTab === 'gaps' && (
        <DataCard title="Content Gap Opportunities" sources={['SEMrush', 'DataForSEO', 'Exa']}>
          {/* Mobile card view */}
          <div className="md:hidden space-y-2.5">
            {contentGaps.map((gap, i) => (
              <div key={i} className="p-3.5 bg-bg-darkest rounded-lg border border-border card-glow">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-medium text-fg">{gap.keyword}</p>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 touch-target-reset ${gap.gap === 'Missing' ? 'bg-red-500/20 text-red-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                    {gap.gap}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-fg-dim">
                  <span>Vol: <span className="text-fg-muted font-medium">{gap.volume.toLocaleString()}</span></span>
                  <span className={`px-1.5 py-0.5 rounded ${gap.difficulty < 35 ? 'bg-green-500/20 text-green-300' : gap.difficulty < 50 ? 'bg-yellow-500/20 text-yellow-300' : 'bg-red-500/20 text-red-300'}`}>
                    KD: {gap.difficulty}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-fg-dim font-medium">Keyword</th>
                  <th className="text-right py-2 px-3 text-fg-dim font-medium">Volume</th>
                  <th className="text-right py-2 px-3 text-fg-dim font-medium">Difficulty</th>
                  <th className="text-right py-2 px-3 text-fg-dim font-medium">Gap Type</th>
                </tr>
              </thead>
              <tbody>
                {contentGaps.map((gap, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3 text-fg font-medium">{gap.keyword}</td>
                    <td className="py-2.5 px-3 text-right text-fg-muted">{gap.volume.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`text-xs px-1.5 py-0.5 rounded touch-target-reset ${gap.difficulty < 35 ? 'bg-green-500/20 text-green-300' : gap.difficulty < 50 ? 'bg-yellow-500/20 text-yellow-300' : 'bg-red-500/20 text-red-300'}`}>
                        {gap.difficulty}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full touch-target-reset ${gap.gap === 'Missing' ? 'bg-red-500/20 text-red-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                        {gap.gap}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataCard>
      )}

      {activeTab === 'optimize' && (
        <div className="space-y-4 lg:space-y-5">
          <DataCard title="Content Optimizer" sources={['Thorbit', 'DataForSEO']} loading={contentLoading}>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="https://maximo-seo.ai/blog/..."
                  value={analyzeUrl}
                  onChange={e => setAnalyzeUrl(e.target.value)}
                  className="flex-1 bg-bg-darkest border border-border rounded-lg px-3 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent"
                />
                <button
                  onClick={handleAnalyze}
                  className="bg-accent hover:bg-accent/80 text-white text-sm px-4 py-2.5 rounded-lg transition-colors touch-target-reset"
                >
                  Analyze
                </button>
              </div>

              {/* Thorbit suggestions */}
              {contentData?.thorbit?.suggestions && contentData.thorbit.suggestions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs md:text-sm font-medium text-fg">Optimization Suggestions</h4>
                    <span className="text-[10px] bg-pink-500/20 text-pink-300 border border-pink-500/30 px-1.5 py-0.5 rounded touch-target-reset">Thorbit</span>
                  </div>
                  {contentData.thorbit.suggestions.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 md:p-2.5 bg-bg-darkest rounded-lg border border-border card-glow">
                      <span className="text-accent mt-0.5">&#x2022;</span>
                      <p className="text-xs md:text-sm text-fg-muted">{s}</p>
                    </div>
                  ))}
                </div>
              )}

              {!contentData?.thorbit?.suggestions?.length && !contentLoading && (
                <div className="text-center py-6 text-fg-muted">
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mx-auto mb-3 opacity-30">
                    <path d="M8 8h24M8 16h16M8 24h20M8 32h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <p className="text-xs md:text-sm">Enter a URL above to get AI-powered content optimization suggestions</p>
                </div>
              )}
            </div>
          </DataCard>

          {/* Active sources indicator */}
          {activeSources.length > 0 && (
            <div className="bg-bg-card border border-border rounded-xl p-3.5 md:p-3 card-glow">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] md:text-xs text-fg-dim">Data from:</span>
                {activeSources.map(s => (
                  <span key={s} className="text-[10px] bg-accent/10 text-accent-light border border-accent/20 px-1.5 py-0.5 rounded touch-target-reset">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'research' && (
        <div className="space-y-4 lg:space-y-5">
          <DataCard title="Competitive Content Research" sources={['Exa']} loading={exaLoading}>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Enter a topic to research (e.g., 'technical SEO')"
                  value={analyzeKeyword}
                  onChange={e => setAnalyzeKeyword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleResearch()}
                  className="flex-1 bg-bg-darkest border border-border rounded-lg px-3 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent"
                />
                <button
                  onClick={handleResearch}
                  disabled={exaLoading}
                  className="bg-accent hover:bg-accent/80 text-white text-sm px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50 touch-target-reset"
                >
                  {exaLoading ? 'Searching...' : 'Research'}
                </button>
              </div>

              {exaResults?.results && exaResults.results.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs md:text-sm font-medium text-fg">Top Competing Content</h4>
                  {exaResults.results.map((r: any, i: number) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="p-3.5 md:p-3 bg-bg-darkest rounded-lg border border-border hover:border-border-light transition-colors card-glow"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs md:text-sm font-medium text-accent hover:text-accent-light transition-colors line-clamp-1">
                            {r.title || r.url}
                          </a>
                          <p className="text-[11px] md:text-xs text-fg-dim mt-0.5 truncate">{r.url}</p>
                          {r.text && <p className="text-[11px] md:text-xs text-fg-muted mt-1 line-clamp-2">{r.text.slice(0, 200)}</p>}
                        </div>
                        {r.score && (
                          <span className="text-[11px] md:text-xs bg-accent/10 text-accent-light px-1.5 py-0.5 rounded shrink-0 touch-target-reset">
                            {(r.score * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {!exaResults && !exaLoading && (
                <div className="text-center py-8 text-fg-muted">
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mx-auto mb-3 opacity-30">
                    <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="2" />
                    <path d="M20 12v8l5 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <p className="text-xs md:text-sm">Search for a topic to find top-performing content from competitors</p>
                  <p className="text-[11px] md:text-xs text-fg-dim mt-1">Powered by Exa semantic search</p>
                </div>
              )}
            </div>
          </DataCard>
        </div>
      )}
    </div>
  )
}
