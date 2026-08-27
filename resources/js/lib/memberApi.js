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

/**
 * The public membership application.
 *
 * Its own fetch rather than `request` above, for two reasons: the path is
 * /api/public/..., not /api/member/..., and the body is multipart because the
 * identity document travels with the form. Sending no token is the point --
 * an applicant has no account yet -- and a 401 here must not clear anyone's
 * session, so the unauthenticated handler is deliberately not wired in.
 *
 * Content-Type is never set by hand: the browser has to add the multipart
 * boundary itself, and setting the header strips it.
 */
export async function submitMemberSignup(values) {
  const form = new FormData()

  Object.entries(values).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return

    if (Array.isArray(value)) {
      value.forEach((entry) => form.append(`${key}[]`, entry))
      return
    }

    // Laravel reads "1"/"0" for booleans; `false` would arrive as the string
    // "false" and validate as true.
    form.append(key, typeof value === 'boolean' ? (value ? '1' : '0') : value)
  })

  const response = await fetch('/api/public/member-signup', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: form,
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
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

  /** Announcements from the member's own office, newest first. Read-only. */
  announcements: () => request('GET', '/announcements'),

  incidents: () => request('GET', '/incidents'),
  createIncident: (values) => request('POST', '/incidents', values),
  incidentComments: (incidentId) => request('GET', `/incidents/${incidentId}/comments`),
  createIncidentComment: (incidentId, body) => request('POST', `/incidents/${incidentId}/comments`, { body }),
  notifications: () => request('GET', '/notifications'),
  readNotification: (id) => request('PATCH', `/notifications/${id}/read`),
  readAllNotifications: () => request('POST', '/notifications/read-all'),
  deleteNotification: (id) => request('DELETE', `/notifications/${id}`),
  clearNotifications: () => request('DELETE', '/notifications'),
  pushKey: () => request('GET', '/push/key'),
  savePushSubscription: (subscription) => request('POST', '/push/subscriptions', subscription),
  deletePushSubscription: (endpoint) => request('DELETE', '/push/subscriptions', { endpoint }),

  /*
   * The forum. `mine` narrows the list to what this member wrote; everything
   * else is scoped to their office by the server.
   */
  forumTopics: ({ mine = false, search = '', page = 1 } = {}) =>
    request('GET', `/forum/topics?${new URLSearchParams({
      ...(mine ? { mine: '1' } : {}),
      ...(search ? { search } : {}),
      page: String(page),
    })}`),

  forumTopic: (id) => request('GET', `/forum/topics/${id}`),
  createForumTopic: (values) => request('POST', '/forum/topics', values),
  updateForumTopic: (id, values) => request('PATCH', `/forum/topics/${id}`, values),
  deleteForumTopic: (id) => request('DELETE', `/forum/topics/${id}`),

  createForumComment: (topicId, values) => request('POST', `/forum/topics/${topicId}/comments`, values),
  updateForumComment: (id, values) => request('PATCH', `/forum/comments/${id}`, values),
  deleteForumComment: (id) => request('DELETE', `/forum/comments/${id}`),

  /** Spends a scanned meeting code to record the member present. */
  checkIn: (meetingToken) => request('POST', '/check-in', { meeting_token: meetingToken }),
}

/**
 * Multipart upload for a forum image, returning the stored path to send with the
 * topic or comment. Cannot go through `request()` above: that sets a JSON
 * Content-Type, and the browser has to set the multipart boundary itself.
 */
export async function uploadMemberForumImage(file) {
  const token = getMemberToken()
  const body = new FormData()
  body.append('file', file)

  const response = await fetch('/api/member/forum/images', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      setMemberToken(null)
      onMemberUnauthenticated?.()
    }
    throw new ApiError(payload.message || `Upload failed (${response.status})`, {
      status: response.status,
      errors: payload.errors,
    })
  }

  return payload.data
}
