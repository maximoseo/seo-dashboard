'use client';

import type { Site } from '@/types';

interface SiteSelectorProps {
  sites: Site[];
  selectedSiteId: string | null;
  onSelect: (siteId: string) => void;
  onAddSite: () => void;
}

export function SiteSelector({ sites, selectedSiteId, onSelect, onAddSite }: SiteSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Your Sites</h2>
        <button
          onClick={onAddSite}
          className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary-light transition-all hover:bg-primary/20 hover:-translate-y-0.5 hover:shadow-glow"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Site
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sites.map((site) => (
          <button
            key={site.id}
            onClick={() => onSelect(site.id)}
            className={`glass group flex items-center gap-3 rounded-xl p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-glow ${
              selectedSiteId === site.id
                ? 'border-primary bg-primary/10 shadow-glow'
                : ''
            }`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/30 to-accent/20">
              <span className="text-sm font-bold text-primary-light">
                {site.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text-primary">{site.name}</p>
              <p className="truncate text-xs text-text-muted">{site.domain}</p>
            </div>
            {selectedSiteId === site.id && (
              <div className="ml-auto h-2 w-2 shrink-0 rounded-full bg-primary pulse-glow" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
