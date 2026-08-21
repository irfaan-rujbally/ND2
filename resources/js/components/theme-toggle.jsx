import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Shared by both layouts, so the preference carries between them. */
const STORAGE_KEY = 'nd.theme'

/**
 * Light/dark switch.
 *
 * Shared between the staff layout and the member portal rather than written
 * twice: the two would otherwise drift, and the whole point of the stored key is
 * that a member who sets dark once keeps it wherever they land.
 *
 * No stored preference means follow the operating system, which is what someone
 * who has never touched the switch expects.
 *
 * Note there is a matching inline script in resources/views/app.blade.php that
 * applies the class before first paint. Without it a dark-mode visitor gets a
 * white flash on every load, because this effect cannot run until the bundle has
 * parsed. If you change the key or the logic here, change it there too.
 */
export function ThemeToggle({ className }) {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
  }, [dark])

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={() => setDark((value) => !value)}
      /* Says what the button will do, not what the theme currently is -- the
         icon already shows that. */
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  )
}
