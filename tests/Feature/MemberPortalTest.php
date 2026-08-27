<?php

namespace Tests\Feature;

use App\Models\Announcement;
use App\Models\AnnouncementRecipient;
use App\Models\Meeting;
use App\Models\MeetingHasMember;
use App\Models\Member;
use App\Models\Office;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * Covers the member portal: sign-in, the walled-off profile, self check-in and
 * the attendance figures.
 *
 * The most important tests here are the isolation ones. Members and staff are
 * both verified by Sanctum, so nothing but the token abilities stops a member
 * from reaching the staff API. If those ever fail, members can read the whole
 * register.
 */
class MemberPortalTest extends TestCase
{
    use RefreshDatabase;

    private Member $member;

    private Office $office;

    protected function setUp(): void
    {
        parent::setUp();

        RateLimiter::clear('');
        Cache::flush();

        $this->office = Office::create(['name' => 'Bonne Terre']);

        $this->member = new Member();
        $this->member->first_name = 'Zapheer';
        $this->member->last_name = 'Futloo';
        $this->member->email = 'zapheer@example.com';
        $this->member->phone = '52528555';
        $this->member->office_id = $this->office->id;
        $this->member->password = 'F2528555';
        $this->member->save();
    }

    private function signIn(?string $identifier = null, string $password = 'F2528555'): string
    {
        return $this->postJson('/api/member/auth/login', [
            'identifier' => $identifier ?? $this->member->email,
            'password'   => $password,
        ])->assertOk()->json('token');
    }

    private function meeting(array $attributes = []): Meeting
    {
        return Meeting::create(array_merge([
            'title'     => 'Branch Meeting',
            'date'      => now()->subDay()->toDateString(),
            'office_id' => $this->office->id,
        ], $attributes));
    }

    private function auth(string $token): array
    {
        return ['Authorization' => 'Bearer '.$token];
    }

    /* ---------------------------------------------------------------- */
    /* Default password                                                  */
    /* ---------------------------------------------------------------- */

    public function test_the_default_password_is_the_last_name_initial_and_last_seven_phone_digits(): void
    {
        $this->assertSame('F2528555', Member::defaultPasswordFor('Futloo', '52528555'));

        // Numbers are stored in several formats; the trailing seven digits are
        // the part that survives all of them.
        $this->assertSame('F2528555', Member::defaultPasswordFor('futloo', '+230 5252 8555'));
        $this->assertSame('F2528555', Member::defaultPasswordFor('Futloo', '230-52528555'));
    }

    public function test_it_refuses_to_build_a_default_password_from_unusable_data(): void
    {
        $this->assertNull(Member::defaultPasswordFor('Futloo', '12345'), 'too few digits');
        $this->assertNull(Member::defaultPasswordFor('', '52528555'), 'no last name');
        $this->assertNull(Member::defaultPasswordFor('Futloo', null), 'no phone');
    }

    /* ---------------------------------------------------------------- */
    /* Sign-in                                                           */
    /* ---------------------------------------------------------------- */

    public function test_a_member_signs_in_with_their_email(): void
    {
        $this->postJson('/api/member/auth/login', [
            'identifier' => 'zapheer@example.com',
            'password'   => 'F2528555',
        ])->assertOk()->assertJsonPath('member.id', $this->member->id);
    }

    public function test_a_member_signs_in_with_their_phone_number_in_any_format(): void
    {
        foreach (['52528555', '+230 5252 8555', '230-52528555'] as $identifier) {
            RateLimiter::clear('member-login|'.strtolower($identifier).'|127.0.0.1');

            $this->postJson('/api/member/auth/login', [
                'identifier' => $identifier,
                'password'   => 'F2528555',
            ])->assertOk()->assertJsonPath('member.id', $this->member->id);
        }
    }

    public function test_it_rejects_a_wrong_password(): void
    {
        $this->postJson('/api/member/auth/login', [
            'identifier' => 'zapheer@example.com',
            'password'   => 'wrong',
        ])->assertStatus(422);
    }

    /**
     * A null password must never authenticate. 27 live members have one, because
     * their phone number is too short to build the default from.
     */
    public function test_a_member_with_no_password_cannot_sign_in(): void
    {
        $this->member->forceFill(['password' => null])->save();

        $this->postJson('/api/member/auth/login', [
            'identifier' => 'zapheer@example.com',
            'password'   => 'anything',
        ])->assertStatus(422);
    }

