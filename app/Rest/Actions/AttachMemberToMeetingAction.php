<?php

namespace App\Rest\Actions;

use App\Models\Meeting;
use App\Models\Member;
use App\Models\MeetingHasMember;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Gate;
use Lomkit\Rest\Actions\Action as RestAction;
use Lomkit\Rest\Http\Requests\RestRequest;

/**
 * Records a member's attendance at a meeting.
 *
 * Replaces the old MeetingsController::addToMeeting endpoint and keeps both of
 * its behaviours: an existing member can be attached by id, or a brand new
 * member can be created inline from the attendance screen. A member can also be
 * identified by the QR token on their badge, which is how phone scanning works.
 *
 * Unlike the old endpoint it will never create a duplicate attendance row. The
 * pivot is soft deleted, so a previously removed attendance is restored rather
 * than inserted again, which also keeps attendance percentages honest.
 */
class AttachMemberToMeetingAction extends RestAction
{
    public function fields(RestRequest $request): array
    {
        return [
            'member_id'    => ['nullable', 'integer', 'exists:members,id'],
            'qr_token'     => ['nullable', 'string', 'size:32'],
            'first_name'   => ['nullable', 'string', 'max:50'],
            'last_name'    => ['nullable', 'string', 'max:50'],
            'email'        => ['nullable', 'email', 'max:50'],
            'phone'        => ['nullable', 'string', 'max:50'],
            'address'      => ['nullable', 'string', 'max:250'],
            'constituency' => ['nullable', 'string', 'max:50'],
        ];
    }

    /**
     * $fields arrives already keyed by field name: the package maps the
     * client's {name, value} pairs before calling handle().
     */
    public function handle(array $fields, Collection $models)
    {
        $values = collect($fields);

        foreach ($models as $meeting) {
            $member = $this->resolveMember($values, $meeting);

            Gate::authorize('attachMember', [$meeting, $member]);

            $this->attachOnce($meeting, $member);
        }
    }

    /**
     * Either an existing member of the meeting's office, or a new one created
     * inline. New members inherit the meeting's office rather than the
     * hardcoded office_id = 1 the old endpoint used.
     */
    protected function resolveMember(Collection $values, Meeting $meeting): Member
    {
        // A scanned QR badge identifies the member by token.
        if ($values->get('qr_token')) {
            return Member::where('office_id', $meeting->office_id)
                ->where('qr_token', $values->get('qr_token'))
                ->firstOr(function () {
                    abort(404, 'This QR code does not match any member of this office.');
                });
        }

        if ($values->get('member_id')) {
            return Member::where('office_id', $meeting->office_id)
                ->findOrFail($values->get('member_id'));
        }

        return Member::create([
            'first_name'   => $values->get('first_name'),
            'last_name'    => $values->get('last_name'),
            'email'        => $values->get('email'),
            'phone'        => $values->get('phone'),
            'address'      => $values->get('address'),
            'constituency' => $values->get('constituency'),
            'office_id'    => $meeting->office_id,
        ]);
    }

    /**
     * Idempotent attach: no-op when already present, restore when previously
     * removed, insert otherwise.
     */
    protected function attachOnce(Meeting $meeting, Member $member): void
    {
        $existing = MeetingHasMember::withTrashed()
            ->where('meeting_id', $meeting->id)
            ->where('member_id', $member->id)
            ->first();

        if ($existing === null) {
            MeetingHasMember::create([
                'meeting_id' => $meeting->id,
                'member_id'  => $member->id,
            ]);

            return;
        }

        if ($existing->trashed()) {
            $existing->restore();
        }
    }
}
