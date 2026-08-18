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

export const auth = {
  login: (credentials) => api.post('/auth/login', credentials),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
}

export const stats = () => api.get('/stats')