    /**
     * Two different people share one address in the live register. Signing in
     * whichever row came back first would hand one member the other's profile.
     */
    public function test_it_refuses_an_identifier_that_matches_more_than_one_member(): void
    {
        $twin = new Member();
        $twin->first_name = 'Varun';
        $twin->last_name = 'Heeraduth';
        $twin->email = 'zapheer@example.com';
        $twin->phone = '52528555';
        $twin->office_id = $this->office->id;
        $twin->password = 'H2528555';
        $twin->save();

        $this->postJson('/api/member/auth/login', [
            'identifier' => 'zapheer@example.com',
            'password'   => 'F2528555',
        ])->assertStatus(422)
            ->assertJsonPath(
                'errors.identifier.0',
                'More than one membership uses those details. Please contact the office so your record can be separated.'
            );
    }

    /* ---------------------------------------------------------------- */
    /* Isolation from the staff API                                      */
    /* ---------------------------------------------------------------- */

    /**
     * @dataProvider staffEndpoints
     */
    public function test_a_member_token_cannot_reach_the_staff_api(string $method, string $uri): void
    {
        $token = $this->signIn();

        $this->json($method, $uri, [], $this->auth($token))->assertForbidden();
    }

    public static function staffEndpoints(): array
    {
        return [
            'stats'                => ['GET', '/api/stats'],
            'staff identity'       => ['GET', '/api/auth/me'],
            'member search'        => ['POST', '/api/members/search'],
            'member export'        => ['GET', '/api/members/export'],
            'meeting search'       => ['POST', '/api/meetings/search'],
            'user search'          => ['POST', '/api/users/search'],
            // The staff side of announcements: writing them and reading them
            // back. The recipient list is covered separately below, because it
            // needs a real announcement for the route binding to resolve.
            'announcement search'  => ['POST', '/api/announcements/search'],
            'announcement mutate'  => ['POST', '/api/announcements/mutate'],
        ];
    }

    /**
     * The recipient list is the most sensitive announcement endpoint -- it
     * carries every member's name and email address -- so it gets its own test
     * rather than a row in the table above. With an id that does not exist, route
     * model binding answers 404 before the guard is ever consulted, which would
     * have passed for the wrong reason.
     */
    public function test_a_member_token_cannot_read_an_announcements_recipient_list(): void
    {
        $announcement = Announcement::create([
            'title'     => 'Assemblée générale',
            'office_id' => $this->office->id,
        ]);

        $this->getJson(
            "/api/announcements/{$announcement->id}/recipients",
            $this->auth($this->signIn())
        )->assertForbidden();
    }

    /**
     * The reverse direction. Staff tokens are minted with '*', which satisfies
     * every ability check including the member one, so only the portal
     * middleware keeps a User out of the member controllers.
     */
    public function test_a_staff_token_cannot_reach_the_member_portal(): void
    {
        $user = User::factory()->create([
            'office_id'  => $this->office->id,
        ]);
        $token = $user->createToken('web')->plainTextToken;

        $this->getJson('/api/member/profile', $this->auth($token))->assertForbidden();
    }

    public function test_the_portal_needs_a_token_at_all(): void
    {
        $this->getJson('/api/member/profile')->assertUnauthorized();
    }

    /* ---------------------------------------------------------------- */
    /* Announcements                                                     */
    /* ---------------------------------------------------------------- */

    private function announcement(array $attributes = []): Announcement
    {
        return Announcement::create(array_merge([
            'title'     => 'Assemblée générale',
            'office_id' => $this->office->id,
        ], $attributes));
    }

    public function test_a_member_reads_their_office_announcements_newest_first(): void
    {
        $this->announcement([
            'title'      => 'Older notice',
            'created_at' => now()->subDays(3),
        ]);
        $this->announcement([
            'title'       => 'Newest notice',
            'description' => "Ligne une.\nLigne deux.",
            'created_at'  => now(),
        ]);
        $this->announcement([
            'title'      => 'Middle notice',
            'created_at' => now()->subDay(),
        ]);

        $response = $this->getJson('/api/member/announcements', $this->auth($this->signIn()));

        $response->assertOk();

        $this->assertSame(
            ['Newest notice', 'Middle notice', 'Older notice'],
            array_column($response->json('data'), 'title')
        );

        // The line breaks the office typed survive to the portal, as they do to
        // the email.
        $this->assertSame("Ligne une.\nLigne deux.", $response->json('data.0.description'));
        $this->assertSame(3, $response->json('meta.total'));
    }

