'use client';

interface HeaderProps {
  siteCount: number;
  toolCount: number;
}

export function Header({ siteCount, toolCount }: HeaderProps) {
  return (
    <header className="glass sticky top-0 z-50 border-b border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-text-primary">SEO Dashboard</h1>
              <p className="text-xs text-text-muted">MaximoSEO</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3">
              <span className="glass rounded-full px-3 py-1 text-xs font-medium text-primary-light">
                {siteCount} Sites
              </span>
              <span className="glass rounded-full px-3 py-1 text-xs font-medium text-accent">
                {toolCount} Tools
              </span>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary-light">
              M
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
