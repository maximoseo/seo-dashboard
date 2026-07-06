import { describe, expect, it } from 'vitest'
import { generateAlerts } from './rules'

describe('alert rules', () => {
  it('creates critical alerts for broken backlink pages', () => {
    const alerts = generateAlerts({ domain: 'maximo-seo.ai', brokenPagesWithBacklinks: 2 })
    expect(alerts.some(alert => alert.severity === 'critical' && alert.module === 'Pages')).toBe(true)
  })

  it('detects large organic traffic drops', () => {
    const alerts = generateAlerts({ domain: 'maximo-seo.ai', organicTraffic: 500, previousOrganicTraffic: 1000 })
    expect(alerts[0]).toMatchObject({ severity: 'critical', module: 'Traffic' })
  })
})