    public function test_a_member_never_sees_another_offices_announcements(): void
    {
        $otherOffice = Office::create(['name' => 'Rodrigues']);

        $this->announcement(['title' => 'Ours']);
        $this->announcement(['title' => 'Theirs', 'office_id' => $otherOffice->id]);

        $response = $this->getJson('/api/member/announcements', $this->auth($this->signIn()));

        $response->assertOk();
        $this->assertSame(['Ours'], array_column($response->json('data'), 'title'));
    }

    public function test_a_deleted_announcement_disappears_from_the_portal(): void
    {
        $this->announcement(['title' => 'Kept']);
        $this->announcement(['title' => 'Withdrawn'])->delete();

        $response = $this->getJson('/api/member/announcements', $this->auth($this->signIn()));

        $response->assertOk();
        $this->assertSame(['Kept'], array_column($response->json('data'), 'title'));
    }

    public function test_the_portal_exposes_the_notice_and_nothing_about_the_send(): void
    {
        $announcement = $this->announcement(['image_path' => 'announcement-images/poster.png']);

        AnnouncementRecipient::create([
            'announcement_id' => $announcement->id,
            'member_id'       => $this->member->id,
            'email'           => $this->member->email,
            'sent_at'         => now(),
        ]);

        $response = $this->getJson('/api/member/announcements', $this->auth($this->signIn()));

        $response->assertOk();

        // Exactly these keys: no recipient list, no addresses, no send counts.
        $this->assertSame(
            ['id', 'title', 'description', 'image_url', 'created_at'],
            array_keys($response->json('data.0'))
        );

        // The image is reachable by its public token, which is what lets the same
        // URL work in the email.
        $this->assertStringContainsString(
            "/api/public/announcements/{$announcement->public_token}/image",
            $response->json('data.0.image_url')
        );
    }

    public function test_a_member_who_has_not_been_emailed_still_reads_the_announcement(): void
    {
        // The point of the portal: 4 members in 5 have no email address, and
        // scoping this to announcement_recipients would leave them a blank page.
        $this->member->email = null;
        $this->member->save();

        $this->announcement(['title' => 'For everyone']);

        $response = $this->getJson(
            '/api/member/announcements',
            $this->auth($this->signIn($this->member->phone))
        );

        $response->assertOk();
        $this->assertSame(['For everyone'], array_column($response->json('data'), 'title'));
    }

    public function test_a_member_with_no_office_sees_nothing_rather_than_everything(): void
    {
        $this->announcement(['title' => 'Bonne Terre only']);

        $this->member->office_id = null;
        $this->member->save();

        $response = $this->getJson(
            '/api/member/announcements',
            $this->auth($this->signIn($this->member->phone))
        );

        $response->assertOk();
        $this->assertSame([], $response->json('data'));
    }

    public function test_a_member_can_load_the_latest_facebook_posts(): void
    {
        config()->set('services.facebook', [
            'page_id' => '123456',
            'page_access_token' => 'secret-page-token',
            'graph_version' => 'v26.0',
            'news_limit' => 10,
            'cache_seconds' => 300,
        ]);

        Http::fake([
            'graph.facebook.com/*' => Http::response(['data' => [[
                'id' => '123456_789',
                'message' => 'A new announcement',
                'created_time' => '2026-08-20T10:00:00+0000',
                'permalink_url' => 'https://www.facebook.com/123456/posts/789',
                'full_picture' => 'https://example.test/photo.jpg',
            ]]]),
        ]);

        $token = $this->signIn();

        $this->getJson('/api/member/news', $this->auth($token))
            ->assertOk()
            ->assertJsonPath('data.0.id', '123456_789')
            ->assertJsonPath('data.0.image_url', 'https://example.test/photo.jpg')
            ->assertJsonMissingPath('data.0.access_token');

        Http::assertSent(fn ($request) =>
            str_starts_with($request->url(), 'https://graph.facebook.com/v26.0/123456/posts?')
            && $request->hasHeader('Authorization', 'Bearer secret-page-token')
            && ! str_contains($request->url(), 'secret-page-token')
            && $request['limit'] === 10
        );
    }

    public function test_news_reports_a_clear_error_when_facebook_is_not_configured(): void
    {
        config()->set('services.facebook.page_id', null);
        config()->set('services.facebook.page_access_token', null);

        $token = $this->signIn();

        $this->getJson('/api/member/news', $this->auth($token))
            ->assertStatus(503)
            ->assertJsonPath('message', 'The news feed has not been configured yet.');

        Http::assertNothingSent();
    }

