<?php

namespace App\Http\Controllers\Api\Polls;

use App\Http\Controllers\Controller;
use App\Models\Poll;
use App\Support\ActivityNotifier;
use App\Support\PollPresenter;
use Illuminate\Http\JsonResponse;

/**
 * Closing a poll, and reopening one closed by mistake.
 *
 * Its own controller because closing is not an edit: it is the moment the
 * question stops being asked, it carries its own ability on the policy, and it
 * tells every member of the office that the answer is in.
 */
class PollStatusController extends Controller
{
    public function close(Poll $poll): JsonResponse
    {
        $this->authorize('close', $poll);

        /*
         * Idempotent. Two administrators pressing Close within a second of each
         * other must not move closed_at -- the second press would rewrite when
         * the party stopped listening, which is exactly the fact the timestamp
         * exists to record.
         */
        if ($poll->closed_at === null) {
            $poll->forceFill(['closed_at' => now()])->save();

            ActivityNotifier::officeMembers(
                $poll->office_id,
                'poll_closed',
                'Poll closed',
                $poll->title,
                '/my/polls'
            );
        }

        return response()->json(['data' => PollPresenter::withResults($poll->load(['options', 'author']))]);
    }

    /**
     * Reopening.
     *
     * Clears the deadline as well as closed_at: a poll that shut because its
     * deadline passed would otherwise be reopened into the same expired state,
     * and the button would look broken. The office sets a new deadline if it
     * wants one.
     */
    public function reopen(Poll $poll): JsonResponse
    {
        $this->authorize('close', $poll);

        $poll->forceFill(['closed_at' => null, 'closes_at' => null])->save();

        return response()->json(['data' => PollPresenter::withResults($poll->load(['options', 'author']))]);
    }
}
