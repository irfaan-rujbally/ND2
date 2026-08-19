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

export function fullName(record) {
  if (!record) return ''
  return [record.first_name, record.last_name].filter(Boolean).join(' ').trim()
}
