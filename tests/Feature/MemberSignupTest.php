<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Office;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MemberSignupTest extends TestCase
{
    use RefreshDatabase;

    private Office $office;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->office = Office::create(['name' => 'Bonne Terre']);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'first_name'          => 'Aisha',
            'last_name'           => 'Ragoo',
            'email'               => 'aisha@example.com',
            'phone'               => '57123456',
            'address'             => '12 Rue des Manguiers, Curepipe',
            'date_of_birth'       => '1994-04-12',
            'national_id'         => 'R120494400012A',
            'gender'              => 'Female',
            'constituency'        => 17,
            'profession'          => 'Teacher',
            'password'            => 'a-real-password',
            'password_confirmation' => 'a-real-password',
            'documents'           => UploadedFile::fake()->create('id.pdf', 40, 'application/pdf'),
            'documents_confirmed' => '1',
        ], $overrides);
    }

    private function existingMember(array $overrides = []): Member
    {
        return Member::create(array_merge([
            'first_name'  => 'Existing',
            'last_name'   => 'Member',
            'office_id'   => $this->office->id,
            'approved_at' => now(),
        ], $overrides));
    }

    // ------------------------------------------------------------ happy path

    public function test_an_application_creates_an_unapproved_member_in_the_intake_office(): void
    {
        $this->postJson('/api/public/member-signup', $this->payload())
            ->assertCreated()
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'received'));

        $member = Member::where('email', 'aisha@example.com')->firstOrFail();

        // The whole point of the feature: a real row that cannot sign in yet.
        $this->assertNull($member->approved_at);
        $this->assertFalse($member->isApproved());
        $this->assertNotNull($member->self_registered_at);
        $this->assertSame($this->office->id, $member->office_id);

        // Their own password, not the derivable default.
        $this->assertNotNull($member->password);
        $this->assertNotNull($member->password_set_at);

        $this->assertNotNull($member->documents_path);
        Storage::disk('local')->assertExists($member->documents_path);

        // Minted by the model, never by the request.
        $this->assertNotNull($member->qr_token);
    }

    public function test_the_office_is_notified_of_a_new_application(): void
    {
        // ActivityNotifier::staff writes one row per member of staff at the
        // office, so with nobody there there is nothing to assert.
        $staff = new User();
        $staff->first_name = 'Ops';
        $staff->last_name = 'Admin';
        $staff->email = 'ops@example.com';
        $staff->password = 'secret';
        $staff->office_id = $this->office->id;
        $staff->save();

        $this->postJson('/api/public/member-signup', $this->payload())->assertCreated();

        $this->assertDatabaseHas('activity_notifications', [
            'recipient_type' => 'user',
            'recipient_id'   => $staff->id,
            'type'           => 'member_application',
        ]);
    }

    // ------------------------------------------------------- what it refuses

    public function test_an_applicant_cannot_choose_their_office_or_approve_themselves(): void
    {
        $elsewhere = Office::create(['name' => 'Rodrigues']);

        $this->postJson('/api/public/member-signup', $this->payload([
            'office_id'          => $elsewhere->id,
            'approved_at'        => now()->toDateTimeString(),
            'qr_token'           => str_repeat('a', 32),
            'self_registered_at' => null,
        ]))->assertCreated();

        $member = Member::where('email', 'aisha@example.com')->firstOrFail();

        // Model::unguard() is global in this application, so these three would
        // have been written straight through had the controller passed the
        // request to create(). Approving yourself is the one that matters.
        $this->assertNull($member->approved_at);
        $this->assertSame($this->office->id, $member->office_id);
        $this->assertNotSame(str_repeat('a', 32), $member->qr_token);
    }

    public function test_an_existing_email_is_refused_however_it_is_cased(): void
    {
        $this->existingMember(['email' => 'Aisha@Example.com']);

        $this->postJson('/api/public/member-signup', $this->payload(['email' => 'aisha@example.com']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');

        $this->assertSame(1, Member::count());
    }

    /**
     * Every way the register writes the same line has to be recognised as that
     * line. "5712 3456" is the case the old SQL narrowing missed -- it does not
     * *end* with "7123456", so the LIKE matched nothing and the duplicate was
     * accepted -- and "+230 5712 3456" is the case whole-digit comparison
     * missed, being eleven digits against eight.
     */
    public static function equivalentPhoneFormats(): array
    {
        return [
            'plain'                 => ['57123456'],
            'internal space'        => ['5712 3456'],
            'hyphenated'            => ['5712-3456'],
            'country code'          => ['+230 5712 3456'],
            'country code, no plus' => ['23057123456'],
        ];
    }

    /** @dataProvider equivalentPhoneFormats */
    public function test_an_existing_phone_number_is_refused_however_it_is_written(string $stored): void
    {
        $this->existingMember(['phone' => $stored]);

        $this->postJson('/api/public/member-signup', $this->payload(['phone' => '57123456']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('phone');

        $this->assertSame(1, Member::count());
    }

    public function test_a_different_number_sharing_a_tail_is_still_accepted(): void
    {
        // Seven digits in common, the eighth different: a different line, and
        // comparing on the last eight must not collapse the two.
        $this->existingMember(['phone' => '47123456']);

        $this->postJson('/api/public/member-signup', $this->payload(['phone' => '57123456']))
            ->assertCreated();
    }

    public function test_an_existing_national_id_is_refused_however_it_is_punctuated(): void
    {
        $this->existingMember(['national_id' => 'r12 0494 400012 a']);

        $this->postJson('/api/public/member-signup', $this->payload(['national_id' => 'R120494400012A']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('national_id');

        $this->assertSame(1, Member::count());
    }

    public function test_a_soft_deleted_member_does_not_block_a_fresh_application(): void
    {
        $gone = $this->existingMember([
            'email'       => 'aisha@example.com',
            'phone'       => '57123456',
            'national_id' => 'R120494400012A',
        ]);
        $gone->delete();

        // Someone the office removed must be able to apply again rather than be
        // locked out by their own deleted record.
        $this->postJson('/api/public/member-signup', $this->payload())->assertCreated();
    }

    public function test_the_declaration_and_document_are_both_required(): void
    {
        $this->postJson('/api/public/member-signup', $this->payload([
            'documents_confirmed' => '0',
            'documents'           => null,
        ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['documents', 'documents_confirmed']);

        $this->assertSame(0, Member::count());
    }

    public function test_nothing_is_written_to_disk_by_a_rejected_application(): void
    {
        $this->postJson('/api/public/member-signup', $this->payload(['email' => 'not-an-email']))
            ->assertStatus(422);

        $this->assertSame(0, Member::count());
        $this->assertEmpty(Storage::disk('local')->allFiles());
    }

    public function test_a_mismatched_password_confirmation_is_refused(): void
    {
        $this->postJson('/api/public/member-signup', $this->payload([
            'password_confirmation' => 'something-else',
        ]))->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_applications_can_be_switched_off(): void
    {
        config(['members.signup.enabled' => false]);

        $this->postJson('/api/public/member-signup', $this->payload())->assertStatus(503);

        $this->assertSame(0, Member::count());
    }

    // --------------------------------------------------------- the sign-in gate

    public function test_an_unapproved_member_cannot_sign_in(): void
    {
        $this->postJson('/api/public/member-signup', $this->payload())->assertCreated();

        $this->postJson('/api/member/auth/login', [
            'identifier' => 'aisha@example.com',
            'password'   => 'a-real-password',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('identifier');
    }

    public function test_the_same_member_can_sign_in_once_approved(): void
    {
        $this->postJson('/api/public/member-signup', $this->payload())->assertCreated();

        Member::where('email', 'aisha@example.com')->firstOrFail()
            ->forceFill(['approved_at' => now()])->saveQuietly();

        $this->postJson('/api/member/auth/login', [
            'identifier' => 'aisha@example.com',
            'password'   => 'a-real-password',
        ])->assertOk()->assertJsonStructure(['token']);
    }

    public function test_a_wrong_password_on_an_unapproved_account_reveals_nothing_about_approval(): void
    {
        $this->postJson('/api/public/member-signup', $this->payload())->assertCreated();

        // Approval is checked after the password on purpose, so the pending
        // state is never an answer to someone who has not proved the password.
        $response = $this->postJson('/api/member/auth/login', [
            'identifier' => 'aisha@example.com',
            'password'   => 'wrong',
        ])->assertStatus(422);

        $this->assertStringNotContainsStringIgnoringCase(
            'review',
            (string) $response->json('errors.identifier.0'),
        );
    }
}
