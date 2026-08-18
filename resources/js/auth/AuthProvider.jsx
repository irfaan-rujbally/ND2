import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { auth as authApi, getToken, setToken, setUnauthenticatedHandler } from '@/lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(getToken() ? 'loading' : 'guest')

  // A stored token may have been revoked server side; verify it once on boot.
  useEffect(() => {
    if (!getToken()) return

    let cancelled = false

    authApi
      .me()
      .then(({ user: me }) => {
        if (cancelled) return
        setUser(me)
        setStatus('authenticated')
      })
      .catch(() => {
        if (cancelled) return
        setToken(null)
        setUser(null)
        setStatus('guest')
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      setUser(null)
      setStatus('guest')
    })
    return () => setUnauthenticatedHandler(null)
  }, [])

  const login = useCallback(async ({ remember = true, ...credentials }) => {
    const { token, user: me } = await authApi.login(credentials)
    setToken(token, { remember })
    setUser(me)
    setStatus('authenticated')
    return me
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // Already invalid server side; clearing locally is enough.
    }
    setToken(null)
    setUser(null)
    setStatus('guest')
  }, [])

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      isLoading: status === 'loading',
      isAdmin: Boolean(user?.roles?.includes('admin')),
      login,
      logout,
    }),
    [user, status, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside an AuthProvider')
  return context
}
