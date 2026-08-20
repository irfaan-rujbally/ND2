import { useState } from 'react'
import { Download, QrCode } from 'lucide-react'

import { QrImage } from '@/components/qr-badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/common'
import { downloadQrPng } from '@/lib/qr'
import { formatDate } from '@/lib/utils'

/**
 * The meeting's check-in code, for organisers to project or print.
 *
 * Shown big and on white: it gets photographed across a hall, and a QR on a
 * tinted background is what makes phones fail to read it.
 *
 * This code is not a secret -- everyone in the room can see it, which is the
 * point. It only names the meeting; a member still has to sign in for their
 * attendance to be recorded, so a photographed poster cannot check anyone in on
 * its own.
 */
export function MeetingCheckInCode({ meeting }) {
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)

  if (!meeting?.qr_token) return null

  const download = async () => {
    setDownloading(true)
    try {
      await downloadQrPng(meeting.qr_token, `${(meeting.title || 'meeting').replace(/\s+/g, '-').toLowerCase()}-check-in.png`)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <QrCode className="size-4" />
        Check-in code
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Check-in code</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-center">
            <div>
              <p className="font-medium">{meeting.title}</p>
              <p className="text-sm text-muted-foreground">{formatDate(meeting.date)}</p>
            </div>

            <div className="flex justify-center">
              {/* White plate: contrast is what makes it scannable at distance. */}
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <QrImage token={meeting.qr_token} width={260} />
              </div>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Project or print this. Members sign in at{' '}
              <span className="font-medium text-foreground">/check-in</span> and scan it to be
              recorded present.
            </p>

            <Button className="w-full" onClick={download} disabled={downloading}>
              {downloading ? <Spinner /> : <Download className="size-4" />}
              Download code
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
