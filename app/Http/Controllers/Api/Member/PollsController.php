<?php

namespace App\Http\Controllers\Api\Member;

use App\Http\Controllers\Controller;
use App\Models\Member;
use App\Models\Poll;
use App\Models\PollVote;
use App\Support\PollPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The polls a member may answer, newest first.
 *
 * Scoped to the member's own office, like the announcements feed and for the
 * same reason: a poll is the office asking its own members a question, and a
 * member with no office recorded sees nothing rather than everything.
 *
 * Results are attached once the member has answered, or once the poll has shut.
 * Withholding them until then is not secrecy -- the numbers are public the
 * moment you have voted -- it is so that the running total cannot pull a member
 * who has not yet made up their mind.
 */
class PollsController extends Controller
{
    /** Capped rather than paginated, as the rest of the portal is. */
    private const LIMIT = 50;

    public function __invoke(Request $request): JsonResponse
    {
        /** @var Member $member */
        $member = $request->user();

        if ($member->office_id === null) {
            return response()->json(['data' => [], 'meta' => ['total' => 0, 'limit' => self::LIMIT]]);
        }

        $query = Poll::query()->where('office_id', $member->office_id);

        $total = $query->count();

        $polls = $query
            ->with('options')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(self::LIMIT)
            ->get();

        // One query for every poll on the page rather than one per poll.
        $chosen = PollVote::query()
            ->where('member_id', $member->id)
            ->whereIn('poll_id', $polls->pluck('id'))
            ->get(['poll_id', 'poll_option_id'])
            ->groupBy('poll_id');

        return response()->json([
            'data' => $polls->map(function (Poll $poll) use ($chosen) {
                $mine = $chosen->get($poll->id)?->pluck('poll_option_id')->all() ?? [];

                return $mine !== [] || ! $poll->isOpen()
                    ? PollPresenter::withResults($poll, $mine)
                    : PollPresenter::poll($poll, $mine);
            })->values()->all(),
            'meta' => ['total' => $total, 'limit' => self::LIMIT],
        ]);
    }
}
