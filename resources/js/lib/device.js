const KEY = 'nd-device-id'

/**
 * A stable id for this installation, minted once and kept in localStorage.
 *
 * Push endpoints cannot serve as identity: pushManager.subscribe() returns a
 * brand new URL every time it is called, so the server needs something else to
 * recognise a device it has already seen and replace that device's row rather
 * than adding a second one.
 *
 * Scope, and what it does not cover: localStorage is per origin *and* per
 * install on iOS, so a home-screen app and the same site in Safari are two
 * devices as far as this is concerned -- which is correct, they hold two
 * separate push subscriptions. Deleting and re-adding the app mints a new id
 * and orphans the old row; nothing stored client side can survive that, so the
 * server still relies on providers reporting the dead endpoint as gone.
 *
 * Returns null when storage is unavailable (a private window, blocked site
 * data). The server falls back to keying on the endpoint alone, which is the
 * behaviour that existed before device ids.
 */
export function deviceId() {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored) return stored

    const fresh = crypto.randomUUID
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')

    localStorage.setItem(KEY, fresh)
    return fresh
  } catch {
    return null
  }
}
