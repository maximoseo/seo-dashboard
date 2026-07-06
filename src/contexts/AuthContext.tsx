import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  authFetch,
  clearStoredAuth,
  getStoredAuthUser,
  setStoredAuth,
  type StoredAuthUser,
} from '@/lib/authToken'

interface AuthContextValue {
  user: StoredAuthUser | null
  isAuthenticated: boolean
  loading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const authDisabled = import.meta.env.VITE_AUTH_DISABLED === 'true'
  const [user, setUser] = useState<StoredAuthUser | null>(() => authDisabled ? { email: 'dev@local', provider: 'dev' } : getStoredAuthUser())
  const [loading, setLoading] = useState(!authDisabled)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authDisabled) return
    let cancelled = false
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000)
    authFetch('/api/auth/me', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const authFailure = res.status === 401 || res.status === 403
          const err = new Error(authFailure ? 'Session expired' : `Session check temporarily unavailable (${res.status})`)
          ;(err as Error & { authFailure?: boolean }).authFailure = authFailure
          throw err
        }
        const data = await res.json()
        if (!data.authenticated || !data.user?.email) {
          const err = new Error('Session invalid')
          ;(err as Error & { authFailure?: boolean }).authFailure = true
          throw err
        }
        const nextUser = { email: data.user.email as string, provider: data.user.app_metadata?.provider || 'dashboard' }
        if (!cancelled) {
          setStoredAuth(nextUser)
          setUser(nextUser)
        }
      })
      .catch((e) => {
        const authFailure = Boolean((e as Error & { authFailure?: boolean }).authFailure)
        if (authFailure) clearStoredAuth()
        if (!cancelled) {
          if (authFailure) setUser(null)
          const message = e instanceof DOMException && e.name === 'AbortError'
            ? 'Session check timed out'
            : e instanceof Error ? e.message : 'Session check failed'
          setError(message)
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId)
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [authDisabled])

  const login = useCallback(async (username: string, password: string) => {
    setError(null)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = typeof data.error === 'string' ? data.error : 'Login failed'
      setError(message)
      throw new Error(message)
    }
    const nextUser = { email: data.user?.email || username, provider: data.user?.provider || 'dashboard' }
    setStoredAuth(nextUser)
    setUser(nextUser)
  }, [])

  const logout = useCallback(async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Session is httpOnly and server-side; clearing local user state is sufficient.
    }
    clearStoredAuth()
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isAuthenticated: authDisabled || Boolean(user),
    loading,
    error,
    login,
    logout,
  }), [authDisabled, error, loading, login, logout, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
