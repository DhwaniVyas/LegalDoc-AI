/**
 * AuthContext – centralised authentication state for the entire app.
 *
 * Provides: { user, loading, login, register, googleLogin, logout }
 *
 * Authentication state is persisted through the HTTP-only cookie set by the
 * backend. On startup we call GET /api/auth/me to restore the session; if the
 * cookie is absent or expired the endpoint returns 401 and `user` is null.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import api from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)   // true while checking session

  // ── Restore session on mount ───────────────────────────────
  useEffect(() => {
    api.get('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  // ── Email / password login ─────────────────────────────────
  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    setUser(res.data.user)
    return res.data.user
  }, [])

  // ── Email / password registration ─────────────────────────
  const register = useCallback(async (email, password, fullName) => {
    const res = await api.post('/auth/register', {
      email,
      password,
      full_name: fullName || undefined,
    })
    setUser(res.data.user)
    return res.data.user
  }, [])

  // ── Google login ───────────────────────────────────────────
  const googleLogin = useCallback(async (idToken) => {
    const res = await api.post('/auth/google', { id_token: idToken })
    setUser(res.data.user)
    return res.data.user
  }, [])

  // ── Logout ─────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, googleLogin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

/** Hook – must be used inside <AuthProvider> */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

