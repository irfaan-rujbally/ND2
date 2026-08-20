import { useEffect, useState } from 'react'
import { Download, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { downloadQrPng, qrToSvg } from '@/lib/qr'
import { cn, fullName } from '@/lib/utils'

/** Renders a member's QR as inline SVG, which stays sharp when printed. */
export function QrImage({ token, width = 200, className }) {
  const [svg, setSvg] = useState(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    qrToSvg(token, { width })
      .then((markup) => !cancelled && setSvg(markup))
      .catch(() => !cancelled && setSvg(null))
    return () => {
      cancelled = true
    }
  }, [token, width])

  if (!token) return null
  if (!svg) return <Skeleton style={{ width, height: width }} className={className} />

  return (
    <div
      className={cn('[&>svg]:h-auto [&>svg]:w-full', className)}
      style={{ width }}
      // qrcode returns a self-contained <svg>; there is no user input in it.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

/** One printable badge: the code plus enough text to hand it to the right person. */
export function MemberBadge({ member, width = 150, className }) {
  return (
    <div
      className={cn(
        'flex break-inside-avoid flex-col items-center gap-2 rounded-lg border bg-white p-3 text-center',
        className,
      )}
    >
      <QrImage token={member.qr_token} width={width} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-black">{fullName(member) || 'Unnamed member'}</p>
        <p className="text-[11px] text-neutral-500">
          Nouveaux Démocrates
          {member.constituency != null ? ` · Const. ${member.constituency}` : ''}
        </p>
      </div>
    </div>
  )
}

/** The QR block shown on a member's own page, with a PNG download. */
export function MemberQrPanel({ member }) {
  const [downloading, setDownloading] = useState(false)

  const download = async () => {
    setDownloading(true)
    try {
      await downloadQrPng(member.qr_token, `${(fullName(member) || 'member').replace(/\s+/g, '-').toLowerCase()}-badge.png`)
    } finally {
      setDownloading(false)
    }
  }

  if (!member?.qr_token) {
    return (
      <p className="text-sm text-muted-foreground">
        This member has no badge yet. Save the member once and it will be generated.
      </p>
    )
  }

  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <div className="rounded-lg border bg-white p-3">
        <QrImage token={member.qr_token} width={160} />
      </div>
      <div className="min-w-0 space-y-2">
        <p className="text-sm text-muted-foreground">
          Scan this badge from the attendance screen to record this member as a participant.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={download} disabled={downloading}>
          <Download className="size-4" />
          Download PNG
        </Button>
      </div>
    </div>
  )
}

export { QrCode }
