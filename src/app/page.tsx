'use client';

import { useState } from 'react';
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

  const selectedSite = sites.find((s) => s.id === selectedSiteId) ?? null;
  const selectedMetrics = selectedSiteId ? metrics[selectedSiteId] : null;

  function handleAddSite(site: Site) {
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
  }

  return (
    <div className="min-h-screen">
      <Header siteCount={sites.length} toolCount={seoTools.length} />

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
                <SiteToolsView site={selectedSite} metrics={selectedMetrics} />
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
