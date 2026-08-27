import { NavLink, Outlet } from 'react-router-dom'
import {
  CalendarCheck,
  AlertTriangle,
  LogOut,
  Megaphone,
  MessagesSquare,
  Newspaper,
  ScanLine,
  UserCircle,
} from 'lucide-react'

import { useMemberAuth } from '@/auth/MemberAuthProvider'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { cn } from '@/lib/utils'
import { NotificationBell } from '@/components/notification-bell'
import { memberApi } from '@/lib/memberApi'

/*
 * Chrome for the member portal.
 *
 * Horizontal padding is px-4 sm:px-6 to match AppLayout's `p-4 sm:p-6`, and the
 * header, the tab bar and the content all carry the same value -- they share the
 * max-w-3xl centre line, so if one of them differs the logo stops lining up with
 * the cards underneath it.
 *
 * Intentionally not AppLayout: that one navigates to the dashboard, the member
 * register and the user admin, none of which a member may open. Rather than
 * hiding most of a staff menu, the portal has its own -- every destination in it
 * is the member's own business.
 *
 * Built mobile first, because check-in happens on a phone at a door.
 */

const navigation = [
  { to: '/my', label: 'My details', icon: UserCircle, end: true },
  { to: '/my/meetings', label: 'My meetings', icon: CalendarCheck },
  /*
   * Announcements before News: these come from the member's own office and are
   * addressed to them, whereas News is the party's public Facebook feed.
   */
  { to: '/my/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/my/forum', label: 'Forum', icon: MessagesSquare },
  { to: '/my/incidents', label: 'Incidents', icon: AlertTriangle },
  { to: '/my/news', label: 'News', icon: Newspaper },
]

export function MemberLayout() {
  const { member, signOut } = useMemberAuth()

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <img
            src="/images/logo-new-nav.png"
            alt="Nouveaux Démocrates"
            width={130}
            height={52}
            className="h-9 w-auto"
          />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {/*
              The same component the staff layout uses, sharing its stored
              preference: a member who sets dark once keeps it, and the two
              implementations cannot drift apart.
            */}
            <ThemeToggle />
            <NotificationBell
              queryKey={['member-notifications']}
              notificationApi={{
                list: memberApi.notifications,
                read: memberApi.readNotification,
                readAll: memberApi.readAllNotifications,
                remove: memberApi.deleteNotification,
                clearAll: memberApi.clearNotifications,
                pushKey: memberApi.pushKey,
                savePushSubscription: memberApi.savePushSubscription,
                deletePushSubscription: memberApi.deletePushSubscription,
              }}
            />

            <Button variant="outline" size="sm" asChild>
              <NavLink to="/check-in">
                <ScanLine className="size-4" />
                <span className="hidden sm:inline">Check in</span>
              </NavLink>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} title="Sign out">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/*
        Two layouts, not one that shrinks.

        On a phone the labels do not fit -- the row scrolled sideways and the last
        tab sat off-screen, so a member could not tell News existed. Below `sm` the
        tabs are icons only and share the width equally, which both fits and gives
        a finger-sized target. From `sm` up the labels return and the tabs go back
        to hugging their content on the left.
      */}
      <nav className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl px-4 sm:gap-6 sm:px-6">

          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  /*
                   * No horizontal padding from `sm` up: the tab's label and its
                   * active underline then start exactly on the page's content
                   * edge, the same one the cards below use. Spacing between tabs
                   * comes from the row's gap instead.
                   */
                  'flex flex-1 items-center justify-center gap-2 whitespace-nowrap border-b-2 py-3',
                  'text-sm font-medium transition-colors sm:flex-none sm:justify-start',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )
              }
            >
              <Icon className="size-5 sm:size-4" />
              {/*
                sr-only rather than hidden: the icon alone is no accessible name,
                so the label stays in the tree for a screen reader and is only
                taken out of view. It is absolutely positioned while sr-only, so
                it adds nothing to the tab's width.
              */}
              <span className="sr-only sm:not-sr-only">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {member && (
          <p className="mb-4 text-sm text-muted-foreground">
            Signed in as {member.first_name} {member.last_name}
          </p>
        )}
        <Outlet />
      </main>
    </div>
  )
}
