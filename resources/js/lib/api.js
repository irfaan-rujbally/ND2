const TOKEN_KEY = 'nd.token'

/*
 * "Remember me" decides which storage holds the token: localStorage survives a
 * browser restart, sessionStorage is dropped when the tab closes. Reads check
 * both so the rest of the app never needs to care which one was used.
 */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
}

export function setToken(token, { remember = true } = {}) {
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(TOKEN_KEY)

  if (!token) return

  const store = remember ? localStorage : sessionStorage
  store.setItem(TOKEN_KEY, token)
}

/**
 * Thrown for any non-2xx response. `errors` carries Laravel's validation bag
 * so forms can show messages per field.
 */
export class ApiError extends Error {
  constructor(message, { status, errors } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors || {}
  }

  get isValidation() {
    return this.status === 422
  }

  get isForbidden() {
    return this.status === 403
  }

  get isUnauthenticated() {
    return this.status === 401
  }
}

let onUnauthenticated = null

/** Lets AuthProvider react to a token that the server no longer accepts. */
export function setUnauthenticatedHandler(handler) {
  onUnauthenticated = handler
}

async function request(method, path, body) {
  const token = getToken()

  const response = await fetch(`/api${path}`, {
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
    if (response.status === 401) {
      setToken(null)
      onUnauthenticated?.()
    }

    throw new ApiError(payload.message || `Request failed (${response.status})`, {
      status: response.status,
      errors: payload.errors,
    })
  }

  return payload
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path, body) => request('DELETE', path, body),
}

/*
 * Thin wrappers over the lomkit/laravel-rest-api endpoint shapes. Keeping the
 * payload construction here means pages never hand-build a search body, and the
 * future mobile app can port these five functions verbatim.
 */

export function search(resource, searchPayload = {}) {
  return api.post(`/${resource}/search`, { search: searchPayload })
}

export function mutate(resource, operations) {
  return api.post(`/${resource}/mutate`, { mutate: operations })
}

export function destroy(resource, ids) {
  return api.delete(`/${resource}`, { resources: ids })
}

export function restore(resource, ids) {
  return api.post(`/${resource}/restore`, { resources: ids })
}

export function forceDelete(resource, ids) {
  return api.delete(`/${resource}/force`, { resources: ids })
}

/**
 * Runs a resource action against the records matched by `filters`.
 * `fields` is given as a plain object and converted to the {name, value}
 * pairs the API expects.
 */
export function runAction(resource, action, { filters = [], fields = {} } = {}) {
  return api.post(`/${resource}/actions/${action}`, {
    search: { filters },
    fields: Object.entries(fields).map(([name, value]) => ({ name, value })),
  })
}

/**
 * Everyone recorded at one meeting, whatever office they belong to.
 *
 * Not a `search('members', ...)`: that is scoped to the caller's own office, so
 * a visitor from another office would be missing from the very list they belong
 * on. See MeetingParticipantsController.
 */
export function fetchMeetingParticipants(meetingId, filters = {}) {
  const query = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) query.set(key, String(value))
  })

  const suffix = query.toString() ? `?${query.toString()}` : ''

  return api.get(`/meetings/${meetingId}/participants${suffix}`)
}

/**
 * Multipart upload for the membership application's attachments. Returns the
 * stored path, which is then saved on the member through a normal `mutate`.
 * `kind` is 'cv' or 'documents'.
 */
