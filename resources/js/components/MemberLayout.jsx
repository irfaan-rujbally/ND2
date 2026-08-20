import { NavLink, Outlet } from 'react-router-dom'
import { CalendarCheck, KeyRound, LogOut, ScanLine, UserCircle } from 'lucide-react'

import { useMemberAuth } from '@/auth/MemberAuthProvider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
 * hiding most of a staff menu, the portal has its own -- three destinations, all
 * of them the member's own business.
 *
 * Built mobile first, because check-in happens on a phone at a door.
 */

const navigation = [
  { to: '/my', label: 'My details', icon: UserCircle, end: true },
  { to: '/my/meetings', label: 'My meetings', icon: CalendarCheck },
  { to: '/my/password', label: 'Password', icon: KeyRound },
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
          <div className="ml-auto flex items-center gap-2">
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

      <nav className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl gap-6 overflow-x-auto px-4 sm:px-6">

          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  /*
                   * No horizontal padding: the tab's label and its active
                   * underline then start exactly on the page's content edge, the
                   * same one the cards below use. Spacing between tabs comes
                   * from the row's gap instead.
                   */
                  'flex items-center gap-2 whitespace-nowrap border-b-2 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )
              }
            >
              <Icon className="size-4" />
              {label}
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
