<?php

namespace App\Rest\Actions;

use App\Models\Member;
use App\Models\MeetingHasMember;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Gate;
use Lomkit\Rest\Actions\Action as RestAction;
use Lomkit\Rest\Http\Requests\RestRequest;

/**
 * Removes a member's attendance from a meeting.
 *
 * The pivot row is soft deleted rather than destroyed, so the attendance
 * history stays auditable and a re-attach restores the original row.
 */
class DetachMemberFromMeetingAction extends RestAction
{
    public function fields(RestRequest $request): array
    {
        return [
            'member_id' => ['required', 'integer', 'exists:members,id'],
        ];
    }

    public function handle(array $fields, Collection $models)
    {
        $memberId = $fields['member_id'] ?? null;

        $member = Member::findOrFail($memberId);

        foreach ($models as $meeting) {
            Gate::authorize('detachMember', [$meeting, $member]);

            MeetingHasMember::where('meeting_id', $meeting->id)
                ->where('member_id', $member->id)
                ->whereNull('deleted_at')
                ->get()
                ->each
                ->delete();
        }
    }
}