    /* ---------------------------------------------------------------- */
    /* Profile                                                           */
    /* ---------------------------------------------------------------- */

    public function test_a_member_sees_their_own_record_including_their_badge_token(): void
    {
        $token = $this->signIn();

        $this->getJson('/api/member/profile', $this->auth($token))
            ->assertOk()
            ->assertJsonPath('data.id', $this->member->id)
            ->assertJsonPath('data.qr_token', $this->member->qr_token);
    }

    public function test_a_member_updates_their_own_contact_details(): void
    {
        $token = $this->signIn();

        $this->patchJson('/api/member/profile', [
            'phone'   => '57000111',
            'address' => 'Royal Road, Quatre Bornes',
        ], $this->auth($token))->assertOk();

        $fresh = $this->member->fresh();
        $this->assertSame('57000111', $fresh->phone);
        $this->assertSame('Royal Road, Quatre Bornes', $fresh->address);
    }

    /**
     * The party's records about a member are not the member's to edit. Moving
     * themselves between offices would change which meetings they can attend,
     * and reissuing the badge token would break the door scanner.
     */
    public function test_a_member_cannot_change_their_office_constituency_or_badge(): void
    {
        $token = $this->signIn();
        $originalBadge = $this->member->qr_token;
        $otherOffice = Office::create(['name' => 'Port Louis']);

        $this->patchJson('/api/member/profile', [
            'office_id'    => $otherOffice->id,
            'constituency' => 18,
            'qr_token'     => 'forged-token-value',
        ], $this->auth($token))->assertOk();

        $fresh = $this->member->fresh();
        $this->assertSame($this->office->id, $fresh->office_id);
        $this->assertNull($fresh->constituency);
        $this->assertSame($originalBadge, $fresh->qr_token);
    }

    public function test_changing_the_password_requires_the_current_one(): void
    {
        $token = $this->signIn();

        $this->putJson('/api/member/profile/password', [
            'current_password'      => 'not-it',
            'password'              => 'a-much-longer-secret',
            'password_confirmation' => 'a-much-longer-secret',
        ], $this->auth($token))->assertStatus(422);

        $this->putJson('/api/member/profile/password', [
            'current_password'      => 'F2528555',
            'password'              => 'a-much-longer-secret',
            'password_confirmation' => 'a-much-longer-secret',
        ], $this->auth($token))->assertOk();

        $fresh = $this->member->fresh();
        $this->assertTrue(Hash::check('a-much-longer-secret', $fresh->password));
        $this->assertNotNull($fresh->password_set_at, 'the member is no longer on the default');
    }

    /**
     * The default password is derivable by anyone who knows a member's name and
     * number, so changing it has to end any session someone else already opened.
     */
    public function test_changing_the_password_revokes_other_sessions_but_not_this_one(): void
    {
        $stolen = $this->signIn();
        RateLimiter::clear('');
        $mine = $this->signIn();

        $this->putJson('/api/member/profile/password', [
            'current_password'      => 'F2528555',
            'password'              => 'a-much-longer-secret',
            'password_confirmation' => 'a-much-longer-secret',
        ], $this->auth($mine))->assertOk();

        /*
         * The auth manager is a singleton that caches the user it resolved, and
         * inside one test every request shares it -- so the revoked token would
         * still appear to work here even though its row is gone. Real requests
         * each get a fresh container; forgetting the guards reproduces that.
         * Verified against the running server: the revoked token returns 401.
         */
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/member/profile', $this->auth($mine))->assertOk();

        $this->app['auth']->forgetGuards();
        $this->getJson('/api/member/profile', $this->auth($stolen))->assertUnauthorized();
    }

    /* ---------------------------------------------------------------- */
    /* Check-in                                                          */
    /* ---------------------------------------------------------------- */

    public function test_scanning_a_meeting_code_checks_the_member_in(): void
    {
        $token = $this->signIn();
        $meeting = $this->meeting();

        $this->postJson('/api/member/check-in', [
            'meeting_token' => $meeting->qr_token,
        ], $this->auth($token))
            ->assertCreated()
            ->assertJsonPath('data.meeting.id', $meeting->id)
            ->assertJsonPath('data.already_here', false);

        $this->assertTrue($meeting->members()->where('members.id', $this->member->id)->exists());
    }

