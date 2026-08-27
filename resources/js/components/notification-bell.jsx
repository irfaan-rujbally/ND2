import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellRing, CheckCheck, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { deviceId } from '@/lib/device'
import { cn } from '@/lib/utils'

/** Travel, in pixels, before a gesture commits to an axis and stops being a scroll. */
const AXIS_LOCK = 8

/** How far left the row must be released for the swipe to count as a delete. */
const DELETE_AT = 88

function relativeTime(value) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000)
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second')
  if (Math.abs(seconds) < 3600) return formatter.format(Math.round(seconds / 60), 'minute')
  if (Math.abs(seconds) < 86400) return formatter.format(Math.round(seconds / 3600), 'hour')
  return formatter.format(Math.round(seconds / 86400), 'day')
}

/**
 * One notification, removable by dragging it to the left.
 *
 * The gesture locks to an axis after AXIS_LOCK pixels and gives up if the finger
 * went vertical, because this list scrolls and a swipe that hijacked a scroll
 * would make the list unusable on a phone. `touch-action: pan-y` is the other
 * half of that: the browser keeps vertical panning to itself and hands us the
 * horizontal movement, cancelling our gesture if it decides to scroll.
 *
 * Pointer events rather than touch events, so one implementation covers a mouse
 * drag too, plus a hover-revealed button for everyone who would never think to
 * drag a list row.
 */
