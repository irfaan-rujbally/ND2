/**
 * Service worker for the Nouveaux Démocrates PWA.
 *
 * Deliberately minimal. Its only jobs are (a) to exist, because Chrome will not
 * offer "Install app" without a fetch handler, and (b) to make repeat launches
 * fast by caching the build output.
 *
 * What it will NOT cache, and why:
 *
 *   - HTML. `resources/views/app.blade.php` names the current hashed bundle, so a
 *     stale copy would point at assets that no longer exist after a deploy — the
 *     classic "PWA stuck on the old version" bug.
 *   - Anything under /api. Member and meeting data must never be served from a
 *     stale cache, and the responses are authenticated per bearer token.
 *
 * That leaves no offline mode: with no connection the browser shows its own
 * offline page. Adding one means deciding what stale member data is acceptable,
 * which is a product question rather than a technical one.
 */

const CACHE = 'nd-assets-v1'

/**
 * Only content-hashed or effectively immutable paths. Vite writes
 * /build/assets/app-V8TxlPWL.js style names, so a changed file is a changed URL
 * and cache-first can never go stale.
 */
const CACHEABLE = [/^\/build\/assets\//, /^\/icons\//]

self.addEventListener('install', () => {
  // No pre-caching: the asset hashes are not known here. Activate immediately
  // rather than waiting for every tab to close.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous versions of this worker.
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (!CACHEABLE.some((pattern) => pattern.test(url.pathname))) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)

      const cached = await cache.match(request)
      if (cached) return cached

      const response = await fetch(request)

      // Opaque and error responses are not worth keeping; a cached 404 would
      // outlive the deploy that fixes it.
      if (response.status === 200 && response.type === 'basic') {
        cache.put(request, response.clone())
      }

      return response
    })(),
  )
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data?.json() || {}
  } catch {
    payload = { title: 'New notification', body: event.data?.text() || '' }
  }

  event.waitUntil(self.registration.showNotification(payload.title || 'New notification', {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url || '/', notificationId: payload.notification_id },
    tag: payload.notification_id ? `notification-${payload.notification_id}` : undefined,
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destination = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin)
    if (existing) {
      await existing.navigate(destination)
      return existing.focus()
    }
    return self.clients.openWindow(destination)
  })())
})
