'use client';

import { useState, useCallback } from 'react';
import type { Site } from '@/types';
import { seoTools, toolCategories } from '@/lib/seo-tools';

interface ToolRunnerProps {
  site: Site;
  toolId: string;
  toolStatuses: Record<string, boolean>;
}

export function ToolRunner({ site, toolId, toolStatuses }: ToolRunnerProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tool = seoTools.find((t) => t.id === toolId);
  const isConfigured = toolStatuses[toolId] ?? false;
  const category = tool ? toolCategories[tool.category] : null;

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/tools/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: site.domain, toolId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
        return;
      }

      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [site.domain, toolId]);

  if (!tool || !category) return null;

  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-start gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${category.color}22` }}
        >
          <svg
            className="h-6 w-6"
            style={{ color: category.color }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={tool.icon} />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-text-primary">{tool.name}</h3>
            <div className="flex items-center gap-1">
              <div className={`h-2 w-2 rounded-full ${isConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className={`text-[10px] ${isConfigured ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isConfigured ? 'API Key Set' : 'Key Missing'}
              </span>
            </div>
          </div>
          <p className="text-sm text-text-muted mb-3">{tool.description}</p>

          <div className="mb-3">
            <div className="flex flex-wrap gap-1.5">
              {tool.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="rounded-md px-2 py-1 text-xs"
                  style={{ background: `${category.color}15`, color: category.color }}
                >
                  {cap}
                </span>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={runAnalysis}
          disabled={loading || !isConfigured}
          className="shrink-0 rounded-lg bg-primary/10 px-4 py-2 text-xs font-medium text-primary-light transition-all hover:bg-primary/20 hover:-translate-y-0.5 hover:shadow-glow disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {loading ? (
            <span className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Running...
            </span>
          ) : (
            'Run Analysis'
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/30 p-3">
          <p className="text-xs font-medium text-red-400">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-3 rounded-lg bg-white/5 border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Results for {site.domain}
            </h4>
            <span className="text-[10px] text-emerald-400">Completed</span>
          </div>
          <ResultRenderer toolId={toolId} result={result} />
        </div>
      )}
    </div>
  );
}

function ResultRenderer({ toolId, result }: { toolId: string; result: Record<string, unknown> }) {
  // Render specific layouts for known tools, fallback to JSON
  if (toolId === 'serpapi') return <SerpApiResult data={result} />;
  if (toolId === 'firecrawl') return <FirecrawlResult data={result} />;
  if (toolId === 'gtmetrix') return <GtmetrixResult data={result} />;
  if (toolId === 'brave-search') return <BraveResult data={result} />;
  if (toolId === 'google-maps') return <GoogleMapsResult data={result} />;
  return <JsonResult data={result} />;
}

function SerpApiResult({ data }: { data: Record<string, unknown> }) {
  const topResults = data.topResults as Array<Record<string, unknown>> | undefined;
  const relatedSearches = data.relatedSearches as string[] | undefined;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Total Results" value={String(data.totalResults ?? '—')} />
        <StatBox label="Time Taken" value={`${data.timeTaken ?? '—'}s`} />
      </div>
      {topResults && topResults.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Top Results</p>
          {topResults.map((r, i) => (
            <div key={i} className="flex items-baseline gap-2 py-1 border-b border-border/30 last:border-0">
              <span className="stat-value text-xs text-primary-light">#{String(r.position)}</span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-text-primary truncate">{String(r.title ?? '')}</p>
                <p className="text-[10px] text-text-muted truncate">{String(r.link ?? '')}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {relatedSearches && relatedSearches.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Related Searches</p>
          <div className="flex flex-wrap gap-1">
            {relatedSearches.map((s) => (
              <span key={s} className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] text-primary-light">{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FirecrawlResult({ data }: { data: Record<string, unknown> }) {
  const meta = data.metadata as Record<string, unknown> | undefined;
  const siteMapSample = data.siteMapSample as string[] | undefined;
  return (
    <div className="space-y-2">
      {meta && (
        <div className="rounded-lg bg-white/5 p-2">
          <p className="text-xs font-medium text-text-primary">{String(meta.title ?? '—')}</p>
          <p className="text-[10px] text-text-muted">{String(meta.description ?? '—')}</p>
          <p className="text-[10px] text-text-muted">Status: {String(meta.statusCode ?? '—')} | Lang: {String(meta.language ?? '—')}</p>
        </div>
      )}
      <div className="grid grid-cols-4 gap-2">
        <StatBox label="Content Size" value={`${Math.round(Number(data.contentLength ?? 0) / 1024)}KB`} />
        <StatBox label="Internal Links" value={String(data.internalLinks ?? 0)} />
        <StatBox label="External Links" value={String(data.externalLinks ?? 0)} />
        <StatBox label="Pages Found" value={String(data.siteMapUrls ?? 0)} />
      </div>
      {siteMapSample && siteMapSample.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Site Map Sample</p>
          {siteMapSample.map((url) => (
            <p key={url} className="text-[10px] text-primary-light/70 truncate py-0.5">{url}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function GtmetrixResult({ data }: { data: Record<string, unknown> }) {
  if (data.status === 'timeout') {
    return <p className="text-xs text-amber-400">{String(data.message)}</p>;
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Grade" value={String(data.grade ?? '—')} />
        <StatBox label="Performance" value={`${data.performanceScore ?? '—'}%`} />
        <StatBox label="Structure" value={`${data.structureScore ?? '—'}%`} />
      </div>
      <div className="grid grid-cols-4 gap-2">
        <StatBox label="LCP" value={`${data.lcp ?? '—'}ms`} />
        <StatBox label="TBT" value={`${data.tbt ?? '—'}ms`} />
        <StatBox label="CLS" value={String(data.cls ?? '—')} />
        <StatBox label="Loaded" value={`${data.fullyLoaded ?? '—'}ms`} />
      </div>
      {typeof data.reportUrl === 'string' && (
        <a href={data.reportUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-light underline">
          View Full Report
        </a>
      )}
    </div>
  );
}

function BraveResult({ data }: { data: Record<string, unknown> }) {
  const results = data.results as Array<Record<string, unknown>> | undefined;
  return (
    <div className="space-y-2">
      <StatBox label="Estimated Results" value={String(data.totalEstimated ?? 0)} />
      {results && results.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Web Results</p>
          {results.slice(0, 5).map((r, i) => (
            <div key={i} className="py-1 border-b border-border/30 last:border-0">
              <p className="text-xs font-medium text-text-primary truncate">{String(r.title ?? '')}</p>
              <p className="text-[10px] text-primary-light/70 truncate">{String(r.url ?? '')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GoogleMapsResult({ data }: { data: Record<string, unknown> }) {
  if (!data.found) {
    return <p className="text-xs text-text-muted">{String(data.message)}</p>;
  }
  const top = data.topResult as Record<string, unknown> | undefined;
  const details = data.details as Record<string, unknown> | undefined;
  return (
    <div className="space-y-2">
      {top && (
        <div className="rounded-lg bg-white/5 p-2">
          <p className="text-xs font-medium text-text-primary">{String(top.name ?? '')}</p>
          <p className="text-[10px] text-text-muted">{String(top.address ?? '')}</p>
          <div className="flex gap-2 mt-1">
            <StatBox label="Rating" value={`${top.rating ?? '—'}/5`} />
            <StatBox label="Reviews" value={String(top.totalReviews ?? 0)} />
          </div>
        </div>
      )}
      {details && (
        <div>
          <p className="text-[10px] text-text-muted">Phone: {String((details as Record<string, unknown>).phone ?? '—')}</p>
          <p className="text-[10px] text-text-muted">Website: {String((details as Record<string, unknown>).website ?? '—')}</p>
          {typeof (details as Record<string, unknown>).mapsUrl === 'string' && (
            <a href={String((details as Record<string, unknown>).mapsUrl)} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary-light underline">
              View on Google Maps
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function JsonResult({ data }: { data: Record<string, unknown> }) {
  return (
    <pre className="overflow-auto max-h-64 rounded-lg bg-black/30 p-3 text-[10px] text-text-muted font-mono leading-relaxed">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-2 text-center">
      <p className="stat-value text-sm font-bold text-text-primary">{value}</p>
      <p className="text-[10px] text-text-muted">{label}</p>
    </div>
  );
}
