import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessagesSquare,
  Moon,
  Sun,
  UserCog,
  Users,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn, initials } from '@/lib/utils'

const navigation = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/meetings', label: 'Meetings', icon: CalendarDays },
  { to: '/members', label: 'Members', icon: Users },
  { to: '/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/forum', label: 'Forum', icon: MessagesSquare },
  { to: '/users', label: 'Users', icon: UserCog },
]

/**
 * h-16 matches the header height exactly, so the sidebar's bottom border lines
 * up with the topbar's instead of sitting 8px lower. The logo fills the row.
 */
function Brand({ className }) {
  return (
    <div className={cn('flex h-16 shrink-0 items-center border-b px-2', className)}>
      {/*
        logo-new-nav.png is logo-new.png pre-scaled to 260x104 — exactly twice
        the 130x52 this row renders, so it stays crisp on a retina screen. The
        1002px original went soft here: browsers resample a 7.7x reduction in
        one cheap pass and the thin strokes in the tree smear.
      */}
      <img
        src="/images/logo-new-nav.png"
        alt="Nouveaux Démocrates"
        width={260}
        height={104}
        className="h-[52px] w-full object-contain"
      />
    </div>
  )
}

function NavItems({ onNavigate, className }) {
  return (
    <nav className={cn('flex flex-col gap-1 p-3', className)}>
      {navigation.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )
          }
        >
          <Icon className="size-4 shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('nd.theme')
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('nd.theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <Button variant="ghost" size="icon" onClick={() => setDark((value) => !value)} aria-label="Toggle theme">
      {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  )
}

export function AppLayout() {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  // Close the drawer whenever navigation happens.
  useEffect(() => setMobileOpen(false), [location.pathname])

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-card lg:flex">
        <Brand />
        <NavItems className="min-h-0 flex-1 overflow-y-auto" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b bg-card/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/70">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0">
              <Brand className="pr-12" />
              <SheetClose asChild>
                <div>
                  <NavItems onNavigate={() => setMobileOpen(false)} />
                </div>
              </SheetClose>
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Meeting Management System</p>
            {user?.office?.name ? (
              <p className="truncate text-xs text-muted-foreground">{user.office.name}</p>
            ) : null}
          </div>

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {initials(user?.first_name, user?.last_name)}
                </span>
                <span className="hidden max-w-32 truncate text-sm sm:block">{user?.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="font-normal">
                <span className="block text-sm font-medium">{user?.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => logout()}>
                <LogOut className="size-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
