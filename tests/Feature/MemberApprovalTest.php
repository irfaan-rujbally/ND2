<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Office;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The office side of public sign-up: seeing what is waiting, and admitting it.
 */
class MemberApprovalTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Office $office;

    private Office $otherOffice;

    protected function setUp(): void
    {
        parent::setUp();

        Role::create(['name' => 'admin', 'guard_name' => 'web']);

        $this->office = Office::create(['name' => 'Bonne Terre']);
        $this->otherOffice = Office::create(['name' => 'Rodrigues']);

        $this->admin = new User();
        $this->admin->first_name = 'Ops';
        $this->admin->last_name = 'Admin';
        $this->admin->email = 'admin@example.com';
        $this->admin->password = 'secret';
        $this->admin->office_id = $this->office->id;
        $this->admin->save();
        $this->admin->assignRole('admin');
    }

    /** An application: self-registered, so the model's creating hook leaves it unapproved. */
    private function applicant(string $name, ?Office $office = null): Member
    {
        return Member::create([
            'first_name'         => $name,
            'last_name'          => 'Applicant',
            'office_id'          => ($office ?? $this->office)->id,
            'self_registered_at' => now(),
        ]);
    }

    private function approve(array $ids): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/members/actions/approve-members', [
            'search' => ['filters' => [['field' => 'id', 'operator' => 'in', 'value' => $ids]]],
            'fields' => [],
        ]);
    }

    public function test_the_pending_scope_returns_only_waiting_applications(): void
    {
        Sanctum::actingAs($this->admin);

        $waiting = $this->applicant('Aisha');

        // Entered by an administrator, so approved on creation.
        Member::create(['first_name' => 'Existing', 'last_name' => 'Member', 'office_id' => $this->office->id]);

        $response = $this->postJson('/api/members/search', [
            'search' => ['scopes' => [['name' => 'pendingApproval', 'parameters' => []]]],
        ])->assertOk();

        $response->assertJsonCount(1, 'data');
        $this->assertSame($waiting->id, $response->json('data.0.id'));
        $this->assertNull($response->json('data.0.approved_at'));
    }

    public function test_approving_lets_the_member_sign_in(): void
    {
        $applicant = $this->applicant('Aisha');
        $applicant->forceFill(['email' => 'aisha@example.com', 'password' => 'a-real-password'])->save();

        $this->assertFalse($applicant->fresh()->isApproved());

        Sanctum::actingAs($this->admin);
        $this->approve([$applicant->id])->assertOk();

        $applicant->refresh();
        $this->assertTrue($applicant->isApproved());
        $this->assertSame($this->admin->id, $applicant->approved_by);

        // The point of the whole feature.
        $this->postJson('/api/member/auth/login', [
            'identifier' => 'aisha@example.com',
            'password'   => 'a-real-password',
        ])->assertOk();
    }

    public function test_the_applicant_is_notified_of_the_decision(): void
    {
        $applicant = $this->applicant('Aisha');

        Sanctum::actingAs($this->admin);
        $this->approve([$applicant->id])->assertOk();

        $this->assertDatabaseHas('activity_notifications', [
            'recipient_type' => 'member',
            'recipient_id'   => $applicant->id,
            'type'           => 'membership_approved',
        ]);
    }

    public function test_approving_does_not_notify_staff_that_the_record_was_edited(): void
    {
        $applicant = $this->applicant('Aisha');

        Sanctum::actingAs($this->admin);
        $this->approve([$applicant->id])->assertOk();

        // saveQuietly in the action: an approval is not an edit to the record's
        // contents, and the office does not need telling about its own click.
        $this->assertDatabaseMissing('activity_notifications', [
            'recipient_type' => 'user',
            'type'           => 'member_edited',
        ]);
    }

    public function test_an_already_approved_member_keeps_their_original_approval_date(): void
    {
        $member = Member::create([
            'first_name' => 'Existing',
            'last_name'  => 'Member',
            'office_id'  => $this->office->id,
        ]);
        $original = now()->subYear();
        $member->forceFill(['approved_at' => $original, 'approved_by' => null])->saveQuietly();

        Sanctum::actingAs($this->admin);
        $this->approve([$member->id])->assertOk();

        // Skipped, not re-stamped: re-dating it would overwrite a decision
        // somebody else made, which a grid selection makes easy to do by accident.
        $this->assertSame(
            $original->toDateTimeString(),
            $member->fresh()->approved_at->toDateTimeString(),
        );
    }

    public function test_another_offices_application_cannot_be_approved(): void
    {
        $elsewhere = $this->applicant('Outsider', $this->otherOffice);

        Sanctum::actingAs($this->admin);
        $this->approve([$elsewhere->id]);

        // Whether the API refuses or simply matches nothing, the one thing that
        // must never happen is the record being admitted.
        $this->assertFalse($elsewhere->fresh()->isApproved());
    }

    public function test_a_member_token_cannot_approve_anyone(): void
    {
        $applicant = $this->applicant('Aisha');
        $token = $applicant->createToken('test', [Member::PORTAL_ABILITY])->plainTextToken;

        $this->withToken($token)->postJson('/api/members/actions/approve-members', [
            'search' => ['filters' => [['field' => 'id', 'operator' => '=', 'value' => $applicant->id]]],
            'fields' => [],
        ])->assertForbidden();

        $this->assertFalse($applicant->fresh()->isApproved());
    }
}
