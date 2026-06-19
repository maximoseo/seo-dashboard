const API_BASE = '/api'

export interface SiteRecord {
  id: string
  name: string
  domain: string
  addedAt: string
}

export async function fetchSites(): Promise<SiteRecord[]> {
  const res = await fetch(`${API_BASE}/sites`)
  if (!res.ok) throw new Error('Failed to fetch sites')
  const data = await res.json()
  return data.sites
}

export async function addSite(name: string, domain: string): Promise<SiteRecord> {
  const res = await fetch(`${API_BASE}/sites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, domain }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Failed to add site')
  }
  const data = await res.json()
  return data.site
}

export async function deleteSite(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/sites/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete site')
}
