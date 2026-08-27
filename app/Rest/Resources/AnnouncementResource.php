<?php

namespace App\Rest\Resources;

use App\Rest\Actions\SendAnnouncementToMembersAction;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Lomkit\Rest\Http\Requests\RestRequest;
use Lomkit\Rest\Relations\BelongsTo;

class AnnouncementResource extends Resource
{
    public static $model = \App\Models\Announcement::class;

    /** Matches the limit the upload endpoint enforces. */
    public const MAX_IMAGE_KILOBYTES = 5120;

    public function fields(RestRequest $request): array
    {
        return [
            'id',
            'office_id',
            'title',
            'description',
            'image_path',
            /*
             * The token behind the public image URL. Readable so the list and the
             * detail screen can render the image without a second request; never
             * writable -- Announcement::booted reverts any attempt, because
             * rotating it would break the image in every email already sent.
             */
            'public_token',
            'created_by',
            /*
             * How many members it reached, and how many attempts are still
             * outstanding. Added to the query by searchQuery below rather than
             * declared as aggregates: an aggregate over the recipients relation
             * would run through no resource of its own, and both numbers need a
             * condition on sent_at that an aggregate cannot express.
             */
            'sent_count',
            'pending_count',
            'queued_count',
            'last_sent_at',
            'created_at',
            'updated_at',
            'deleted_at',
        ];
    }

    public function relations(RestRequest $request): array
    {
        return [
            BelongsTo::make('office', OfficeResource::class),
            BelongsTo::make('author', UserResource::class),
        ];
    }

    public function scopes(RestRequest $request): array
    {
        return ['withTrashed', 'onlyTrashed'];
    }

    public function limits(RestRequest $request): array
    {
        return [10, 25, 50, 100];
    }

    public function defaultOrderBy(RestRequest $request): array
    {
        return ['created_at' => 'desc'];
    }

    /**
     * Sending is an action, not a relation mutation: it has to be idempotent per
     * member and it queues work rather than writing a row and returning.
     */
    public function actions(RestRequest $request): array
    {
        return [
            SendAnnouncementToMembersAction::make(),
        ];
    }

    public function rules(RestRequest $request): array
    {
        return [
            'office_id'   => ['required', 'exists:offices,id'],
            'title'       => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:5000'],
            /*
             * A path produced by AnnouncementImageController, not a file. The
             * REST resources speak JSON only, so the upload is a separate
             * multipart request and this field just records where it landed.
             */
            'image_path'  => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * Counts for the list and detail screens.
     *
     * withCount runs one subquery per entry, so this stays a single statement no
     * matter how many announcements are on the page.
     */
    public function searchQuery(RestRequest $request, Builder $query): Builder
    {
        return $query
            ->withCount([
                'recipients as sent_count'    => fn ($q) => $q->whereNotNull('sent_at'),
                'recipients as pending_count' => fn ($q) => $q->whereNull('sent_at'),
                /*
                 * Narrower than pending_count, which also counts the attempts
                 * that failed for good. This one is "still in the worker's
                 * hands", which is what the detail screen polls on: counting a
                 * permanent bounce as outstanding would leave it refreshing for
                 * ever.
                 */
                'recipients as queued_count' => fn ($q) => $q->whereNull('sent_at')->whereNull('error'),
            ])
            ->withMax('recipients as last_sent_at', 'sent_at')
            ->where('announcements.office_id', $request->user()->office_id);
    }

    public function mutateQuery(RestRequest $request, Builder $query): Builder
    {
        return $query->where('announcements.office_id', $request->user()->office_id);
    }

    public function destroyQuery(RestRequest $request, Builder $query): Builder
    {
        return $query->where('announcements.office_id', $request->user()->office_id);
    }

    public function restoreQuery(RestRequest $request, Builder $query): Builder
    {
        return $query->where('announcements.office_id', $request->user()->office_id);
    }

    public function forceDeleteQuery(RestRequest $request, Builder $query): Builder
    {
        return $query->where('announcements.office_id', $request->user()->office_id);
    }
}
