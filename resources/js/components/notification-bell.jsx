import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellRing, CheckCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

function relativeTime(value) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000)
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second')
  if (Math.abs(seconds) < 3600) return formatter.format(Math.round(seconds / 60), 'minute')
  if (Math.abs(seconds) < 86400) return formatter.format(Math.round(seconds / 3600), 'hour')
  return formatter.format(Math.round(seconds / 86400), 'day')
}

export function NotificationBell({ queryKey, notificationApi }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey,
    queryFn: notificationApi.list,
    refetchInterval: 30_000,
  })
  const rows = query.data?.data ?? []
  const unread = query.data?.unread_count ?? 0
  const pushSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => {
    if (!pushSupported) return
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setPushEnabled(Boolean(subscription)))
      .catch(() => {})
  }, [pushSupported])

  const read = useMutation({
    mutationFn: notificationApi.read,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  const readAll = useMutation({
    mutationFn: notificationApi.readAll,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const openNotification = (notification) => {
    if (!notification.read_at) read.mutate(notification.id)
    if (notification.url) navigate(notification.url)
  }

  const togglePush = async (event) => {
    event.preventDefault()
    setPushBusy(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      if (existing) {
        await notificationApi.deletePushSubscription(existing.endpoint)
        await existing.unsubscribe()
        setPushEnabled(false)
        toast.success('Phone notifications disabled.')
        return
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notification permission was not granted.')
      const { public_key: publicKey } = await notificationApi.pushKey()
      const padding = '='.repeat((4 - (publicKey.length % 4)) % 4)
      const raw = atob((publicKey + padding).replace(/-/g, '+').replace(/_/g, '/'))
      const applicationServerKey = Uint8Array.from(raw, (character) => character.charCodeAt(0))
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
      const json = subscription.toJSON()
      await notificationApi.savePushSubscription({
        endpoint: json.endpoint,
        keys: json.keys,
        content_encoding: PushManager.supportedContentEncodings?.[0] || 'aes128gcm',
      })
      setPushEnabled(true)
      toast.success('Phone notifications enabled.')
    } catch (error) {
      toast.error(error.message || 'Could not enable phone notifications.')
    } finally {
      setPushBusy(false)
    }
  }

  return <DropdownMenu onOpenChange={(open) => open && query.refetch()}>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" className="relative" aria-label={`${unread} unread notifications`}>
        <Bell className="size-5" />
        {unread > 0 ? <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">{unread > 99 ? '99+' : unread}</span> : null}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
      <div className="flex items-center justify-between px-4 py-3">
        <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
        {unread > 0 ? <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={(event) => { event.preventDefault(); readAll.mutate() }}><CheckCheck className="size-3.5" />Mark all read</Button> : null}
      </div>
      {pushSupported ? <div className="border-t px-3 py-2">
        <Button variant="ghost" size="sm" className="w-full justify-start" disabled={pushBusy} onClick={togglePush}>
          <BellRing className="size-4" />
          {pushBusy ? 'Updating…' : pushEnabled ? 'Disable phone notifications' : 'Enable phone notifications'}
        </Button>
      </div> : null}
      <DropdownMenuSeparator className="m-0" />
      <div className="max-h-[min(28rem,70dvh)] overflow-y-auto">
        {query.isPending ? <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No notifications yet.</p> : rows.map((notification) => <button key={notification.id} type="button" onClick={() => openNotification(notification)} className={cn('block w-full border-b px-4 py-3 text-left transition-colors last:border-0 hover:bg-accent', !notification.read_at && 'bg-primary/5')}>
          <span className="flex items-start gap-3">
            <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', notification.read_at ? 'bg-transparent' : 'bg-primary')} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{notification.title}</span>
              {notification.message ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{notification.message}</span> : null}
              <span className="mt-1 block text-[11px] text-muted-foreground">{relativeTime(notification.created_at)}</span>
            </span>
          </span>
        </button>)}
      </div>
    </DropdownMenuContent>
  </DropdownMenu>
}
