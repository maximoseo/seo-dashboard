'use client';

import { useState } from 'react';
import type { Site } from '@/types';

interface AddSiteModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (site: Site) => void;
}

export function AddSiteModal({ open, onClose, onAdd }: AddSiteModalProps) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !domain.trim()) return;

    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');

    onAdd({
      id: cleanDomain.replace(/\./g, '-'),
      name: name.trim(),
      domain: cleanDomain,
      addedAt: new Date().toISOString().split('T')[0],
    });

    setName('');
    setDomain('');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass relative w-full max-w-md rounded-2xl p-6 shadow-2xl animate-fade-in-up">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-text-primary">Add New Site</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/10 hover:text-text-primary"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Site Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Site"
              className="glass w-full rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Domain</label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              className="glass w-full rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="glass flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-text-muted transition-all hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !domain.trim()}
              className="flex-1 rounded-lg bg-gradient-to-r from-primary to-accent px-4 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:opacity-40 disabled:hover:translate-y-0"
            >
              Add Site
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
