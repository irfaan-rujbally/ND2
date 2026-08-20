/*
 * API client for the member portal.
 *
 * Deliberately separate from lib/api.js rather than a flag on it. That module
 * keeps the staff token under 'nd.token' and clears it on any 401; if members
 * shared it, signing in on a shared phone would silently evict the staff session
 * and a member 401 would sign an administrator out. The two live in different
 * storage keys and never see each other's tokens.
 */

import { ApiError } from '@/lib/api'

const MEMBER_TOKEN_KEY = 'nd.member.token'

export function getMemberToken() {
  return localStorage.getItem(MEMBER_TOKEN_KEY) || sessionStorage.getItem(MEMBER_TOKEN_KEY)
}

export function setMemberToken(token, { remember = true } = {}) {
  localStorage.removeItem(MEMBER_TOKEN_KEY)
  sessionStorage.removeItem(MEMBER_TOKEN_KEY)

  if (!token) return

  const store = remember ? localStorage : sessionStorage
  store.setItem(MEMBER_TOKEN_KEY, token)
}

let onMemberUnauthenticated = null

export function setMemberUnauthenticatedHandler(handler) {
  onMemberUnauthenticated = handler
}

async function request(method, path, body) {
  const token = getMemberToken()

  const response = await fetch(`/api/member${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (response.status === 204) return null

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    /*
     * 403 matters as much as 401 here: it is what the portal guard returns when
     * a staff token is presented, so treating it as "not a member session" stops
     * the page retrying forever against a token that will never work.
     */
    if (response.status === 401 || response.status === 403) {
      setMemberToken(null)
      onMemberUnauthenticated?.()
    }

    throw new ApiError(payload.message || `Request failed (${response.status})`, {
      status: response.status,
      errors: payload.errors,
    })
  }

  return payload
}

export const memberApi = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  put: (path, body) => request('PUT', path, body),

  login: ({ identifier, password }) =>
    request('POST', '/auth/login', { identifier, password, device_name: 'member-portal' }),

  me: () => request('GET', '/auth/me'),
  logout: () => request('POST', '/auth/logout'),

  profile: () => request('GET', '/profile'),
  updateProfile: (values) => request('PATCH', '/profile', values),
  changePassword: (values) => request('PUT', '/profile/password', values),

  meetings: () => request('GET', '/meetings'),
  news: () => request('GET', '/news'),

  /** Spends a scanned meeting code to record the member present. */
  checkIn: (meetingToken) => request('POST', '/check-in', { meeting_token: meetingToken }),
}
