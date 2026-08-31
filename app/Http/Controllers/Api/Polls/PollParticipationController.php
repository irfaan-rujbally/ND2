<?php

namespace App\Http\Controllers\Api\Polls;

use App\Http\Controllers\Controller;
use App\Models\Member;
use App\Models\Poll;
use App\Models\PollVote;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Who has answered this poll, and who has not.
 *
 * Deliberately not "who voted for what". This reads poll_votes for the set of
 * member ids that appear against the poll and nothing else -- the option column
 * is never selected here, so there is no join for a future change to widen by
 * accident. An office chasing a quorum needs the names; it does not need, and
 * cannot get, the answers behind them.
 *
 * One unpaginated response, like AnnouncementRecipientsController: the screen
 * filters in the browser, and an office is a few hundred members.
 */
class PollParticipationController extends Controller
{
    public function __invoke(Request $request, Poll $poll): JsonResponse
    {
        $this->authorize('viewParticipation', $poll);

        /*
         * Member id => when they first answered. `min` rather than `max` so a
         * multiple-choice ballot reports when the member voted, not when they
         * happened to tick their last box.
         */
        $answeredAt = PollVote::query()
            ->where('poll_id', $poll->id)
            ->selectRaw('member_id, MIN(created_at) as answered_at')
            ->groupBy('member_id')
            ->pluck('answered_at', 'member_id');

        $members = Member::query()
            ->where('office_id', $poll->office_id)
            ->whereNotNull('approved_at')
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get(['id', 'first_name', 'last_name']);

        return response()->json([
            'data' => $members->map(fn (Member $member) => [
                'id'          => $member->id,
                'name'        => trim($member->first_name.' '.$member->last_name),
                'has_voted'   => $answeredAt->has($member->id),
                'answered_at' => $answeredAt->get($member->id),
            ])->values()->all(),
            'meta' => [
                'voted'     => $answeredAt->count(),
                'eligible'  => $members->count(),
            ],
        ]);
    }
}
