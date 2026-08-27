import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/** "2025-04-09" -> "9 Apr 2025". Returns a dash for empty dates. */
export function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Turns an ISO or Y-m-d string into the value an <input type="date"> expects. */
export function toDateInput(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

/** Turns a "HH:MM" or "HH:MM:SS" time column into the value an <input type="time"> expects. */
export function toTimeInput(value) {
  if (!value) return ''
  return String(value).slice(0, 5)
}

/**
 * A meeting's time of day, without inventing a date for it. Times arrive from a
 * TIME column as "19:30:00", which is already how they should read once the
 * seconds are dropped, so this stays a string operation rather than going
 * through Date -- constructing a Date would need a day to attach the time to.
 */
export function formatTime(value) {
  const time = toTimeInput(value)
  return time || null
}

/**
 * The time span of a meeting: "19:30 – 21:00", or just the start where no end
 * was recorded. Null when there are no times at all, so callers can fall back to
 * showing the date alone.
 */
export function formatTimeRange(start, end) {
  const from = formatTime(start)
  const to = formatTime(end)
  if (!from) return to ? `until ${to}` : null
  return to ? `${from} – ${to}` : from
}

export function initials(first, last) {
  return `${(first || '').charAt(0)}${(last || '').charAt(0)}`.toUpperCase() || '?'
}

/**
 * Lomkit validates against the mutate payload, so its messages read
 * "The mutate.0.attributes.first name field is required." Strip the internal
 * path before showing anything to a user.
 */
export function humanizeValidationMessage(message) {
  if (!message) return message
  return message.replace(/mutate\.\d+\.attributes\./g, '')
}

/** Saves a blob under `filename`, the same way the QR badge download does. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking immediately can cancel the download in Safari; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Shows a fetched file: a new tab where the browser allows one, a download where
 * it does not.
 *
 * Both are needed. Opening a tab is what you want while reviewing somebody's ID
 * against their record, but the object URL is created after an await, by which
 * point the browser may no longer count this as a user gesture and will block
 * the popup -- window.open then returns null and the file has to land as a
 * download instead.
 *
 * The URL is revoked late, not immediately: a new tab still needs it after this
 * function returns.
 */
export function openBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const tab = window.open(url, '_blank', 'noopener,noreferrer')

  if (!tab) {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function fullName(record) {
  if (!record) return ''
  return [record.first_name, record.last_name].filter(Boolean).join(' ').trim()
}
