import { useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'

import { cn } from '@/lib/utils'

/** The public page the plugin embeds. */
export const FACEBOOK_PAGE_URL = 'https://www.facebook.com/nouveauxdemocrate'

const SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v23.0'
const SDK_ID = 'facebook-jssdk'

/** The plugin is widest at 500px; anything above that is padding, not content. */
const MAX_WIDTH = 500

/*
 * The SDK is a single global, so it is loaded once per document and shared. The
 * promise is cached because several plugins may mount before it resolves.
 */
let sdkPromise = null

function loadSdk() {
  if (window.FB) return Promise.resolve(window.FB)
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SDK_ID)
    const script = existing ?? document.createElement('script')

    script.addEventListener('load', () => resolve(window.FB))
    // Tracking protection and ad blockers commonly block this host outright.
    script.addEventListener('error', () => {
      sdkPromise = null
      reject(new Error('The Facebook SDK could not be loaded.'))
    })

    if (!existing) {
      script.id = SDK_ID
      script.async = true
      script.defer = true
      script.crossOrigin = 'anonymous'
      script.src = SDK_SRC
      document.body.appendChild(script)
    }
  })

  return sdkPromise
}

/**
 * Renders Facebook's Page Plugin (the official timeline embed).
 *
 * Unlike a plain HTML page, the markup here appears after the SDK has already
 * scanned the document, so `XFBML.parse` has to be called by hand once the
 * container exists. The plugin also cannot resize itself: `data-width` is fixed
 * at parse time, so a width change means re-rendering and re-parsing.
 */
export function FacebookPagePlugin({ pageUrl = FACEBOOK_PAGE_URL, height = 720, tabs = 'timeline', className }) {
  const containerRef = useRef(null)
  const [width, setWidth] = useState(null)
  const [status, setStatus] = useState('loading')

  // Measure the available width first; the plugin needs it before it renders.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const measure = () => {
      const available = Math.floor(container.getBoundingClientRect().width)
      if (available > 0) setWidth(Math.min(available, MAX_WIDTH))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (width == null) return

    let cancelled = false
    setStatus('loading')

    loadSdk()
      .then((FB) => {
        if (cancelled || !containerRef.current) return
        FB.XFBML.parse(containerRef.current)
        setStatus('ready')
      })
      .catch(() => !cancelled && setStatus('error'))

    return () => {
      cancelled = true
    }
  }, [width, pageUrl, tabs, height])

  return (
    <div ref={containerRef} className={cn('w-full', className)}>
      {status === 'error' ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
          <p className="text-sm text-muted-foreground">
            The Facebook timeline could not be loaded. This usually means a browser extension, private-browsing mode or
            tracking protection is blocking facebook.com.
          </p>
          <a
            href={pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            Open the page on Facebook <ExternalLink className="size-4" />
          </a>
        </div>
      ) : (
        // The plugin draws on a white surface of its own, so the frame stays light in both themes.
        <div className="overflow-hidden rounded-lg border bg-white" style={{ minHeight: height }}>
          {width != null && (
            <div
              // Re-mount on any change: the plugin reads these attributes once, at parse time.
              key={`${pageUrl}-${tabs}-${width}-${height}`}
              className="fb-page"
              data-href={pageUrl}
              data-tabs={tabs}
              data-width={width}
              data-height={height}
              data-small-header="false"
              data-adapt-container-width="true"
              data-hide-cover="false"
              data-show-facepile="true"
            />
          )}
        </div>
      )}
    </div>
  )
}
