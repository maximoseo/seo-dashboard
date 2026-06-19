'use client';

import type { SeoTool } from '@/types';
import { toolCategories } from '@/lib/seo-tools';

interface ToolCardProps {
  tool: SeoTool;
  index: number;
}

export function ToolCard({ tool, index }: ToolCardProps) {
  const category = toolCategories[tool.category];

  return (
    <div
      className="glass group rounded-xl p-4 transition-all hover:-translate-y-1 hover:shadow-glow stagger-item"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{ background: `${category.color}22` }}
          >
            <svg
              className="h-5 w-5"
              style={{ color: category.color }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={tool.icon} />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{tool.name}</h3>
            <span
              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: `${category.color}22`, color: category.color }}
            >
              {category.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${
            tool.status === 'connected' ? 'bg-emerald-400' :
            tool.status === 'error' ? 'bg-red-400' :
            tool.status === 'loading' ? 'bg-amber-400 animate-pulse' :
            'bg-gray-400'
          }`} />
          <span className="text-[10px] text-text-muted capitalize">{tool.status}</span>
        </div>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-text-muted line-clamp-2">
        {tool.description}
      </p>

      <div className="mt-3 flex flex-wrap gap-1">
        {tool.capabilities.slice(0, 4).map((cap) => (
          <span
            key={cap}
            className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-text-muted"
          >
            {cap}
          </span>
        ))}
        {tool.capabilities.length > 4 && (
          <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-text-muted">
            +{tool.capabilities.length - 4} more
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
        <code className="text-[10px] text-primary-light/70">${tool.envVar}</code>
        {tool.docsUrl && (
          <a
            href={tool.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-medium text-primary-light underline decoration-primary-light/35 hover:decoration-primary-light"
          >
            API Docs
          </a>
        )}
      </div>
    </div>
  );
}
