import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
        <Compass className="size-7" />
      </span>
      <div>
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          That page does not exist or has been moved.
        </p>
      </div>
      <Button asChild>
        <Link to="/">Go to dashboard</Link>
      </Button>
    </div>
  )
}
