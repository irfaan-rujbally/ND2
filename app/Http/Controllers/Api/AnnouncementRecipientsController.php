<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\Member;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

/**
 * Everyone who could be sent this announcement, and what has already happened to
 * each of them.
 *
 * Deliberately not a `search('members', ...)` from the browser. The recipient
 * picker needs three things a paginated resource search cannot give it at once:
 *
 *   - Every candidate in one response. "Select all" has to mean all 500 members
 *     matching the filters, not the 25 currently rendered, and paging through the
 *     resource to collect ids would be several round trips and a lot of state.
 *   - The send status per member, which lives on announcement_recipients and is
 *     specific to this one announcement.
 *   - Only the six columns the picker draws, so the payload stays small enough
 *     for that single response to be the right call.
 *
 * The same endpoint backs the progress figures on the announcement screen, so
 * after a send the page re-reads exactly what it filtered on.
 */
class AnnouncementRecipientsController extends Controller
{
    public function __invoke(Announcement $announcement): JsonResponse
    {
        Gate::authorize('view', $announcement);

        /*
         * Left join, not a whereHas: a member who has never been sent this
         * announcement still belongs in the list, with nulls for the send
         * columns. Scoped to the announcement's own office rather than the
         * caller's -- the policy has already established they are the same, and
         * this way the query cannot drift from what the send action does.
         */
        $members = Member::query()
            ->leftJoin('announcement_recipients', function ($join) use ($announcement) {
                $join->on('announcement_recipients.member_id', '=', 'members.id')
                    ->where('announcement_recipients.announcement_id', '=', $announcement->id);
            })
            ->where('members.office_id', $announcement->office_id)
            ->whereNull('members.deleted_at')
            ->orderBy('members.first_name')
            ->orderBy('members.last_name')
            ->get([
                'members.id',
                'members.first_name',
                'members.last_name',
                'members.email',
                'members.age',
                'members.constituency',
                'announcement_recipients.sent_at',
                'announcement_recipients.error',
            ]);

        return response()->json([
            'data' => $members->map(fn (Member $member) => [
                'id'           => $member->id,
                'first_name'   => $member->first_name,
                'last_name'    => $member->last_name,
                'email'        => $member->email,
                'age'          => $member->age,
                'constituency' => $member->constituency,
                'sent_at'      => $member->sent_at,
                'error'        => $member->error,
            ]),
            'meta' => [
                'total'      => $members->count(),
                'with_email' => $members->filter(fn ($m) => filled($m->email))->count(),
                'sent'       => $members->filter(fn ($m) => $m->sent_at !== null)->count(),
                'failed'     => $members->filter(fn ($m) => $m->sent_at === null && filled($m->error))->count(),
            ],
        ]);
    }
}
