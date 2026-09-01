<?php

namespace App\Http\Controllers\Api\Polls;

use App\Http\Controllers\Controller;
use App\Models\Member;
use App\Models\Poll;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Every member the office could invite to a poll, and whether this poll already
 * has them.
 *
 * Deliberately not a `search('members', ...)` from the browser, for the reason
 * AnnouncementRecipientsController is not either: the resource pages at a hundred
 * rows, and "select all" has to mean all five hundred members of the office
 * rather than the ones currently rendered. Collecting ids by paging through the
 * resource would be five round trips and a lot of state in the picker.
 *
 * Three columns, so that single unpaginated response stays small. The picker
 * filters in the browser from there.
 *
 * Only approved members: an applicant the office has not accepted cannot sign in
 * to answer, so inviting one would add somebody to the turnout denominator who
 * could never vote.
 */
class PollCandidatesController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        Gate::authorize('create', Poll::class);

        $request->validate(['poll' => ['nullable', 'integer']]);

        $officeId = $request->user()->office_id;

        /*
         * Scoped to the caller's office before the id is used, so passing
         * another office's poll id returns an empty invited set rather than
         * disclosing who was asked over there.
         */
        $invited = Poll::query()
            ->where('office_id', $officeId)
            ->whereKey($request->integer('poll'))
            ->first()
            ?->invitedMembers()
            ->pluck('members.id')
            ->flip() ?? collect();

        $members = Member::query()
            ->where('office_id', $officeId)
            ->whereNotNull('approved_at')
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get(['id', 'first_name', 'last_name']);

        return response()->json([
            'data' => $members->map(fn (Member $member) => [
                'id'      => $member->id,
                'name'    => trim($member->first_name.' '.$member->last_name),
                'invited' => $invited->has($member->id),
            ])->values()->all(),
            'meta' => ['total' => $members->count()],
        ]);
    }
}
