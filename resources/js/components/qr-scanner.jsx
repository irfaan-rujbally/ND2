import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Camera, CameraOff, Check, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { parseMemberQr } from '@/lib/qr'
import { cn } from '@/lib/utils'

/** Same code re-read this often is ignored, so one badge is not counted twice. */
const REPEAT_GUARD_MS = 2500

function cameraError(error) {
  if (!window.isSecureContext) {
    return 'The camera needs a secure connection. Open the app over HTTPS (or on localhost) to scan.'
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'This browser does not expose a camera to web pages.'
  }
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was denied. Allow it in your browser settings, then try again.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera was found on this device.'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera is already in use by another app.'
    default:
      return error?.message || 'The camera could not be started.'
  }
}

/**
 * Continuous QR scanner for recording attendance at a door: it keeps the camera
 * running and reports each new badge, so people can be scanned one after another
 * without reopening anything.
 */
export function QrScannerDialog({ open, onOpenChange, onToken, log = [] }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const frameRef = useRef(null)
  const lastSeenRef = useRef({ token: null, at: 0 })

  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)
  const [hint, setHint] = useState(null)

  const stop = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setReady(false)
  }, [])

  // The decoder is only needed once the camera is actually open.
  const decoderRef = useRef(null)

  const scanFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      frameRef.current = requestAnimationFrame(scanFrame)
      return
    }

    // Downscale: decoding a full-resolution frame every tick is wasteful on a phone.
    const width = 480
    const height = Math.round((video.videoHeight / video.videoWidth) * width) || 360
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(video, 0, 0, width, height)

    const decode = decoderRef.current
    if (!decode) {
      frameRef.current = requestAnimationFrame(scanFrame)
      return
    }

    const { data } = context.getImageData(0, 0, width, height)
    const found = decode(data, width, height, { inversionAttempts: 'dontInvert' })

    if (found?.data) {
      const token = parseMemberQr(found.data)

      if (!token) {
        setHint('That code is not a member badge.')
      } else {
        const now = Date.now()
        const { token: lastToken, at } = lastSeenRef.current
        if (token !== lastToken || now - at > REPEAT_GUARD_MS) {
          lastSeenRef.current = { token, at: now }
          setHint(null)
          navigator.vibrate?.(60)
          onToken(token)
        }
      }
    }

    frameRef.current = requestAnimationFrame(scanFrame)
  }, [onToken])

  useEffect(() => {
    if (!open) {
      stop()
      return undefined
    }

    let cancelled = false
    setError(null)
    setHint(null)

    const start = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(cameraError(null))
        return
      }

      try {
        if (!decoderRef.current) {
          const module = await import('jsqr')
          decoderRef.current = module.default ?? module
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          // The rear camera is the one pointed at the badge.
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (!video) return

        video.srcObject = stream
        await video.play()
        setReady(true)
        frameRef.current = requestAnimationFrame(scanFrame)
      } catch (startError) {
        if (!cancelled) setError(cameraError(startError))
      }
    }

    start()

    return () => {
      cancelled = true
      stop()
    }
  }, [open, scanFrame, stop])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scan member badges</DialogTitle>
        </DialogHeader>

        {error ? (
          <div className="space-y-3">
            <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              <CameraOff className="size-4" />
              Close and add manually
            </Button>
          </div>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-lg bg-black">
              {/* muted + playsInline are required for autoplay on iOS. */}
              <video
                ref={videoRef}
                className="aspect-[4/3] w-full object-cover"
                muted
                playsInline
                aria-label="Camera preview"
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Aiming frame */}
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="size-40 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>

              {!ready ? (
                <div className="absolute inset-0 grid place-items-center text-sm text-white/80">
                  <span className="flex items-center gap-2">
                    <Camera className="size-4" />
                    Starting camera…
                  </span>
                </div>
              ) : null}
            </div>

            <p className="text-center text-xs text-muted-foreground">
              {hint ?? 'Point the camera at a badge. Scanning stays on for the next person.'}
            </p>

            {log.length ? (
              <div className="max-h-40 overflow-y-auto rounded-lg border">
                <ul className="divide-y text-sm">
                  {log.map((entry, index) => (
                    <li key={`${entry.at}-${index}`} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0 truncate">{entry.label}</span>
                      <Badge
                        variant={
                          entry.status === 'added' ? 'success' : entry.status === 'already' ? 'secondary' : 'destructive'
                        }
                        className={cn('shrink-0 gap-1')}
                      >
                        {entry.status === 'added' ? <Check className="size-3" /> : null}
                        {entry.status === 'added'
                          ? 'Added'
                          : entry.status === 'already'
                            ? 'Already in'
                            : 'Failed'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                lastSeenRef.current = { token: null, at: 0 }
                setHint(null)
              }}
            >
              <RotateCcw className="size-4" />
              Scan the same badge again
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