export async function uploadMemberDocument(kind, file) {
  const token = getToken()
  const body = new FormData()
  body.append('kind', kind)
  body.append('file', file)

  const response = await fetch('/api/member-documents', {
    method: 'POST',
    // No Content-Type header: the browser must set the multipart boundary.
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    if (response.status === 401) {
      setToken(null)
      onUnauthenticated?.()
    }
    throw new ApiError(payload.message || `Upload failed (${response.status})`, {
      status: response.status,
      errors: payload.errors,
    })
  }

  return payload.data
}

export function memberDocumentUrl(memberId, kind) {
  return `/api/members/${memberId}/documents/${kind}`
}

/**
 * Multipart upload for an announcement's image. Returns the stored path, saved
 * onto the announcement afterwards through a normal `mutate` — the same two-step
 * shape as uploadMemberDocument.
 */
export async function uploadAnnouncementImage(file) {
  const token = getToken()
  const body = new FormData()
  body.append('file', file)

  const response = await fetch('/api/announcement-images', {
    method: 'POST',
    // No Content-Type header: the browser must set the multipart boundary.
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    if (response.status === 401) {
      setToken(null)
      onUnauthenticated?.()
    }
    throw new ApiError(payload.message || `Upload failed (${response.status})`, {
      status: response.status,
      errors: payload.errors,
    })
  }

  return payload.data
}

/*
 * The forum, from the office's side.
 *
 * Not `search('forum-topics', …)`: these are plain controllers rather than a
 * Rest resource, because what the moderation screen needs is not the shape of the
 * table -- it sees the content of posts that have already been moderated, which
 * the member portal hides. See App\Http\Controllers\Api\Forum\TopicsController.
 */
export const forum = {
  topics: ({ search = '', filter = 'all', page = 1 } = {}) => {
    const query = new URLSearchParams({ filter, page: String(page) })
    if (search) query.set('search', search)
    return api.get(`/forum/topics?${query}`)
  },

  topic: (id) => api.get(`/forum/topics/${id}`),

  /** Starts a topic as the office rather than under the administrator's name. */
  createTopic: (values) => api.post('/forum/topics', values),
  comment: (topicId, values) => api.post(`/forum/topics/${topicId}/comments`, values),

  /*
   * Moderation, which is not deletion: it hides the post from members and leaves
   * them a tombstone saying an administrator removed it. `unmoderate` puts it
   * back. Nothing here erases anyone's words.
   */
  moderateTopic: (id) => api.post(`/forum/topics/${id}/moderate`),
  unmoderateTopic: (id) => api.delete(`/forum/topics/${id}/moderate`),
  moderateComment: (id) => api.post(`/forum/comments/${id}/moderate`),
  unmoderateComment: (id) => api.delete(`/forum/comments/${id}/moderate`),
}

/** Multipart upload for a forum image posted by the office. */
export async function uploadForumImage(file) {
  const token = getToken()
  const body = new FormData()
  body.append('file', file)

  const response = await fetch('/api/forum/images', {
    method: 'POST',
    // No Content-Type: the browser must set the multipart boundary.
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    if (response.status === 401) {
      setToken(null)
      onUnauthenticated?.()
    }
    throw new ApiError(payload.message || `Upload failed (${response.status})`, {
      status: response.status,
      errors: payload.errors,
    })
  }

  return payload.data
}

/**
 * Every member who could receive this announcement, with what has already
 * happened to each of them.
 *
 * One unpaginated response on purpose: "select all" has to mean every member
 * matching the filters rather than the rows currently on screen, and the filters
 * then run in the browser with no further requests. See
 * AnnouncementRecipientsController for why this is not a `search('members')`.
 */
export function fetchAnnouncementRecipients(announcementId) {
  return api.get(`/announcements/${announcementId}/recipients`)
}

/**
 * The image URL for an announcement.
 *
 * Keyed on the announcement's public token rather than its id, and deliberately
 * unauthenticated: the same URL has to load inside an email, where no bearer
 * token can be presented.
 *
 * `v` is a cache-buster, and it is not optional. The response is served
 * `immutable`, and the token stays the same when the image is replaced — so
 * without it this screen would keep showing the picture the announcement used to
 * have. `updated_at` moves on every save, which is exactly when the image can
 * have changed. (The emailed copy of this URL uses a digest of the stored path
 * instead; both are only cache keys, and the server ignores the parameter.)
 */
export function announcementImageUrl(announcement) {
  if (!announcement?.public_token || !announcement?.image_path) return null

  const version = encodeURIComponent(announcement.updated_at || '')

  return `/api/public/announcements/${announcement.public_token}/image?v=${version}`
}

/**
 * Spreadsheet of every member matching `filters` — not just the page on screen.
 *
 * A plain link cannot be used: the API authenticates with a bearer token, which
 * a browser navigation would not send. So the file is fetched like any other
 * request and handed back as a blob for the caller to save.
 */
export async function fetchMembersExport(filters = {}) {
  const token = getToken()
  const query = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) query.set(key, String(value))
  })

  const response = await fetch(`/api/members/export?${query.toString()}`, {
    headers: {
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })

  if (!response.ok) {
    if (response.status === 401) {
      setToken(null)
      onUnauthenticated?.()
    }

    // An error comes back as JSON even though the happy path is binary.
    const payload = await response.json().catch(() => ({}))
    throw new ApiError(payload.message || `Export failed (${response.status})`, {
      status: response.status,
      errors: payload.errors,
    })
  }

  const disposition = response.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="?([^"]+)"?/)

  return { blob: await response.blob(), filename: match?.[1] || 'members.xlsx' }
}

export const auth = {
  login: (credentials) => api.post('/auth/login', credentials),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
}

export const stats = () => api.get('/stats')

export const incidentComments = {
  list: (incidentId) => api.get(`/incidents/${incidentId}/comments`),
  create: (incidentId, body) => api.post(`/incidents/${incidentId}/comments`, { body }),
}

export const notifications = {
  list: () => api.get('/notifications'),
  read: (id) => api.patch(`/notifications/${id}/read`),
  readAll: () => api.post('/notifications/read-all'),
  pushKey: () => api.get('/push/key'),
  savePushSubscription: (subscription) => api.post('/push/subscriptions', subscription),
  deletePushSubscription: (endpoint) => api.delete('/push/subscriptions', { endpoint }),
  testPush: () => api.post('/push/test'),
}