    /** A phone that fires the scan twice must not double count the member. */
    public function test_scanning_twice_does_not_create_a_second_attendance(): void
    {
        $token = $this->signIn();
        $meeting = $this->meeting();

        $this->postJson('/api/member/check-in', ['meeting_token' => $meeting->qr_token], $this->auth($token))
            ->assertCreated();

        $this->postJson('/api/member/check-in', ['meeting_token' => $meeting->qr_token], $this->auth($token))
            ->assertOk()
            ->assertJsonPath('data.already_here', true);

        $this->assertSame(1, MeetingHasMember::withTrashed()
            ->where('meeting_id', $meeting->id)
            ->where('member_id', $this->member->id)
            ->count());
    }

    /**
     * An organiser who removed someone leaves a trashed pivot row behind;
     * re-scanning must revive it rather than insert a duplicate.
     */
    public function test_re_scanning_after_being_removed_restores_the_existing_row(): void
    {
        $token = $this->signIn();
        $meeting = $this->meeting();

        $row = MeetingHasMember::create([
            'meeting_id' => $meeting->id,
            'member_id'  => $this->member->id,
        ]);
        $row->delete();

        $this->postJson('/api/member/check-in', ['meeting_token' => $meeting->qr_token], $this->auth($token))
            ->assertCreated();

        $this->assertSame(1, MeetingHasMember::withTrashed()->where('meeting_id', $meeting->id)->count());
        $this->assertNull($row->fresh()->deleted_at);
    }

    public function test_an_unknown_code_is_not_a_check_in(): void
    {
        $token = $this->signIn();

        $this->postJson('/api/member/check-in', ['meeting_token' => 'not-a-real-token'], $this->auth($token))
            ->assertNotFound();
    }

    /** Matches the rule the staff attendance screen already enforces. */
    public function test_a_member_cannot_check_into_another_offices_meeting(): void
    {
        $token = $this->signIn();
        $elsewhere = $this->meeting(['office_id' => Office::create(['name' => 'Port Louis'])->id]);

        $this->postJson('/api/member/check-in', ['meeting_token' => $elsewhere->qr_token], $this->auth($token))
            ->assertForbidden();

        $this->assertFalse($elsewhere->members()->where('members.id', $this->member->id)->exists());
    }

    /** The member is taken from the token, so there is no field to tamper with. */
    public function test_a_member_cannot_check_somebody_else_in(): void
    {
        $token = $this->signIn();
        $meeting = $this->meeting();

        $other = new Member();
        $other->first_name = 'Someone';
        $other->last_name = 'Else';
        $other->office_id = $this->office->id;
        $other->save();

        $this->postJson('/api/member/check-in', [
            'meeting_token' => $meeting->qr_token,
            'member_id'     => $other->id,
        ], $this->auth($token))->assertCreated();

        $this->assertTrue($meeting->members()->where('members.id', $this->member->id)->exists());
        $this->assertFalse($meeting->members()->where('members.id', $other->id)->exists());
    }

    /* ---------------------------------------------------------------- */
    /* Meetings and attendance rate                                      */
    /* ---------------------------------------------------------------- */

    public function test_it_reports_the_members_meetings_and_attendance_rate(): void
    {
        $token = $this->signIn();

        $attended = $this->meeting(['title' => 'Attended']);
        $this->meeting(['title' => 'Missed']);
        $this->meeting(['title' => 'Also missed']);

        MeetingHasMember::create(['meeting_id' => $attended->id, 'member_id' => $this->member->id]);

        $this->getJson('/api/member/meetings', $this->auth($token))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Attended')
            ->assertJsonPath('meta.attended_count', 1)
            ->assertJsonPath('meta.eligible_count', 3)
            ->assertJsonPath('meta.attendance_rate', 33.3)
            ->assertJsonPath('meta.scope', 'office');
    }

    /** A meeting next week is not a meeting the member failed to attend. */
    public function test_future_meetings_are_not_counted_as_missed(): void
    {
        $token = $this->signIn();

        $past = $this->meeting(['title' => 'Last week']);
        $this->meeting(['title' => 'Next week', 'date' => now()->addWeek()->toDateString()]);
        MeetingHasMember::create(['meeting_id' => $past->id, 'member_id' => $this->member->id]);

        $response = $this->getJson('/api/member/meetings', $this->auth($token))
            ->assertOk()
            ->assertJsonPath('meta.eligible_count', 1);

        $this->assertEquals(100, $response->json('meta.attendance_rate'));
    }

