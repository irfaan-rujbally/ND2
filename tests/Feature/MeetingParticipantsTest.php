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
 * The meeting participants endpoint, which exists precisely because it must
 * answer with members the office-scoped member search would hide.
 */
class MeetingParticipantsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Office $office;

    private Office $otherOffice;

    private Meeting $meeting;

    protected function setUp(): void
    {
        parent::setUp();

        Role::create(['name' => 'admin', 'guard_name' => 'web']);

        $this->office = Office::create(['name' => 'Bonne Terre']);
        $this->otherOffice = Office::create(['name' => 'Port Louis']);

        $this->admin = new User();
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

    /** The whole point: a visitor from another office attended, so they are listed. */
    public function test_it_lists_participants_from_other_offices(): void
    {
        $this->attach($this->member('Ashvin', $this->office->id), '2026-08-12 09:00:00');
        $this->attach($this->member('Visitor', $this->otherOffice->id), '2026-08-12 09:30:00');

        Sanctum::actingAs($this->admin);

        $response = $this->getJson('/api/meetings/'.$this->meeting->id.'/participants')
            ->assertOk()
            ->assertJsonPath('meta.participants', 2)
            // Most recently recorded first.
            ->assertJsonPath('data.0.first_name', 'Visitor')
            ->assertJsonPath('data.0.office', 'Port Louis')
            ->assertJsonPath('data.0.is_visitor', true)
            ->assertJsonPath('data.1.first_name', 'Ashvin')
            ->assertJsonPath('data.1.is_visitor', false);

        $this->assertCount(2, $response->json('data'));
    }

    public function test_a_detached_member_is_left_out(): void
    {
        $this->attach($this->member('Ashvin', $this->office->id), '2026-08-12 09:00:00');
        $this->attach($this->member('Gone', $this->office->id), '2026-08-12 09:30:00')->delete();

        Sanctum::actingAs($this->admin);

        $this->getJson('/api/meetings/'.$this->meeting->id.'/participants')
            ->assertOk()
            ->assertJsonPath('meta.participants', 1)
            ->assertJsonPath('data.0.first_name', 'Ashvin');
    }

    public function test_it_can_be_sorted_by_name(): void
    {
        $this->attach($this->member('Zara', $this->office->id), '2026-08-12 09:00:00');
        $this->attach($this->member('Ashvin', $this->office->id), '2026-08-12 09:30:00');

        Sanctum::actingAs($this->admin);

        $this->getJson('/api/meetings/'.$this->meeting->id.'/participants?sort=first_name&direction=asc')
            ->assertOk()
            ->assertJsonPath('data.0.first_name', 'Ashvin')
            ->assertJsonPath('data.1.first_name', 'Zara');
    }

    public function test_it_can_be_filtered_by_constituency(): void
    {
        $this->attach($this->member('Ashvin', $this->office->id, 15), '2026-08-12 09:00:00');
        $this->attach($this->member('Sandy', $this->office->id, 17), '2026-08-12 09:30:00');

        Sanctum::actingAs($this->admin);

        $this->getJson('/api/meetings/'.$this->meeting->id.'/participants?constituency=17')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.first_name', 'Sandy')
            // The headline count stays the meeting's, not the filtered page's.
            ->assertJsonPath('meta.participants', 2);
    }

    public function test_it_can_be_searched_by_name(): void
    {
        $this->attach($this->member('Ashvin', $this->office->id), '2026-08-12 09:00:00');
        $this->attach($this->member('Sandy', $this->office->id), '2026-08-12 09:30:00');

        Sanctum::actingAs($this->admin);

        $this->getJson('/api/meetings/'.$this->meeting->id.'/participants?q=ashv')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.first_name', 'Ashvin');
    }

    /** Tenanting moved up to the meeting, so it still has to hold there. */
    public function test_another_offices_meeting_is_refused(): void
    {
        $theirs = new Meeting();
        $theirs->title = 'Theirs';
        $theirs->office_id = $this->otherOffice->id;
        $theirs->date = '2026-08-12';
        $theirs->save();

        Sanctum::actingAs($this->admin);

        $this->getJson('/api/meetings/'.$theirs->id.'/participants')->assertForbidden();
    }

    public function test_a_user_without_the_admin_role_is_refused(): void
    {
        $plain = new User();
        $plain->first_name = 'Plain';
        $plain->last_name = 'User';
        $plain->email = 'plain@example.com';
        $plain->password = 'secret';
        $plain->office_id = $this->office->id;
        $plain->save();

        Sanctum::actingAs($plain);

        $this->getJson('/api/meetings/'.$this->meeting->id.'/participants')->assertForbidden();
    }

    public function test_it_refuses_an_unauthenticated_request(): void
    {
        $this->getJson('/api/meetings/'.$this->meeting->id.'/participants')->assertUnauthorized();
    }

    private function member(string $firstName, ?int $officeId, ?int $constituency = null): Member
    {
        $member = new Member();
        $member->first_name = $firstName;
        $member->last_name = 'Test';
        $member->office_id = $officeId;
        $member->constituency = $constituency;
        $member->save();

        return $member;
    }

    private function attach(Member $member, string $at): MeetingHasMember
    {
        $pivot = new MeetingHasMember();
        $pivot->meeting_id = $this->meeting->id;
        $pivot->member_id = $member->id;
        $pivot->forceFill(['created_at' => $at, 'updated_at' => $at])->save();

        return $pivot;
    }
}
