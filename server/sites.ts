import { Router } from 'express'

export interface SiteRecord {
  id: string
  name: string
  domain: string
  addedAt: string
}

// In-memory store (persists for server lifetime; replace with Supabase later)
const sites: SiteRecord[] = [
  { id: 'maximo-seo', name: 'MaximoSEO', domain: 'maximo-seo.ai', addedAt: '2024-11-15T00:00:00.000Z' },
  { id: 'cleanair-houston', name: 'Clean Air Houston Pro', domain: 'cleanairhoustonpro.net', addedAt: '2024-12-01T00:00:00.000Z' },
  { id: 'webs-co-il', name: 'Webs.co.il', domain: 'webs.co.il', addedAt: '2025-01-10T00:00:00.000Z' },
]

const router = Router()

// List all sites
router.get('/api/sites', (_req, res) => {
  res.json({ sites })
})

// Add a new site
router.post('/api/sites', (req, res) => {
  const { name, domain } = req.body
  if (!name || !domain) {
    res.status(400).json({ error: 'name and domain are required' })
    return
  }
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const id = cleanDomain.replace(/[^a-z0-9]/gi, '-').toLowerCase()

  if (sites.some(s => s.domain === cleanDomain)) {
    res.status(409).json({ error: 'Site already exists' })
    return
  }

  const site: SiteRecord = { id, name, domain: cleanDomain, addedAt: new Date().toISOString() }
  sites.push(site)
  res.status(201).json({ site })
})

// Delete a site
router.delete('/api/sites/:id', (req, res) => {
  const idx = sites.findIndex(s => s.id === req.params.id)
  if (idx === -1) {
    res.status(404).json({ error: 'Site not found' })
    return
  }
  sites.splice(idx, 1)
  res.json({ deleted: true })
})

export default router
