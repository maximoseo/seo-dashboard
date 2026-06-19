'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Site, SiteMetrics } from '@/types';
import { seoTools } from '@/lib/seo-tools';
import { demoSites, demoMetrics } from '@/lib/demo-sites';
import { Header } from '@/components/Header';
import { SiteSelector } from '@/components/SiteSelector';
import { MetricsOverview } from '@/components/MetricsOverview';
import { SiteToolsView } from '@/components/SiteToolsView';
import { ToolsGrid } from '@/components/ToolsGrid';
import { AddSiteModal } from '@/components/AddSiteModal';

export default function HomePage() {
  const [sites, setSites] = useState<Site[]>(demoSites);
  const [metrics, setMetrics] = useState<Record<string, SiteMetrics>>(demoMetrics);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(demoSites[0]?.id ?? null);
  const [showAddSite, setShowAddSite] = useState(false);
  const [view, setView] = useState<'sites' | 'tools'>('sites');
  const [toolStatuses, setToolStatuses] = useState<Record<string, boolean>>({});

  const selectedSite = sites.find((s) => s.id === selectedSiteId) ?? null;
  const selectedMetrics = selectedSiteId ? metrics[selectedSiteId] : null;

  // Fetch tool API key status from server
  useEffect(() => {
    fetch('/api/tools/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.status) setToolStatuses(data.status);
      })
      .catch(() => {
        // Silently ignore — tools will show as not configured
      });
  }, []);

  const handleAddSite = useCallback(async (site: Site) => {
    // Try to save via API
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: site.name, domain: site.domain }),
      });
      const data = await res.json();
      if (data.site) {
        const savedSite: Site = {
          id: data.site.id,
          name: data.site.name,
          domain: data.site.domain,
          addedAt: data.site.addedAt,
        };
        setSites((prev) => [...prev, savedSite]);
        setMetrics((prev) => ({
          ...prev,
          [savedSite.id]: {
            siteId: savedSite.id,
            domainAuthority: 0,
            organicTraffic: 0,
            totalKeywords: 0,
            totalBacklinks: 0,
            pageSpeed: 0,
            indexedPages: 0,
            uptimePercent: 0,
          },
        }));
        setSelectedSiteId(savedSite.id);
        return;
      }
    } catch {
      // Fall back to local
    }

    setSites((prev) => [...prev, site]);
    setMetrics((prev) => ({
      ...prev,
      [site.id]: {
        siteId: site.id,
        domainAuthority: 0,
        organicTraffic: 0,
        totalKeywords: 0,
        totalBacklinks: 0,
        pageSpeed: 0,
        indexedPages: 0,
        uptimePercent: 0,
      },
    }));
    setSelectedSiteId(site.id);
  }, []);

  const configuredCount = Object.values(toolStatuses).filter(Boolean).length;

  return (
    <div className="min-h-screen">
      <Header siteCount={sites.length} toolCount={seoTools.length} />

      {/* API Key Banner */}
      {configuredCount === 0 && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4">
          <div className="glass rounded-xl border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-start gap-3">
              <svg className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-300">No API keys configured</p>
                <p className="text-xs text-text-muted mt-1">
                  Set environment variables (e.g. SERPAPI_KEY, FIRECRAWL_API_KEY) to enable running SEO analysis tools.
                  Tools will show &quot;Key Missing&quot; until their API keys are configured.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* View toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('sites')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              view === 'sites'
                ? 'bg-primary text-white shadow-glow'
                : 'glass text-text-muted hover:text-text-primary'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              Sites Dashboard
            </span>
          </button>
          <button
            onClick={() => setView('tools')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              view === 'tools'
                ? 'bg-primary text-white shadow-glow'
                : 'glass text-text-muted hover:text-text-primary'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              All SEO Tools
              {configuredCount > 0 && (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono text-emerald-400">
                  {configuredCount} active
                </span>
              )}
            </span>
          </button>
        </div>

        {view === 'sites' ? (
          <>
            <SiteSelector
              sites={sites}
              selectedSiteId={selectedSiteId}
              onSelect={setSelectedSiteId}
              onAddSite={() => setShowAddSite(true)}
            />

            {selectedSite && selectedMetrics && (
              <>
                <MetricsOverview metrics={selectedMetrics} siteName={selectedSite.name} />
                <SiteToolsView site={selectedSite} metrics={selectedMetrics} toolStatuses={toolStatuses} />
              </>
            )}

            {!selectedSite && (
              <div className="glass rounded-xl p-12 text-center">
                <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/20">
                  <svg className="h-8 w-8 text-primary-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-text-primary">Select a site to get started</h3>
                <p className="mt-1 text-sm text-text-muted">
                  Choose a site above or add a new one to see its SEO capabilities
                </p>
              </div>
            )}
          </>
        ) : (
          <ToolsGrid />
        )}
      </main>

      <AddSiteModal
        open={showAddSite}
        onClose={() => setShowAddSite(false)}
        onAdd={handleAddSite}
      />
    </div>
  );
}
