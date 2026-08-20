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
 * The dashboard aggregates, and in particular that they count the same people
 * the meeting's own screens list.
 *
 * The two disagreed: 64 members have no office recorded, and every read through
 * MemberResource is scoped to the caller's office, so a participant with no
 * office was counted by the dashboard and then left out of the list -- one
 * meeting read "62 participants" on the dashboard and "61" when opened.
 */
class StatsTest extends TestCase
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
        $this->admin->account_id = 1;
        $this->admin->first_name = 'Test';
        $this->admin->last_name = 'User';
        $this->admin->email = 'admin@example.com';
        $this->admin->password = 'secret';
        $this->admin->office_id = $this->office->id;
        $this->admin->save();
        $this->admin->assignRole('admin');

        $this->meeting = new Meeting();
        $this->meeting->title = 'National Meeting';
        $this->meeting->office_id = $this->office->id;
        $this->meeting->date = '2026-08-12';
        $this->meeting->save();
    }

    public function test_it_counts_the_participants_of_a_recent_meeting(): void
    {
        $this->attach($this->member('Ashvin', $this->office->id));
        $this->attach($this->member('Vijesh', $this->office->id));

        Sanctum::actingAs($this->admin);

        $this->getJson('/api/stats')
            ->assertOk()
            ->assertJsonPath('data.recent_meetings.0.participants', 2)
            ->assertJsonPath('data.total_attendances', 2);
    }

    /**
     * A member with no office is invisible to every office-scoped screen, so
     * counting them here would put a number on the dashboard that the meeting
     * itself contradicts.
     */
    public function test_a_participant_with_no_office_is_not_counted(): void
    {
        $this->attach($this->member('Ashvin', $this->office->id));
        $this->attach($this->member('Antish', null));

        Sanctum::actingAs($this->admin);

        $this->getJson('/api/stats')
            ->assertOk()
            ->assertJsonPath('data.recent_meetings.0.participants', 1)
            ->assertJsonPath('data.total_attendances', 1);
    }

    /** Another office's members are not this office's participants either. */
    public function test_a_participant_from_another_office_is_not_counted(): void
    {
        $this->attach($this->member('Ashvin', $this->office->id));
        $this->attach($this->member('Elsewhere', Office::create(['name' => 'Port Louis'])->id));

        Sanctum::actingAs($this->admin);

        $this->getJson('/api/stats')
            ->assertOk()
            ->assertJsonPath('data.recent_meetings.0.participants', 1);
    }

    /** Detaching removes someone from the count: the pivot is soft deleted. */
    public function test_a_detached_participant_is_not_counted(): void
    {
        $this->attach($this->member('Ashvin', $this->office->id));
        $this->attach($this->member('Gone', $this->office->id))->delete();

        Sanctum::actingAs($this->admin);

        $this->getJson('/api/stats')
            ->assertOk()
            ->assertJsonPath('data.recent_meetings.0.participants', 1)
            ->assertJsonPath('data.total_attendances', 1);
    }

    private function member(string $firstName, ?int $officeId): Member
    {
        $member = new Member();
        $member->first_name = $firstName;
        $member->last_name = 'Test';
        $member->office_id = $officeId;
        $member->save();

        return $member;
    }

    private function attach(Member $member): MeetingHasMember
    {
        $pivot = new MeetingHasMember();
        $pivot->meeting_id = $this->meeting->id;
        $pivot->member_id = $member->id;
        $pivot->save();

        return $pivot;
    }
}
