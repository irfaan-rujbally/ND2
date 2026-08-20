<?php

namespace App\Http\Controllers\Api\Member;

use App\Http\Controllers\Controller;
use App\Models\Meeting;
use App\Models\Member;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The meetings a member attended, and how that compares with the meetings they
 * could have attended.
 *
 * This is not the staff meetings list: it returns only the signed-in member's own
 * attendance, taken from the token, and nothing about who else was there.
 *
 * The percentage needs a denominator, and "every meeting in the database" would
 * be wrong -- a member cannot attend another office's meeting, and the staff
 * attendance screen will not even let them. So eligibility is:
 *
 *   - meetings of the member's own office,
 *   - whose date has already passed (a meeting next week is not a missed one).
 *
 * For the 64 members with no office recorded there is nothing to scope by, so
 * every past meeting counts and the response says so via `scope`, letting the UI
 * caveat the figure rather than present a number built on a guess.
 */
class MeetingsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        /** @var Member $member */
        $member = $request->user();

        $attended = $member->meetings()
            ->orderByDesc('date')
            ->get([
                'meetings.id', 'meetings.title', 'meetings.date',
                'meetings.start_time', 'meetings.end_time', 'meetings.office_id',
            ]);

        $eligible = Meeting::query()
            ->whereDate('date', '<=', now())
            ->when($member->office_id !== null, fn ($q) => $q->where('office_id', $member->office_id))
            ->count();

        /*
         * The soonest meeting still to come, scoped the same way as eligibility
         * above -- a member cannot attend another office's meeting, so showing
         * one would only send them to the wrong hall. Today counts as upcoming:
         * `date` has no time component, so a meeting dated today may not have
         * started yet, and it is exactly the one they need to check in to.
         */
        $next = Meeting::query()
            ->with('office:id,name')
            ->whereDate('date', '>=', now())
            ->when($member->office_id !== null, fn ($q) => $q->where('office_id', $member->office_id))
            ->orderBy('date')
            ->first();

        /*
         * Only attendances that count towards the denominator are counted in the
         * numerator, or a member who attended a future meeting early, or one from
         * another office, could exceed 100%.
         */
        $attendedEligible = $attended
            ->filter(fn ($m) => $m->date !== null && $m->date->lte(now()))
            ->when($member->office_id !== null, fn ($c) => $c->filter(
                fn ($m) => (int) $m->office_id === (int) $member->office_id
            ))
            ->count();

        return response()->json([
            'data' => $attended->map(fn ($m) => [
                'id'            => $m->id,
                'title'         => $m->title,
                'date'          => $m->date?->toDateString(),
                'start_time'    => $m->start_time,
                'end_time'      => $m->end_time,
                'checked_in_at' => $m->pivot?->created_at?->toIso8601String(),
            ])->values()->all(),
            'meta' => [
                'attended_count'  => $attended->count(),
                'eligible_count'  => $eligible,
                'attendance_rate' => $eligible > 0
                    ? round($attendedEligible / $eligible * 100, 1)
                    : null,
                // Lets the UI say "of your office's meetings" or add a caveat.
                'scope' => $member->office_id !== null ? 'office' : 'all',
                'next_meeting' => $next === null ? null : [
                    'id'         => $next->id,
                    'title'      => $next->title,
                    'date'       => $next->date?->toDateString(),
                    'start_time' => $next->start_time,
                    'end_time'   => $next->end_time,
                    'topic'      => $next->topic,
                    'office'     => $next->office?->name,
                    // Members can check in early, so the card must not invite a
                    // second check-in for a meeting already recorded.
                    'checked_in' => $attended->contains('id', $next->id),
                ],
            ],
        ]);
    }
}
