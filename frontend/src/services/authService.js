/**
 * authService – thin wrappers around the auth API.
 * Prefer using AuthContext directly in components; use this for
 * standalone helpers that don't need React state.
 */
import api from '../lib/api'

export const authService = {
  /** Fetch the currently authenticated user, or null. */
  getCurrentUser: async () => {
    try {
      const res = await api.get('/auth/me')
      return res.data
    } catch {
      return null
    }
  },

  /** Email/password login. Returns AuthResponse. */
  login: (email, password) =>
    api.post('/auth/login', { email, password }).then((r) => r.data),

  /** Registration. Returns AuthResponse. */
  register: (email, password, fullName) =>
    api.post('/auth/register', {
      email,
      password,
      full_name: fullName || undefined,
    }).then((r) => r.data),

  /** Google login. id_token from Google Identity Services. Returns AuthResponse. */
  googleLogin: (idToken) =>
    api.post('/auth/google', { id_token: idToken }).then((r) => r.data),

  /** Logout – clears backend cookie. */
  logout: () => api.post('/auth/logout').then((r) => r.data),
}

