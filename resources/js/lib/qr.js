/**
 * Badges encode `ND2:<token>` rather than a member id. Ids are sequential, so a
 * badge for an arbitrary member would be trivial to forge; the token is random
 * and can be revoked by clearing the column.
 *
 * The prefix lets the scanner reject an unrelated QR code (a product barcode, a
 * wifi share, someone's boarding pass) before it ever reaches the API.
 */
export const QR_PREFIX = 'ND2:'

export function memberQrPayload(token) {
  return `${QR_PREFIX}${token}`
}

/**
 * Returns the token from a scanned string, or null when the code is not one of
 * ours. Tokens are exactly 32 characters, which is also what the API validates.
 */
export function parseMemberQr(raw) {
  if (typeof raw !== 'string') return null

  const text = raw.trim()
  if (!text.startsWith(QR_PREFIX)) return null

  const token = text.slice(QR_PREFIX.length)
  return /^[A-Za-z0-9]{32}$/.test(token) ? token : null
}

/*
 * The generator is imported on demand: only the badge and print screens need it,
 * and it would otherwise sit in the bundle every page downloads.
 */
const generator = () => import('qrcode').then((m) => m.default ?? m)

/** Renders a badge to an SVG string, which prints sharply at any size. */
export async function qrToSvg(token, { margin = 1, width = 220 } = {}) {
  const QRCode = await generator()

  return QRCode.toString(memberQrPayload(token), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin,
    width,
  })
}

/** Renders to a PNG data URL, for downloading a single member's badge. */
export async function qrToDataUrl(token, { margin = 2, width = 512 } = {}) {
  const QRCode = await generator()

  return QRCode.toDataURL(memberQrPayload(token), {
    errorCorrectionLevel: 'M',
    margin,
    width,
  })
}

/**
 * Saves a badge as a PNG file.
 *
 * Mobile browsers ignore the `download` attribute on a `data:` URL — iOS Safari
 * either navigates to the image or does nothing at all — so the PNG is handed
 * over as a blob instead, and via the share sheet on the browsers that have no
 * download attribute to begin with (older iOS, in-app webviews).
 */
export async function downloadQrPng(token, filename, options = {}) {
  const dataUrl = await qrToDataUrl(token, options)
  const blob = await (await fetch(dataUrl)).blob()

  const link = document.createElement('a')
  if (!('download' in link)) {
    const file = new File([blob], filename, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename })
        return
      } catch (error) {
        // A cancelled share sheet is not a failure; anything else falls through.
        if (error?.name === 'AbortError') return
      }
    }
  }

  const url = URL.createObjectURL(blob)
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking straight away can cancel the save on some mobile browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
