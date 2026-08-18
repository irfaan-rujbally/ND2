import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/AuthProvider'

/**
 * Shown when a signed-in account lacks the admin role, replacing the old
 * Errors/Unauthorized Inertia page.
 */
export default function Unauthorized() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-destructive/10 text-destructive">
        <ShieldAlert className="size-7" />
      </span>
      <div>
        <h1 className="text-2xl font-bold">Not authorised</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {user?.name ? `${user.name}, your ` : 'Your '}
          account does not have permission to use this section. Ask an administrator to grant you the
          admin role.
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link to="/">Go to dashboard</Link>
        </Button>
        <Button variant="ghost" onClick={() => logout()}>
          Log out
        </Button>
      </div>
    </div>
  )
}
