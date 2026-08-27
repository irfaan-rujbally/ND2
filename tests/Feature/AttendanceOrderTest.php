<?php

namespace Tests\Feature;

use App\Models\Meeting;
use App\Models\MeetingHasMember;
use App\Models\Member;
use App\Models\Office;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Covers Member::scopeOrderByAttendanceAddedAt, which the attendance panel uses
 * to show the most recently recorded participant first.
 */
class AttendanceOrderTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Office $office;

    private Meeting $meeting;

    protected function setUp(): void
    {
        parent::setUp();

        Role::create(['name' => 'admin', 'guard_name' => 'web']);

        $this->office = Office::create(['name' => 'Bonne Terre']);

        $this->admin = new User();
        $this->admin->first_name = 'Test';
        $this->admin->last_name = 'User';
        $this->admin->email = 'admin@example.com';
        $this->admin->password = 'secret';
        $this->admin->office_id = $this->office->id;
        $this->admin->save();
        $this->admin->assignRole('admin');

        $this->meeting = new Meeting();
        $this->meeting->title = 'Jeunes Démocrates';
        $this->meeting->office_id = $this->office->id;
        $this->meeting->date = '2025-08-12';
        $this->meeting->save();
    }

    public function test_participants_come_back_most_recently_recorded_first(): void
    {
        // Alphabetically Alpha, Bravo, Charlie — deliberately not the expected order.
        $charlie = $this->member('Charlie');
        $alpha = $this->member('Alpha');
        $bravo = $this->member('Bravo');

        $this->attach($charlie, '2025-08-12 09:00:00');
        $this->attach($alpha, '2025-08-12 09:30:00');
        $this->attach($bravo, '2025-08-12 10:00:00');

        $this->assertSame(['Bravo', 'Alpha', 'Charlie'], $this->participantNames());
    }

    public function test_a_member_re_added_after_being_removed_moves_to_the_top(): void
    {
        $charlie = $this->member('Charlie');
        $alpha = $this->member('Alpha');

        $pivot = $this->attach($charlie, '2025-08-12 09:00:00');
        $this->attach($alpha, '2025-08-12 09:30:00');

        $this->assertSame(['Alpha', 'Charlie'], $this->participantNames());

        // What AttachMemberToMeetingAction does for someone attached before:
        // the existing row is restored rather than a new one inserted.
        $pivot->delete();
        $pivot->restore();
        $pivot->forceFill(['updated_at' => '2025-08-12 11:00:00'])->save();

        $this->assertSame(['Charlie', 'Alpha'], $this->participantNames());
    }

    public function test_a_detached_member_is_left_out_entirely(): void
    {
        $charlie = $this->member('Charlie');
        $alpha = $this->member('Alpha');

        $this->attach($charlie, '2025-08-12 09:00:00')->delete();
        $this->attach($alpha, '2025-08-12 09:30:00');

        $this->assertSame(['Alpha'], $this->participantNames());
    }

    /**
     * The members list's Attendance column sorts through the same kind of scope.
     * The percentage shares a denominator across every row, so ordering by the
     * meetings count is ordering by the percentage.
     */
    public function test_members_can_be_ordered_by_how_many_meetings_they_attended(): void
    {
        $this->threeMembersWithTwoOneAndNoMeetings();

        $this->assertSame(['Bravo', 'Charlie', 'Alpha'], $this->namesOrderedByAttendance('desc'));
    }

    /*
     * One request per test: Lomkit registers SearchRequest as a container
     * singleton, and a feature test reuses one container across requests, so a
     * second search in the same test would be answered with the first one's
     * parameters. A browser gets a fresh container per request.
     */
    public function test_ordering_by_attendance_can_be_reversed(): void
    {
        $this->threeMembersWithTwoOneAndNoMeetings();

        $this->assertSame(['Alpha', 'Charlie', 'Bravo'], $this->namesOrderedByAttendance('asc'));
    }

    /**
     * Detaching drops a member back down the list: the pivot is soft deleted, so
     * the count must not include rows the attendance panel no longer shows.
     */
    public function test_ordering_by_attendance_ignores_detached_members(): void
    {
        ['two' => $two] = $this->threeMembersWithTwoOneAndNoMeetings();

        MeetingHasMember::where('member_id', $two->id)->get()->each->delete();

        $this->assertSame(['Charlie', 'Alpha', 'Bravo'], $this->namesOrderedByAttendance('desc'));
    }

    /** @return array{two: Member, one: Member, none: Member} */
    private function threeMembersWithTwoOneAndNoMeetings(): array
    {
        $second = $this->meeting('Second');

        // Alphabetical order is deliberately not attendance order.
        $none = $this->member('Alpha');
        $two = $this->member('Bravo');
        $one = $this->member('Charlie');

        $this->attach($two, '2025-08-12 09:00:00');
        $this->attach($two, '2025-08-12 09:00:00', $second);
        $this->attach($one, '2025-08-12 09:00:00');

        return ['two' => $two, 'one' => $one, 'none' => $none];
    }

    /** @return list<string> */
    private function namesOrderedByAttendance(string $direction): array
    {
        Sanctum::actingAs($this->admin);

        $response = $this->postJson('/api/members/search', [
            'search' => [
                'scopes' => [['name' => 'orderByMeetingsCount', 'parameters' => [$direction]]],
            ],
        ]);

        $response->assertOk();

        return array_column($response->json('data'), 'first_name');
    }

    /** @return list<string> */
    private function participantNames(): array
    {
        Sanctum::actingAs($this->admin);

        $response = $this->postJson('/api/members/search', [
            'search' => [
                'filters' => [['field' => 'meetings.id', 'operator' => '=', 'value' => $this->meeting->id]],
                'scopes'  => [['name' => 'orderByAttendanceAddedAt', 'parameters' => [$this->meeting->id]]],
            ],
        ]);

        $response->assertOk();

        return array_column($response->json('data'), 'first_name');
    }

    private function member(string $firstName): Member
    {
        $member = new Member();
        $member->first_name = $firstName;
        $member->last_name = 'Test';
        $member->office_id = $this->office->id;
        $member->save();

        return $member;
    }

    private function meeting(string $title): Meeting
    {
        $meeting = new Meeting();
        $meeting->title = $title;
        $meeting->office_id = $this->office->id;
        $meeting->date = '2025-08-19';
        $meeting->save();

        return $meeting;
    }

    private function attach(Member $member, string $at, ?Meeting $meeting = null): MeetingHasMember
    {
        $pivot = new MeetingHasMember();
        $pivot->meeting_id = ($meeting ?? $this->meeting)->id;
        $pivot->member_id = $member->id;
        $pivot->forceFill(['created_at' => $at, 'updated_at' => $at])->save();

        return $pivot;
    }
}
