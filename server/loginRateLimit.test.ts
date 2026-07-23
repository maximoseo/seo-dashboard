import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from './index'

describe('login rate limit (account + IP)', () => {
  const hit = (username: string) =>
    request(app).post('/api/auth/login').send({ username, password: 'wrong-password' })

  it('throttles repeated attempts on one account and isolates other accounts', async () => {
    let last
    for (let i = 0; i < 9; i++) last = await hit('victim@example.com')
    expect(last!.status).toBe(429) // max is 8/min for this (account,ip) bucket

    // A different account from the same IP has its own bucket → not already blocked.
    const other = await hit('someone-else@example.com')
    expect(other.status).not.toBe(429)
  })
})
