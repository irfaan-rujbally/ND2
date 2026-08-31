import { FacebookPagePlugin } from '@/components/facebook-page-plugin'

/**
 * The party's public Facebook feed, embedded through Facebook's own Page Plugin.
 *
 * There were two ways to show this page -- our own cards built from the Graph
 * API, and this embed -- behind a Default/Custom toggle, so the office could
 * compare them before settling on one. It settled on the embed, so the toggle
 * and the card layout are gone rather than left unreachable behind a `false`.
 * Both are in the history if the decision is ever revisited.
 *
 * `/api/member/news` still serves the Graph API posts and now has no caller in
 * the portal.
 */
export default function News() {
  return (
    <div className="space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-nd-red">
          <span className="h-px w-6 bg-nd-red" /> Official feed
        </div>
        {/* "News" is printed by MemberLayout as the tab's name. */}
        <p className="text-sm text-muted-foreground">Updates from Nouveaux Démocrates on Facebook.</p>
      </header>

      <FacebookPagePlugin height={720} />
    </div>
  )
}
