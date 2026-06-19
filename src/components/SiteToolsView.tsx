'use client';

import { useState } from 'react';
import type { Site, SiteMetrics } from '@/types';
import { seoTools, toolCategories } from '@/lib/seo-tools';
import { ToolRunner } from './ToolRunner';

interface SiteToolsViewProps {
  site: Site;
  metrics: SiteMetrics;
  toolStatuses: Record<string, boolean>;
}

type TabKey = 'overview' | 'serp' | 'keywords' | 'backlinks' | 'technical' | 'local' | 'content' | 'monitoring';

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'overview', label: 'Overview', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
  { key: 'serp', label: 'SERP & Rankings', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  { key: 'keywords', label: 'Keywords', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' },
  { key: 'backlinks', label: 'Backlinks', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
  { key: 'technical', label: 'Technical', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { key: 'local', label: 'Local SEO', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z' },
  { key: 'content', label: 'Content', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'monitoring', label: 'Monitoring', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' },
];

const tabToolMapping: Record<TabKey, string[]> = {
  overview: [],
  serp: ['serpapi', 'dataforseo', 'semrush', 'seranking', 'serpstat', 'brave-search'],
  keywords: ['keywords-everywhere', 'mangools', 'topicalmap', 'answerthepublic', 'morningscore'],
  backlinks: ['ahrefs', 'semrush', 'seranking'],
  technical: ['gtmetrix', 'browserless', 'firecrawl'],
  local: ['google-maps', 'google-places', 'mcpscraper', 'callrail'],
  content: ['frase', 'supadata', 'topicalmap'],
  monitoring: ['betteruptime', 'macroscope', 'sentry', 'omega-indexer'],
};

function OverviewTab({ site, metrics }: { site: Site; metrics: SiteMetrics }) {
  const capabilitySummary = [
    { label: 'SERP & Rankings', tools: tabToolMapping.serp, color: '#8b5cf6' },
    { label: 'Keyword Research', tools: tabToolMapping.keywords, color: '#ec4899' },
    { label: 'Backlink Analysis', tools: tabToolMapping.backlinks, color: '#f59e0b' },
    { label: 'Technical SEO', tools: tabToolMapping.technical, color: '#10b981' },
    { label: 'Local SEO', tools: tabToolMapping.local, color: '#14b8a6' },
    { label: 'Content Optimization', tools: tabToolMapping.content, color: '#6366f1' },
    { label: 'Monitoring & Indexing', tools: tabToolMapping.monitoring, color: '#ef4444' },
  ];

  return (
    <div className="space-y-6">
      <div className="glass rounded-xl p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
            <span className="text-xl font-bold text-white">{site.name.charAt(0)}</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-primary">{site.name}</h3>
            <a
              href={`https://${site.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary-light underline decoration-primary-light/35 hover:decoration-primary-light"
            >
              {site.domain}
            </a>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <QuickStat label="Domain Authority" value={`${metrics.domainAuthority ?? '—'}/100`} color="text-violet-400" />
          <QuickStat label="Organic Traffic" value={`${(metrics.organicTraffic ?? 0).toLocaleString()}/mo`} color="text-emerald-400" />
          <QuickStat label="Keywords" value={(metrics.totalKeywords ?? 0).toLocaleString()} color="text-pink-400" />
          <QuickStat label="Backlinks" value={(metrics.totalBacklinks ?? 0).toLocaleString()} color="text-amber-400" />
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
          Available Capabilities for {site.domain}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {capabilitySummary.map((cap) => {
            const tools = cap.tools.map((id) => seoTools.find((t) => t.id === id)).filter(Boolean);
            const allCaps = tools.flatMap((t) => t!.capabilities);
            const uniqueCaps = [...new Set(allCaps)];

            return (
              <div key={cap.label} className="glass rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: cap.color }}
                  />
                  <h4 className="text-sm font-semibold text-text-primary">{cap.label}</h4>
                </div>
                <p className="text-xs text-text-muted mb-2">
                  {tools.length} tools connected
                </p>
                <div className="flex flex-wrap gap-1">
                  {uniqueCaps.slice(0, 6).map((c) => (
                    <span
                      key={c}
                      className="rounded-md px-1.5 py-0.5 text-[10px]"
                      style={{ background: `${cap.color}15`, color: cap.color }}
                    >
                      {c}
                    </span>
                  ))}
                  {uniqueCaps.length > 6 && (
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-text-muted">
                      +{uniqueCaps.length - 6}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function QuickStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-3">
      <p className={`stat-value text-lg font-bold ${color}`}>{value}</p>
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  );
}

function ToolTab({ toolIds, site, toolStatuses }: { toolIds: string[]; site: Site; toolStatuses: Record<string, boolean> }) {
  return (
    <div className="space-y-4">
      {toolIds.map((id) => (
        <ToolRunner key={id} site={site} toolId={id} toolStatuses={toolStatuses} />
      ))}
    </div>
  );
}

export function SiteToolsView({ site, metrics, toolStatuses }: SiteToolsViewProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-primary text-white shadow-glow'
                : 'glass text-text-muted hover:text-text-primary'
            }`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab site={site} metrics={metrics} />}
      {activeTab !== 'overview' && (
        <ToolTab toolIds={tabToolMapping[activeTab]} site={site} toolStatuses={toolStatuses} />
      )}
    </div>
  );
}
