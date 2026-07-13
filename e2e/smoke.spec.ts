import { test, expect } from '@playwright/test'

const username = process.env.E2E_USERNAME || process.env.DASHBOARD_AUTH_USERNAME || ''
const password = process.env.E2E_PASSWORD || process.env.DASHBOARD_AUTH_PASSWORD || ''

test.describe('SEO Dashboard smoke', () => {
  test('public health is healthy', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  test('login page renders', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /SEO Pro Dashboard/i })).toBeVisible()
    await expect(page.locator('form')).toBeVisible()
  })

  test('operator can login and reach portfolio surface', async ({ page }) => {
    test.skip(!username || !password, 'Set E2E_USERNAME/E2E_PASSWORD or DASHBOARD_AUTH_*')

    await page.goto('/login')
    await page.locator('input[type="email"], input[name="username"], input[type="text"]').first().fill(username)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('form button[type="submit"], form button:has-text("Sign")').first().click()

    // After login we should leave the login route and see shell chrome
    await expect(page).not.toHaveURL(/\/login$/, { timeout: 20_000 })
    await expect(page.locator('body')).toContainText(/Command|Clients|Projects|Portfolio|Keywords|Overview/i, {
      timeout: 20_000,
    })
  })

  test('authenticated API returns projects', async ({ request }) => {
    test.skip(!username || !password, 'Set E2E_USERNAME/E2E_PASSWORD or DASHBOARD_AUTH_*')

    const login = await request.post('/api/auth/login', {
      data: { username, password },
    })
    expect(login.ok()).toBeTruthy()

    const projects = await request.get('/api/projects')
    expect(projects.ok()).toBeTruthy()
    const body = await projects.json()
    expect(Array.isArray(body.projects)).toBeTruthy()
    expect(body.projects.length).toBeGreaterThan(0)
  })
})
