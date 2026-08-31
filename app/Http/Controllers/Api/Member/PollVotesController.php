<?php

namespace App\Http\Controllers\Api\Member;

use App\Http\Controllers\Controller;
use App\Models\Member;
use App\Models\Poll;
use App\Models\PollVote;
use App\Support\PollPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Casting a vote, and changing one.
 *
 * Members hold no role, so there is no policy to consult here: the controller
 * proves for itself that the poll belongs to the member's own office and is
 * still open, exactly as the member forum controllers prove ownership on every
 * write.
 *
 * A member may change their answer while the poll is open. The previous rows are
 * cleared and the new ones written in one transaction, so a change is never
 * half-applied and a multiple-choice ballot cannot end up holding a mixture of
 * two submissions.
 */
class PollVotesController extends Controller
{
    public function store(Request $request, Poll $poll): JsonResponse
    {
        /** @var Member $member */
        $member = $request->user();

        /*
         * 404, not 403. A poll belonging to another office is not a thing this
         * member was refused -- it is a thing they cannot see, and saying
         * "forbidden" would confirm that a poll with that id exists.
         */
        if ($member->office_id === null || $poll->office_id !== $member->office_id) {
            throw new NotFoundHttpException();
        }

        if (! $poll->isOpen()) {
            return response()->json(['message' => 'This poll is closed.'], 422);
        }

        $data = $request->validate([
            'option_ids'   => ['required', 'array', 'min:1', 'max:'.Poll::MAX_OPTIONS],
            'option_ids.*' => ['required', 'integer'],
        ]);

        $optionIds = array_values(array_unique(array_map('intval', $data['option_ids'])));

        if (! $poll->allows_multiple && count($optionIds) > 1) {
            return response()->json(['message' => 'This poll accepts a single answer.'], 422);
        }

        /*
         * Checked against the poll's own options rather than trusted from the
         * request: option ids are sequential across every poll in the
         * application, so an id from somebody else's ballot would otherwise be
         * accepted and counted against a poll it does not belong to.
         */
        $valid = $poll->options()->whereIn('id', $optionIds)->pluck('id');

        if ($valid->count() !== count($optionIds)) {
            return response()->json(['message' => 'That answer is not on this poll.'], 422);
        }

        DB::transaction(function () use ($member, $poll, $optionIds) {
            PollVote::query()->where('poll_id', $poll->id)->where('member_id', $member->id)->delete();

            foreach ($optionIds as $optionId) {
                PollVote::create([
                    'poll_id'        => $poll->id,
                    'poll_option_id' => $optionId,
                    'member_id'      => $member->id,
                ]);
            }
        });

        return response()->json([
            'data' => PollPresenter::withResults($poll->load('options'), $optionIds),
        ], 201);
    }
}