    /** Another office's meetings are not the member's to have missed. */
    public function test_other_offices_meetings_are_not_counted(): void
    {
        $token = $this->signIn();

        $mine = $this->meeting(['title' => 'Mine']);
        $this->meeting([
            'title'     => 'Theirs',
            'office_id' => Office::create(['name' => 'Port Louis'])->id,
        ]);
        MeetingHasMember::create(['meeting_id' => $mine->id, 'member_id' => $this->member->id]);

        $response = $this->getJson('/api/member/meetings', $this->auth($token))
            ->assertOk()
            ->assertJsonPath('meta.eligible_count', 1);

        $this->assertEquals(100, $response->json('meta.attendance_rate'));
    }

    /** Members need the hours, not just the day, to know when to turn up. */
    public function test_the_next_meeting_carries_its_start_and_end_times(): void
    {
        $token = $this->signIn();

        $this->meeting([
            'title'      => 'Tomorrow',
            'date'       => now()->addDay()->toDateString(),
            // Seconds included: MySQL normalises a TIME to H:i:s while the
            // SQLite database these tests run on stores the string as given, so
            // only a value already in the column's own format matches on both.
            'start_time' => '19:30:00',
            'end_time'   => '21:00:00',
        ]);

        $this->getJson('/api/member/meetings', $this->auth($token))
            ->assertOk()
            ->assertJsonPath('meta.next_meeting.start_time', '19:30:00')
            ->assertJsonPath('meta.next_meeting.end_time', '21:00:00');
    }

    public function test_it_reports_the_next_upcoming_meeting(): void
    {
        $token = $this->signIn();

        $this->meeting(['title' => 'Last week']);
        $this->meeting(['title' => 'Next month', 'date' => now()->addMonth()->toDateString()]);
        $this->meeting(['title' => 'Next week', 'date' => now()->addWeek()->toDateString()]);

        $this->getJson('/api/member/meetings', $this->auth($token))
            ->assertOk()
            ->assertJsonPath('meta.next_meeting.title', 'Next week')
            ->assertJsonPath('meta.next_meeting.office', $this->office->name)
            ->assertJsonPath('meta.next_meeting.checked_in', false);
    }

    /** The member is sent to their own hall, not another office's. */
    public function test_the_next_meeting_ignores_other_offices(): void
    {
        $token = $this->signIn();

        $this->meeting([
            'title'     => 'Theirs',
            'date'      => now()->addDay()->toDateString(),
            'office_id' => Office::create(['name' => 'Port Louis'])->id,
        ]);

        $this->getJson('/api/member/meetings', $this->auth($token))
            ->assertOk()
            ->assertJsonPath('meta.next_meeting', null);
    }

    /** Checking in early must not leave the card inviting a second check-in. */
    public function test_the_next_meeting_says_when_it_is_already_checked_in(): void
    {
        $token = $this->signIn();

        $upcoming = $this->meeting(['title' => 'Tomorrow', 'date' => now()->addDay()->toDateString()]);
        MeetingHasMember::create(['meeting_id' => $upcoming->id, 'member_id' => $this->member->id]);

        $this->getJson('/api/member/meetings', $this->auth($token))
            ->assertOk()
            ->assertJsonPath('meta.next_meeting.title', 'Tomorrow')
            ->assertJsonPath('meta.next_meeting.checked_in', true);
    }

    public function test_a_member_never_sees_another_members_attendance(): void
    {
        $token = $this->signIn();
        $meeting = $this->meeting();

        $other = new Member();
        $other->first_name = 'Someone';
        $other->last_name = 'Else';
        $other->office_id = $this->office->id;
        $other->save();

        MeetingHasMember::create(['meeting_id' => $meeting->id, 'member_id' => $other->id]);

        $this->getJson('/api/member/meetings', $this->auth($token))
            ->assertOk()
            ->assertJsonCount(0, 'data')
            ->assertJsonPath('meta.attended_count', 0);
    }

    /* ---------------------------------------------------------------- */
    /* Meeting tokens                                                    */
    /* ---------------------------------------------------------------- */

    public function test_every_new_meeting_gets_its_own_check_in_token(): void
    {
        $first = $this->meeting();
        $second = $this->meeting(['title' => 'Another']);

        $this->assertNotEmpty($first->qr_token);
        $this->assertSame(32, strlen($first->qr_token));
        $this->assertNotSame($first->qr_token, $second->qr_token);
    }
}
