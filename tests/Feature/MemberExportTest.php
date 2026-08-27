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
 * Covers GET /api/members/export.
 *
 * The assertions read the response body as plain text, which works because
 * App\Support\Xlsx stores every entry in the archive uncompressed — the sheet
 * XML, and therefore every value in it, sits in the bytes verbatim.
 */
class MemberExportTest extends TestCase
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

        $this->admin = $this->makeUser('admin@example.com', $this->office);
        $this->admin->assignRole('admin');

        $this->makeMember('Abdoullah', 'Futloo', $this->office, 5);
        $this->makeMember('Marie', 'Laval', $this->office, 12);
        $this->makeMember('Someone', 'Elsewhere', $this->otherOffice, 21);
    }

    public function test_it_exports_the_members_of_the_users_own_office(): void
    {
        Sanctum::actingAs($this->admin);

        $response = $this->get('/api/members/export');

        $response->assertOk();
        $response->assertHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        $this->assertStringContainsString('attachment; filename="members-', $response->headers->get('Content-Disposition'));

        $body = $response->getContent();

        // A zip archive, and one Excel can read: the parts it demands are present.
        $this->assertStringStartsWith('PK', $body);
        $this->assertStringContainsString('xl/worksheets/sheet1.xml', $body);
        $this->assertStringContainsString('xl/styles.xml', $body);

        $this->assertStringContainsString('Abdoullah', $body);
        $this->assertStringContainsString('Marie', $body);

        // Tenanting: another office's member must never appear.
        $this->assertStringNotContainsString('Elsewhere', $body);
    }

    public function test_it_writes_every_column_heading(): void
    {
        Sanctum::actingAs($this->admin);

        $body = $this->get('/api/members/export')->getContent();

        foreach (['First name', 'Last name', 'Constituency', 'Meetings attended', 'Registered'] as $heading) {
            $this->assertStringContainsString($heading, $body);
        }
    }

    public function test_it_applies_the_same_filters_as_the_list(): void
    {
        Sanctum::actingAs($this->admin);

        $body = $this->get('/api/members/export?search=Abdou')->getContent();

        $this->assertStringContainsString('Abdoullah', $body);
        $this->assertStringNotContainsString('Marie', $body);

        $body = $this->get('/api/members/export?constituency=12')->getContent();

        $this->assertStringContainsString('Marie', $body);
        $this->assertStringNotContainsString('Abdoullah', $body);
    }

    /** The list can be sorted by its Attendance column, so the export must accept it. */
    public function test_it_accepts_the_attendance_sort(): void
    {
        Sanctum::actingAs($this->admin);

        $this->get('/api/members/export?sort=attendance&direction=desc')->assertOk();
    }

    public function test_it_rejects_an_unknown_sort_column(): void
    {
        Sanctum::actingAs($this->admin);

        $this->getJson('/api/members/export?sort=password')->assertStatus(422);
    }

    public function test_it_refuses_a_user_without_the_admin_role(): void
    {
        Sanctum::actingAs($this->makeUser('plain@example.com', $this->office));

        $this->getJson('/api/members/export')->assertForbidden();
    }

    public function test_it_refuses_an_unauthenticated_request(): void
    {
        $this->getJson('/api/members/export')->assertUnauthorized();
    }

    private function makeUser(string $email, Office $office): User
    {
        $user = new User();
        $user->first_name = 'Test';
        $user->last_name = 'User';
        $user->email = $email;
        $user->password = 'secret';
        $user->office_id = $office->id;
        $user->save();

        return $user;
    }

    private function makeMember(string $first, string $last, Office $office, int $constituency): Member
    {
        $member = new Member();
        $member->first_name = $first;
        $member->last_name = $last;
        $member->office_id = $office->id;
        $member->constituency = $constituency;
        $member->email = strtolower($first).'@example.com';
        $member->save();

        return $member;
    }
}
