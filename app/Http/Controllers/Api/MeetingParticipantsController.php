<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Meeting;
use App\Models\Member;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Who attended one meeting.
 *
 * This exists outside the REST resources because of who it has to return.
 * MemberResource scopes every read to the caller's own office, which is right
 * for the members list -- another office's membership is not ours to browse --
 * but wrong here: a member who travelled to our meeting and was recorded present
 * is part of *this meeting's* record, and hiding them made the participant count
 * disagree with the list underneath it.
 *
 * Tenanting therefore moves up a level: the caller must be able to view the
 * meeting (MeetingPolicy scopes that to their office), and everyone recorded at
 * that meeting is then returned whatever office they belong to.
 */
class MeetingParticipantsController extends Controller
{
    /** Columns the list may be ordered by. Anything else falls back to arrival order. */
    private const SORTABLE = ['first_name', 'last_name', 'email', 'phone', 'constituency'];

    private const PER_PAGE_MAX = 100;

    public function __invoke(Request $request, Meeting $meeting): JsonResponse
    {
        Gate::authorize('view', $meeting);

        $validated = $request->validate([
            'q'            => ['nullable', 'string', 'max:100'],
            'constituency' => ['nullable', 'integer', 'between:1,21'],
            'sort'         => ['nullable', 'string', 'in:'.implode(',', self::SORTABLE)],
            'direction'    => ['nullable', 'string', 'in:asc,desc'],
            'page'         => ['nullable', 'integer', 'min:1'],
            'limit'        => ['nullable', 'integer', 'min:1', 'max:'.self::PER_PAGE_MAX],
        ]);

        $sort = $validated['sort'] ?? null;
        $direction = $validated['direction'] ?? 'asc';

        $query = $meeting->members()
            ->with('office:id,name')
            ->when(
                $validated['q'] ?? null,
                fn ($q, $term) => $q->where(function ($q) use ($term) {
                    $q->where('members.first_name', 'like', '%'.$term.'%')
                        ->orWhere('members.last_name', 'like', '%'.$term.'%');
                })
            )
            ->when(
                $validated['constituency'] ?? null,
                fn ($q, $constituency) => $q->where('members.constituency', $constituency)
            );

        /*
         * Default order is arrival: whoever was recorded most recently first, the
         * same ordering the attendance panel uses, because this reads as the roll
         * of the meeting and a name-sorted list throws that away. Rows read
         * "first_name last_name", so sorting by name adds the second column --
         * last_name alone left the list looking unsorted.
         */
        if ($sort === null) {
            $query->orderByAttendanceAddedAt($meeting->id);
        } else {
            $query->reorder()->orderBy('members.'.$sort, $direction);

            if ($sort === 'first_name') {
                $query->orderBy('members.last_name', $direction);
            }
        }

        $participants = $query->paginate(
            min($validated['limit'] ?? 25, self::PER_PAGE_MAX),
            ['members.*'],
            'page',
            $validated['page'] ?? 1
        );

        return response()->json([
            'data' => collect($participants->items())->map(fn (Member $member) => [
                'id'           => $member->id,
                'first_name'   => $member->first_name,
                'last_name'    => $member->last_name,
                'email'        => $member->email,
                'phone'        => $member->phone,
                'constituency' => $member->constituency,
                'office'       => $member->office?->name,
                /*
                 * Whether they belong to the office running the meeting. The list
                 * marks these out: an unfamiliar name is easier to trust when the
                 * screen says where they came from.
                 */
                'is_visitor'   => $member->office_id !== $meeting->office_id,
                // Attaching an existing pivot restores it, so updated_at is when
                // they were last recorded present. See Member::scopeOrderByAttendanceAddedAt.
                'recorded_at'  => ($member->pivot->updated_at ?? $member->pivot->created_at)
                    ?->toIso8601String(),
            ])->all(),
            'meta' => [
                'current_page' => $participants->currentPage(),
                'last_page'    => $participants->lastPage(),
                'total'        => $participants->total(),
                // Everyone present, whatever the filters above narrowed the page to.
                'participants' => $meeting->members()->count(),
            ],
        ]);
    }
}