function NotificationRow({ notification, onOpen, onDelete }) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const gesture = useRef(null)

  // Set when a drag actually happened, and read by the click that fires straight
  // afterwards: releasing a swipe must not also open the notification. Cleared
  // when the next gesture starts rather than by the click, because a swipe
  // released off the button fires no click at all and the flag would stay set,
  // swallowing the following genuine tap.
  const swiped = useRef(false)

  const armed = offset <= -DELETE_AT

  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    swiped.current = false
    gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId, axis: null }
  }

  const onPointerMove = (event) => {
    const state = gesture.current
    if (!state || event.pointerId !== state.id) return

    const dx = event.clientX - state.x

    if (state.axis === null) {
      const dy = event.clientY - state.y
      if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return
      state.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (state.axis !== 'x') return
      // Keep receiving moves even once the finger wanders off the row.
      event.currentTarget.setPointerCapture(state.id)
      setDragging(true)
      swiped.current = true
    }

    if (state.axis !== 'x') return
    setOffset(Math.min(0, dx))
  }

  const settle = () => {
    const state = gesture.current
    gesture.current = null
    setDragging(false)

    if (state?.axis === 'x' && armed) {
      // Leave the row where the finger left it; the optimistic cache write
      // unmounts it on the next render, so it never springs back first.
      onDelete()
      return
    }

    setOffset(0)
  }

  return <li className="relative overflow-hidden border-b last:border-0">
    <div aria-hidden className="absolute inset-0 flex items-center justify-end bg-destructive pr-5 text-destructive-foreground">
      <Trash2 className={cn('size-5 transition-transform', armed && 'scale-125')} />
    </div>

    <div
      className={cn('group relative flex bg-popover', !dragging && 'transition-transform duration-200')}
      style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={settle}
      onPointerCancel={settle}
    >
      <button
        type="button"
        className="relative min-w-0 flex-1 px-4 py-3 text-left transition-colors hover:bg-accent"
        onClick={() => {
          if (swiped.current) return
          onOpen()
        }}
      >
        {notification.read_at ? null : <span aria-hidden className="pointer-events-none absolute inset-0 bg-primary/5" />}
        <span className="relative flex items-start gap-3">
          <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', notification.read_at ? 'bg-transparent' : 'bg-primary')} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{notification.title}</span>
            {notification.message ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{notification.message}</span> : null}
            <span className="mt-1 block text-[11px] text-muted-foreground">{relativeTime(notification.created_at)}</span>
          </span>
        </span>
      </button>

      {/* Touch has the swipe; this is the same action for anyone with a mouse. */}
      <button
        type="button"
        aria-label={`Remove notification: ${notification.title}`}
        className="relative hidden w-10 shrink-0 place-items-center text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 sm:grid"
        onClick={() => {
          if (swiped.current) return
          onDelete()
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  </li>
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

  // Clearing cannot be undone and the button sits a thumb's width from the
  // notifications themselves, so it takes two taps. Reset when the menu closes.
  const [confirmingClear, setConfirmingClear] = useState(false)

  useEffect(() => {
    if (!pushSupported) return
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        setPushEnabled(Boolean(subscription))
        if (!subscription) return

        /*
         * Re-send what this browser already holds, on every load. The server
         * keys on the device id, so this is an update rather than a new row,
         * and it is what repairs the two states we cannot otherwise detect: an
         * endpoint the browser rotated behind our back, and a row the server
         * pruned after a provider reported it gone. It also keeps updated_at
         * honest as a last-seen.
         */
        const json = subscription.toJSON()
        return notificationApi.savePushSubscription({
          endpoint: json.endpoint,
          keys: json.keys,
          content_encoding: PushManager.supportedContentEncodings?.[0] || 'aes128gcm',
          device_id: deviceId(),
        })
      })
      // Silent: this is housekeeping the member did not ask for and must never
      // interrupt them. A failure just means the row is refreshed next load.
      .catch(() => {})
  }, [pushSupported, notificationApi])

  const read = useMutation({
    mutationFn: notificationApi.read,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  const readAll = useMutation({
    mutationFn: notificationApi.readAll,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  /*
   * Both removals write the cache before the request leaves. A swipe that left
   * the row on screen until the server answered would read as a failed gesture,
   * and the snapshot puts it back if the request does fail.
   */
  const optimistic = (apply) => ({
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (current) => (current ? apply(current, variables) : current))
      return { previous }
    },
    onError: (error, variables, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(queryKey, context.previous)
      toast.error(error.message || 'The notification could not be removed.')
    },
    // The list is capped server-side, so the refetch also pulls in whatever the
    // removal made room for.
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const remove = useMutation({
    mutationFn: notificationApi.remove,
    ...optimistic((current, id) => {
      const removed = current.data.find((row) => row.id === id)
      return {
        ...current,
        data: current.data.filter((row) => row.id !== id),
        unread_count: Math.max(0, (current.unread_count ?? 0) - (removed && !removed.read_at ? 1 : 0)),
      }
    }),
  })

  const clearAll = useMutation({
    mutationFn: notificationApi.clearAll,
    ...optimistic((current) => ({ ...current, data: [], unread_count: 0 })),
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
        device_id: deviceId(),
      })
      setPushEnabled(true)
      toast.success('Phone notifications enabled.')
    } catch (error) {
      toast.error(error.message || 'Could not enable phone notifications.')
    } finally {
      setPushBusy(false)
    }
  }

  return <DropdownMenu onOpenChange={(open) => {
    setConfirmingClear(false)
    if (open) query.refetch()
  }}>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" className="relative" aria-label={`${unread} unread notifications`}>
        <Bell className="size-5" />
        {unread > 0 ? <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">{unread > 99 ? '99+' : unread}</span> : null}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
      <div className="flex items-center justify-between gap-1 px-4 py-3">
        <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
        <div className="flex items-center gap-1">
          {unread > 0 ? <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={(event) => { event.preventDefault(); readAll.mutate() }}><CheckCheck className="size-3.5" />Mark all read</Button> : null}
          {rows.length > 0 ? <Button
            variant="ghost"
            size="sm"
            className={cn('h-7 gap-1 px-2 text-xs', confirmingClear && 'text-destructive')}
            disabled={clearAll.isPending}
            onClick={(event) => {
              event.preventDefault()
              if (!confirmingClear) {
                setConfirmingClear(true)
                return
              }
              setConfirmingClear(false)
              clearAll.mutate()
            }}
          ><Trash2 className="size-3.5" />{confirmingClear ? 'Tap again to confirm' : 'Clear all'}</Button> : null}
        </div>
      </div>
      {pushSupported ? <div className="border-t px-3 py-2">
        <Button variant="ghost" size="sm" className="w-full justify-start" disabled={pushBusy} onClick={togglePush}>
          <BellRing className="size-4" />
          {pushBusy ? 'Updating…' : pushEnabled ? 'Disable phone notifications' : 'Enable phone notifications'}
        </Button>
      </div> : null}
      <DropdownMenuSeparator className="m-0" />
      <div className="max-h-[min(28rem,70dvh)] overflow-y-auto overflow-x-hidden">
        {query.isPending ? <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No notifications yet.</p> : <ul>
          {rows.map((notification) => <NotificationRow
            key={notification.id}
            notification={notification}
            onOpen={() => openNotification(notification)}
            onDelete={() => remove.mutate(notification.id)}
          />)}
        </ul>}
      </div>
    </DropdownMenuContent>
  </DropdownMenu>
}
