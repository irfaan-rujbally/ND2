<?php

namespace App\Rest\Resources;

use Illuminate\Contracts\Database\Eloquent\Builder;
use Lomkit\Rest\Http\Requests\RestRequest;
use Lomkit\Rest\Relations\BelongsTo;
use App\Rest\Actions\AttachMemberToMeetingAction;
use App\Rest\Actions\DetachMemberFromMeetingAction;
use Lomkit\Rest\Relations\BelongsToMany;

class MeetingResource extends Resource
{
    public static $model = \App\Models\Meeting::class;

    public function fields(RestRequest $request): array
    {
        return [
            'id',
            // The check-in code organisers display at the door. Readable, never
            // writable: it is minted on create and rewriting it would invalidate
            // a code already printed on a poster.
            'qr_token',
            'title',
            'office_id',
            'date',
            /*
             * Attendees of any office. The `members` count aggregate cannot be
             * used for this: Lomkit runs the aggregate through MemberResource,
             * whose searchQuery is scoped to the caller's office, so a visitor
             * from another office went uncounted while the participants list
             * showed them. Added to the query by searchQuery below.
             */
            'participants_count',
            'start_time',
            'end_time',
            'topic',
            'attachment_path',
            'created_at',
            'updated_at',
            'deleted_at',
        ];
    }

    public function relations(RestRequest $request): array
    {
        return [
            BelongsTo::make('office', OfficeResource::class),
            BelongsToMany::make('members', MemberResource::class),
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
        return ['date' => 'desc'];
    }

    /**
     * Attendance is managed through actions rather than raw relation mutations
     * so that attaching a member stays idempotent (see AttachMemberToMeetingAction)
     * and detaching soft deletes the pivot instead of destroying it.
     */
    public function actions(RestRequest $request): array
    {
        return [
            AttachMemberToMeetingAction::make(),
            DetachMemberFromMeetingAction::make(),
        ];
    }

    public function rules(RestRequest $request): array
    {
        return [
            'title'           => ['required', 'max:50'],
            'attachment_path' => ['nullable', 'max:50'],
            'office_id'       => ['required', 'exists:offices,id'],
            'topic'           => ['nullable', 'max:50'],
            'date'            => ['nullable', 'date'],
            /*
             * TIME columns, so a time of day and nothing else. Both formats are
             * accepted because an <input type="time"> submits "19:30" while a
             * record read back from MySQL carries "19:30:00", and an edit form
             * that round-trips the value unchanged must not fail validation.
             */
            'start_time'      => ['nullable', 'date_format:H:i,H:i:s'],
            'end_time'        => ['nullable', 'date_format:H:i,H:i:s', 'after:start_time'],
        ];
    }

    public function searchQuery(RestRequest $request, Builder $query): Builder
    {
        // The relation already excludes detached (soft deleted) pivot rows.
        return $query
            ->withCount('members as participants_count')
            ->where('meetings.office_id', $request->user()->office_id);
    }

    public function mutateQuery(RestRequest $request, Builder $query): Builder
    {
        return $query->where('meetings.office_id', $request->user()->office_id);
    }

    public function destroyQuery(RestRequest $request, Builder $query): Builder
    {
        return $query->where('meetings.office_id', $request->user()->office_id);
    }

    public function restoreQuery(RestRequest $request, Builder $query): Builder
    {
        return $query->where('meetings.office_id', $request->user()->office_id);
    }

    public function forceDeleteQuery(RestRequest $request, Builder $query): Builder
    {
        return $query->where('meetings.office_id', $request->user()->office_id);
    }
}
