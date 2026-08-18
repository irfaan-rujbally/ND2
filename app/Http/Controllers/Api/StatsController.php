<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Meeting;
use App\Models\Member;
use App\Models\MeetingHasMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Aggregates for the dashboard. Everything is scoped to the caller's office,
 * matching the tenanting applied by the REST resources.
 *
 * total_meetings is also what the members list divides by to turn a member's
 * meetings_count aggregate into an attendance percentage, so the two numbers
 * always come from the same source.
 */
class StatsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $officeId = $request->user()->office_id;

        $totalMeetings = Meeting::where('office_id', $officeId)->count();
        $totalMembers = Member::where('office_id', $officeId)->count();

        $attendanceRows = MeetingHasMember::query()
            ->whereNull('meeting_has_member.deleted_at')
            ->whereIn('meeting_id', Meeting::where('office_id', $officeId)->select('id'))
            ->count();

        return response()->json([
            'data' => [
                'total_meetings'    => $totalMeetings,
                'total_members'     => $totalMembers,
                'total_attendances' => $attendanceRows,

                // Typical turnout: how many people actually show up to a meeting.
                'average_participants' => $totalMeetings > 0
                    ? (int) round($attendanceRows / $totalMeetings)
                    : 0,

                // The same figure as a share of the membership, which is what the
                // per-member attendance percentages on the members list average out to.
                'average_attendance' => $totalMeetings > 0 && $totalMembers > 0
                    ? round($attendanceRows / ($totalMeetings * $totalMembers) * 100, 2)
                    : 0,
                'recent_meetings'     => Meeting::where('office_id', $officeId)
                    ->withCount(['members' => fn ($q) => $q->whereNull('meeting_has_member.deleted_at')])
                    ->orderByDesc('date')
                    ->limit(6)
                    ->get(['id', 'title', 'date', 'topic'])
                    ->map(fn ($m) => [
                        'id'           => $m->id,
                        'title'        => $m->title,
                        'date'         => $m->date?->format('Y-m-d'),
                        'topic'        => $m->topic,
                        'participants' => $m->members_count,
                    ]),
            ],
        ]);
    }
}
