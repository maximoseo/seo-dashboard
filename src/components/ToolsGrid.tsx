'use client';

import { useState, useMemo } from 'react';
import type { ToolCategory } from '@/types';
import { seoTools, toolCategories } from '@/lib/seo-tools';
import { ToolCard } from './ToolCard';

const allCategories: Array<{ key: ToolCategory | 'all'; label: string }> = [
  { key: 'all', label: 'All Tools' },
  ...Object.entries(toolCategories).map(([key, val]) => ({
    key: key as ToolCategory,
    label: val.label,
  })),
];

export function ToolsGrid() {
  const [activeCategory, setActiveCategory] = useState<ToolCategory | 'all'>('all');
  const [search, setSearch] = useState('');

  const filteredTools = useMemo(() => {
    return seoTools.filter((tool) => {
      const matchesCategory = activeCategory === 'all' || tool.category === activeCategory;
      const matchesSearch =
        !search ||
        tool.name.toLowerCase().includes(search.toLowerCase()) ||
        tool.description.toLowerCase().includes(search.toLowerCase()) ||
        tool.capabilities.some((c) => c.toLowerCase().includes(search.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, search]);

  const connectedCount = seoTools.filter((t) => t.status === 'connected').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
            SEO Tools
          </h2>
          <p className="text-xs text-text-muted">
            <span className="font-mono text-emerald-400">{connectedCount}</span> of{' '}
            <span className="font-mono">{seoTools.length}</span> tools connected
          </p>
        </div>

        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass rounded-lg py-2 pl-9 pr-4 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* Category filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {allCategories.map((cat) => {
          const count =
            cat.key === 'all'
              ? seoTools.length
              : seoTools.filter((t) => t.category === cat.key).length;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                activeCategory === cat.key
                  ? 'bg-primary text-white shadow-glow'
                  : 'glass text-text-muted hover:text-text-primary'
              }`}
            >
              {cat.label}{' '}
              <span className="font-mono text-[10px] opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Tools grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredTools.map((tool, i) => (
          <ToolCard key={tool.id} tool={tool} index={i} />
        ))}
      </div>

      {filteredTools.length === 0 && (
        <div className="glass rounded-xl p-8 text-center">
          <p className="text-text-muted">No tools match your search.</p>
        </div>
      )}
    </div>
  );
}
