import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import {
  getMemberToken,
  memberApi,
  setMemberToken,
  setMemberUnauthenticatedHandler,
} from '@/lib/memberApi'

/*
 * Session state for the member portal, kept apart from AuthProvider so a member
 * and a member of staff can be signed in on the same browser without one
 * evicting the other -- which is the normal case on a shared office phone.
 */

const MemberAuthContext = createContext(null)

export function MemberAuthProvider({ children }) {
  const [member, setMember] = useState(null)
  // Starts loading only if there is a stored token worth verifying, so a first
  // time visitor never waits on a request that cannot succeed.
  const [isLoading, setIsLoading] = useState(() => Boolean(getMemberToken()))

  const signOutLocally = useCallback(() => {
    setMemberToken(null)
    setMember(null)
  }, [])

  useEffect(() => {
    setMemberUnauthenticatedHandler(signOutLocally)
    return () => setMemberUnauthenticatedHandler(null)
  }, [signOutLocally])

  // A stored token is only a claim; the API decides whether it is still good.
  useEffect(() => {
    if (!getMemberToken()) return

    let cancelled = false

    memberApi
      .me()
      .then((payload) => {
        if (!cancelled) setMember(payload.member)
      })
      .catch(() => {
        if (!cancelled) signOutLocally()
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [signOutLocally])

  const signIn = useCallback(async ({ identifier, password, remember = true }) => {
    const payload = await memberApi.login({ identifier, password })
    setMemberToken(payload.token, { remember })
    setMember(payload.member)
    return payload.member
  }, [])

  const signOut = useCallback(async () => {
    // Revoke server side where possible, but a failure must not trap the member
    // in a session they asked to leave.
    try {
      await memberApi.logout()
    } catch {
      // ignored on purpose
    }
    signOutLocally()
  }, [signOutLocally])

  const value = useMemo(
    () => ({
      member,
      setMember,
      isLoading,
      isAuthenticated: Boolean(member),
      // True while the member is still on the password derived from their name
      // and phone number, which anyone could work out.
      mustChangePassword: Boolean(member?.must_change_password),
      signIn,
      signOut,
    }),
    [member, isLoading, signIn, signOut],
  )

  return <MemberAuthContext.Provider value={value}>{children}</MemberAuthContext.Provider>
}

export function useMemberAuth() {
  const context = useContext(MemberAuthContext)

  if (!context) {
    throw new Error('useMemberAuth must be used inside a MemberAuthProvider')
  }

  return context
}
