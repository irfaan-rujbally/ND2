import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/*
 * The result of a poll, drawn the same way on both sides of the app.
 *
 * One component rather than one per screen, for the reason PollTally is one
 * class on the server: the office and the members must never be looking at
 * differently-drawn versions of the same decision.
 */

/** The word for a poll's state, and the colour that goes with it. */
export function PollStatusBadge({ status }) {
  if (status === 'open') return <Badge variant="success">Open</Badge>
  if (status === 'expired') return <Badge variant="secondary">Deadline passed</Badge>
  return <Badge variant="secondary">Closed</Badge>
}

/**
 * One option's bar.
 *
 * The bar is sized by share of respondents, not of votes cast — on a
 * multiple-choice poll those differ, and a share of votes puts a number on
 * screen that nobody can act on. See PollTally.
 */
function ResultBar({ option, highlight }) {
  return (
    <li>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className={cn('min-w-0 break-words', highlight && 'font-semibold text-primary')}>
          {option.label}
          {highlight ? <span className="ml-1.5 text-xs font-normal text-primary">· your answer</span> : null}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {option.votes} · {option.share}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', highlight ? 'bg-primary' : 'bg-primary/40')}
          // Inline width because the value is data: Tailwind cannot generate a
          // class per percentage, and rounding to a w-* step would misreport it.
          style={{ width: `${Math.min(option.share, 100)}%` }}
        />
      </div>
    </li>
  )
}

/**
 * @param {object} results  the `results` object the API returns
 * @param {number[]} chosen  option ids to mark as the viewer's own answer
 */
export function PollResults({ results, chosen = [] }) {
  if (!results) return null

  const picked = new Set(chosen)

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {results.options.map((option) => (
          <ResultBar key={option.id} option={option} highlight={picked.has(option.id)} />
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        {results.voter_count} of {results.eligible_count} member
        {results.eligible_count === 1 ? '' : 's'} answered · {results.turnout}% turnout
        {/*
          Only worth saying when it can differ from the number of members who
          answered, which is exactly when the poll takes several answers.
        */}
        {results.total_votes !== results.voter_count ? ` · ${results.total_votes} votes cast` : ''}
      </p>
    </div>
  )
}
