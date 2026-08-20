import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Clock3, LayoutTemplate, Newspaper, RefreshCw, Sparkles } from 'lucide-react'

import { EmptyState, ErrorState, Spinner } from '@/components/common'
import { FacebookPagePlugin } from '@/components/facebook-page-plugin'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { memberApi } from '@/lib/memberApi'
import { cn } from '@/lib/utils'

function formatPublishedAt(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function PostLink({ post, className, children }) {
  if (!post.permalink_url) return children
  return <a href={post.permalink_url} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
}

function PublishedAt({ post, light = false }) {
  return (
    <div className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', light && 'text-white/75')}>
      <Clock3 className="size-3.5" />
      <time dateTime={post.created_time}>{formatPublishedAt(post.created_time)}</time>
    </div>
  )
}

function FeaturedPost({ post }) {
  return (
    <Card className="group overflow-hidden border-0 bg-nd-blue text-white shadow-lg shadow-nd-blue/10">
      <div className={cn('grid', post.image_url && 'md:grid-cols-[1.12fr_0.88fr]')}>
        {post.image_url && (
          <PostLink post={post} className="flex min-h-64 items-center justify-center overflow-hidden bg-white md:min-h-80">
            <img src={post.image_url} alt="" className="h-full max-h-[38rem] w-full object-contain transition duration-500 group-hover:scale-[1.015]" />
          </PostLink>
        )}
        <div className="relative flex min-h-64 flex-col overflow-hidden p-6 sm:p-8">
          <div className="absolute -right-16 -top-16 size-52 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/75">
            <Sparkles className="size-4 text-red-300" /> Latest update
          </div>
          <p className="relative mt-5 whitespace-pre-wrap break-words text-sm font-medium leading-6 sm:text-base sm:leading-7">
            {post.message || 'New update from Nouveaux Démocrates'}
          </p>
          <div className="relative mt-auto flex flex-wrap items-center justify-between gap-4 pt-8">
            <PublishedAt post={post} light />
            {post.permalink_url && (
              <PostLink post={post} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-nd-blue transition hover:bg-white/90">
                Read on Facebook <ArrowUpRight className="size-4" />
              </PostLink>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

function NewsCard({ post }) {
  return (
    <Card className="group flex h-full flex-col overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-lg">
      {post.image_url ? (
        <PostLink post={post} className="block aspect-[16/10] overflow-hidden bg-muted">
          <img src={post.image_url} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        </PostLink>
      ) : (
        <div className="flex aspect-[16/7] items-center justify-center bg-gradient-to-br from-nd-blue to-primary">
          <Newspaper className="size-10 text-white/70" />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <PublishedAt post={post} />
        <p
          className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground"
          style={{ display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {post.message || 'New update from Nouveaux Démocrates'}
        </p>
        {post.permalink_url && (
          <PostLink post={post} className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-primary hover:underline">
            Continue reading
            <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </PostLink>
        )}
      </div>
    </Card>
  )
}

/*
 * Two ways to show the same page: our own cards, built from the Graph API, and
 * Facebook's Page Plugin, which embeds their timeline in an iframe. The toggle
 * is here so both can be compared before settling on one.
 */
function EmbeddedTimeline() {
  return (
    <div className="space-y-4">
      <FacebookPagePlugin height={720} />
      <p className="text-xs text-muted-foreground">
        The timeline is rendered by Facebook inside an iframe: it always shows their styling, needs no page access token,
        and is hidden entirely when a browser blocks facebook.com.
      </p>
    </div>
  )
}

function ViewToggle({ view, onChange }) {
  const options = [
    { key: 'cards', label: 'Our cards', icon: Newspaper },
    { key: 'facebook', label: 'Facebook embed', icon: LayoutTemplate },
  ]

  return (
    <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="News layout">
      {options.map(({ key, label, icon: Icon }) => (
        <Button
          key={key}
          type="button"
          size="sm"
          variant={view === key ? 'secondary' : 'ghost'}
          aria-pressed={view === key}
          onClick={() => onChange(key)}
        >
          <Icon className="size-4" /> {label}
        </Button>
      ))}
    </div>
  )
}

function NewsFeed() {
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['member', 'news'], queryFn: () => memberApi.news(), staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000, refetchIntervalInBackground: true,
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="size-6 text-primary" /></div>
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const posts = data?.data ?? []
  if (posts.length === 0) {
    return <EmptyState icon={Newspaper} title="No news yet" description="The latest posts from Nouveaux Démocrates will appear here." />
  }

  const [latest, ...olderPosts] = posts

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-3">
        {dataUpdatedAt > 0 && (
          <p className="hidden text-xs text-muted-foreground sm:block">
            Updated {new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(dataUpdatedAt)}
          </p>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh news">
          <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} /> Refresh
        </Button>
      </div>

      <FeaturedPost post={latest} />

      {olderPosts.length > 0 && (
        <section aria-labelledby="more-news-heading">
          <div className="mb-4 flex items-center gap-3">
            <h2 id="more-news-heading" className="text-sm font-semibold uppercase tracking-wider">More stories</h2>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {olderPosts.map((post) => <NewsCard key={post.id} post={post} />)}
          </div>
        </section>
      )}
    </div>
  )
}

export default function News() {
  const [view, setView] = useState('cards')

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-nd-red">
            <span className="h-px w-6 bg-nd-red" /> Official feed
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Latest news</h1>
          <p className="mt-1 text-sm text-muted-foreground">Updates from Nouveaux Démocrates on Facebook.</p>
        </div>
        <ViewToggle view={view} onChange={setView} />
      </header>

      {view === 'cards' ? <NewsFeed /> : <EmbeddedTimeline />}
    </div>
  )
}
