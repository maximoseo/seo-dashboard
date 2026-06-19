import { useState } from 'react'
import { DataCard } from '@/components/DataCard'
import { useSEO } from '@/contexts/SEOContext'

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
  const [activeTab, setActiveTab] = useState<'pages' | 'gaps' | 'optimize'>('pages')

  return (
    <div className="space-y-6 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-fg">Content Analysis</h2>
          <p className="text-sm text-fg-muted mt-0.5">Content optimization and gap analysis for {domain}</p>
        </div>
        <div className="flex gap-1.5">
          <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-1 rounded">DataForSEO</span>
          <span className="text-xs bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-1 rounded">SEMrush</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg-card border border-border rounded-lg p-1 w-fit">
        {(['pages', 'gaps', 'optimize'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors capitalize ${
              activeTab === tab ? 'bg-accent text-white' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {tab === 'gaps' ? 'Content Gaps' : tab === 'optimize' ? 'Optimize' : 'Pages'}
          </button>
        ))}
      </div>

      {activeTab === 'pages' && (
        <DataCard title="Content Performance" sources={['DataForSEO']}>
          <div className="overflow-x-auto">
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
                      <span className={`text-xs px-1.5 py-0.5 rounded ${item.issues > 5 ? 'bg-red-500/20 text-red-300' : item.issues > 2 ? 'bg-yellow-500/20 text-yellow-300' : 'bg-green-500/20 text-green-300'}`}>
                        {item.issues}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
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
        <DataCard title="Content Gap Opportunities" sources={['SEMrush', 'DataForSEO']}>
          <div className="overflow-x-auto">
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
                      <span className={`text-xs px-1.5 py-0.5 rounded ${gap.difficulty < 35 ? 'bg-green-500/20 text-green-300' : gap.difficulty < 50 ? 'bg-yellow-500/20 text-yellow-300' : 'bg-red-500/20 text-red-300'}`}>
                        {gap.difficulty}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${gap.gap === 'Missing' ? 'bg-red-500/20 text-red-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
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
        <DataCard title="Content Optimizer" sources={['DataForSEO', 'KW Everywhere']}>
          <div className="text-center py-8 text-fg-muted">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mx-auto mb-3 opacity-30">
              <path d="M8 8h24M8 16h16M8 24h20M8 32h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className="text-sm mb-3">Enter a URL to analyze and optimize</p>
            <input
              type="text"
              placeholder="https://maximo-seo.ai/blog/..."
              className="bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent w-80"
            />
            <button className="ml-2 bg-accent hover:bg-accent/80 text-white text-sm px-4 py-2 rounded-lg transition-colors">
              Analyze
            </button>
          </div>
        </DataCard>
      )}
    </div>
  )
}
