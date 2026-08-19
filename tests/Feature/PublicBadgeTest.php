<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Office;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * Covers POST /api/public/member-badge, the one endpoint that answers without
 * authentication. Its whole job is to hand over an attendance credential, so
 * the tests are mostly about what it must refuse.
 */
class PublicBadgeTest extends TestCase
{
    use RefreshDatabase;

    private Member $member;

    protected function setUp(): void
    {
        parent::setUp();

        // The throttle is per-IP and leaks between tests otherwise.
        RateLimiter::clear('');

        $office = Office::create(['name' => 'Bonne Terre']);

        $this->member = new Member();
        $this->member->first_name = 'Abdoullah';
        $this->member->last_name = 'Futloo';
        $this->member->office_id = $office->id;
        $this->member->national_id = 'A1234567890123';
        $this->member->date_of_birth = '1990-04-09';
        $this->member->save();
    }

    public function test_it_returns_the_badge_when_both_details_match(): void
    {
        $response = $this->postJson('/api/public/member-badge', [
            'national_id'   => 'A1234567890123',
            'date_of_birth' => '1990-04-09',
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.first_name', 'Abdoullah');
        $response->assertJsonPath('data.qr_token', $this->member->fresh()->qr_token);
    }

    public function test_it_returns_nothing_but_the_badge(): void
    {
        $this->member->phone = '52528555';
        $this->member->email = 'zapheerf@example.com';
        $this->member->address = '12 Somewhere Street';
        $this->member->save();

        $response = $this->postJson('/api/public/member-badge', [
            'national_id'   => 'A1234567890123',
            'date_of_birth' => '1990-04-09',
        ]);

        // Contact details must not ride along on a response anyone can trigger.
        $this->assertSame(
            ['first_name', 'last_name', 'qr_token'],
            array_keys($response->json('data')),
        );
    }

    public function test_it_ignores_spacing_and_case_in_the_national_id(): void
    {
        $this->postJson('/api/public/member-badge', [
            'national_id'   => 'a123 4567 890 123',
            'date_of_birth' => '1990-04-09',
        ])->assertOk();
    }

    public function test_the_right_id_with_the_wrong_date_is_refused(): void
    {
        $this->postJson('/api/public/member-badge', [
            'national_id'   => 'A1234567890123',
            'date_of_birth' => '1990-04-10',
        ])->assertNotFound();
    }

    public function test_the_right_date_with_the_wrong_id_is_refused(): void
    {
        $this->postJson('/api/public/member-badge', [
            'national_id'   => 'B9999999999999',
            'date_of_birth' => '1990-04-09',
        ])->assertNotFound();
    }

    /**
     * If a near miss read differently from an unknown person, the endpoint would
     * confirm which national IDs belong to party members.
     */
    public function test_every_failure_reads_the_same(): void
    {
        $wrongDate = $this->postJson('/api/public/member-badge', [
            'national_id' => 'A1234567890123', 'date_of_birth' => '1990-04-10',
        ]);

        $unknown = $this->postJson('/api/public/member-badge', [
            'national_id' => 'Z0000000000000', 'date_of_birth' => '1975-01-01',
        ]);

        $this->assertSame($wrongDate->status(), $unknown->status());
        $this->assertSame($wrongDate->json('message'), $unknown->json('message'));
    }

    public function test_it_requires_both_fields(): void
    {
        $this->postJson('/api/public/member-badge', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['national_id', 'date_of_birth']);
    }

    public function test_it_is_rate_limited(): void
    {
        $payload = ['national_id' => 'Z0000000000000', 'date_of_birth' => '1975-01-01'];

        // The route allows 6 a minute; the seventh must be turned away.
        for ($attempt = 0; $attempt < 6; $attempt++) {
            $this->postJson('/api/public/member-badge', $payload)->assertNotFound();
        }

        $this->postJson('/api/public/member-badge', $payload)->assertStatus(429);
    }
}
