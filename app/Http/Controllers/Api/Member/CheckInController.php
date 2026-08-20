<?php

namespace App\Http\Controllers\Api\Member;

use App\Http\Controllers\Controller;
use App\Models\Meeting;
use App\Models\MeetingHasMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Records the signed-in member as present at the meeting whose QR code they
 * scanned.
 *
 * The meeting token is not a secret -- it is projected on a wall or printed on a
 * poster, so everyone in the room has it. It only names *which* meeting. Proving
 * *who* is arriving is the member's sign-in, which is why this route sits behind
 * the portal guard and takes the member from the token, never from the request.
 * A member can therefore only ever check in as themselves.
 */
class CheckInController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'meeting_token' => ['required', 'string', 'max:64'],
        ], [], [
            'meeting_token' => 'meeting QR code',
        ]);

        $member = $request->user();

        $meeting = Meeting::query()
            ->where('qr_token', $validated['meeting_token'])
            ->first();

        if ($meeting === null) {
            return response()->json([
                'message' => 'That QR code does not match a meeting. Ask the organiser to show the current code.',
            ], 404);
        }

        /*
         * The staff attendance screen only ever attaches a member to a meeting of
         * their own office (AttachMemberToMeetingAction::resolveMember), so self
         * check-in honours the same rule rather than quietly opening a second
         * path around it.
         *
         * Only enforced when the member actually has an office: 64 of them have
         * no office_id yet, and refusing those would lock them out of check-in
         * over missing data rather than over anything they did.
         */
        if ($member->office_id !== null && $meeting->office_id !== null
            && (int) $member->office_id !== (int) $meeting->office_id) {
            return response()->json([
                'message' => 'This meeting belongs to a different office than your membership. Speak to the organiser, who can add you at the door.',
            ], 403);
        }

        /*
         * Attendance is a soft deleting pivot: an organiser who removes someone
         * leaves a trashed row behind. Look through trashed rows so a re-scan
         * revives the existing record instead of inserting a duplicate, which
         * would double count the member in the attendance figures.
         */
        $existing = MeetingHasMember::withTrashed()
            ->where('meeting_id', $meeting->id)
            ->where('member_id', $member->id)
            ->first();

        if ($existing !== null && $existing->deleted_at === null) {
            // Idempotent: scanning twice is the normal way a phone behaves, and
            // the member should be told they are in, not shown an error.
            return response()->json([
                'data' => [
                    'meeting'       => $this->meetingPayload($meeting),
                    'already_here'  => true,
                    'checked_in_at' => $existing->created_at?->toIso8601String(),
                ],
                'message' => 'You were already checked in to this meeting.',
            ]);
        }

        if ($existing !== null) {
            $existing->restore();
            $checkedInAt = $existing->created_at;
        } else {
            $created = MeetingHasMember::create([
                'meeting_id' => $meeting->id,
                'member_id'  => $member->id,
            ]);
            $checkedInAt = $created->created_at;
        }

        return response()->json([
            'data' => [
                'meeting'       => $this->meetingPayload($meeting),
                'already_here'  => false,
                'checked_in_at' => $checkedInAt?->toIso8601String(),
            ],
            'message' => 'You are checked in.',
        ], 201);
    }

    /** What the meeting token buys: enough to confirm the right meeting, no more. */
    private function meetingPayload(Meeting $meeting): array
    {
        return [
            'id'         => $meeting->id,
            'title'      => $meeting->title,
            'date'       => $meeting->date?->toDateString(),
            // Confirms they scanned the right session, not yesterday's poster.
            'start_time' => $meeting->start_time,
            'end_time'   => $meeting->end_time,
        ];
    }
}
