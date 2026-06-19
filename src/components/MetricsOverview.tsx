'use client';

import type { SiteMetrics } from '@/types';

interface MetricsOverviewProps {
  metrics: SiteMetrics;
  siteName: string;
}

const metricCards = [
  {
    key: 'domainAuthority' as const,
    label: 'Domain Authority',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    format: (v: number) => `${v}/100`,
    color: 'from-violet-500 to-purple-600',
  },
  {
    key: 'organicTraffic' as const,
    label: 'Organic Traffic',
    icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
    format: (v: number) => v.toLocaleString(),
    suffix: '/mo',
    color: 'from-emerald-500 to-green-600',
  },
  {
    key: 'totalKeywords' as const,
    label: 'Tracked Keywords',
    icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
    format: (v: number) => v.toLocaleString(),
    color: 'from-pink-500 to-rose-600',
  },
  {
    key: 'totalBacklinks' as const,
    label: 'Backlinks',
    icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
    format: (v: number) => v.toLocaleString(),
    color: 'from-amber-500 to-orange-600',
  },
  {
    key: 'pageSpeed' as const,
    label: 'Page Speed',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
    format: (v: number) => `${v}`,
    suffix: '/100',
    color: 'from-cyan-500 to-blue-600',
  },
  {
    key: 'indexedPages' as const,
    label: 'Indexed Pages',
    icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
    format: (v: number) => v.toLocaleString(),
    color: 'from-indigo-500 to-violet-600',
  },
  {
    key: 'uptimePercent' as const,
    label: 'Uptime',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    format: (v: number) => `${v}`,
    suffix: '%',
    color: 'from-green-500 to-emerald-600',
  },
];

export function MetricsOverview({ metrics, siteName }: MetricsOverviewProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
          SEO Overview — {siteName}
        </h2>
        {metrics.lastCrawled && (
          <span className="text-xs text-text-muted">
            Last crawled: {new Date(metrics.lastCrawled).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {metricCards.map((card, i) => {
          const value = metrics[card.key];
          if (value === undefined) return null;
          return (
            <div
              key={card.key}
              className="glass group rounded-xl p-4 transition-all hover:-translate-y-1 hover:shadow-glow stagger-item"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className={`mb-2 inline-flex rounded-lg bg-gradient-to-br ${card.color} p-2`}>
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
                </svg>
              </div>
              <div className="stat-value text-xl font-bold text-text-primary">
                {card.format(value)}
                {card.suffix && <span className="text-sm font-normal text-text-muted">{card.suffix}</span>}
              </div>
              <p className="mt-1 text-xs text-text-muted">{card.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
