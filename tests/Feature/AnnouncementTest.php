<?php

namespace Tests\Feature;

use App\Mail\AnnouncementMail;
use App\Models\Announcement;
use App\Models\AnnouncementRecipient;
use App\Models\Member;
use App\Models\Office;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Covers the announcements resource, its send action, the recipient picker's
 * data source and the public image URL.
 *
 * The send action is where the risk is: it mails real people, it must not mail
 * anyone twice, and it must not be able to reach another office's register.
 */
class AnnouncementTest extends TestCase
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

    private function member(string $first, ?string $email, Office $office, ?string $age = null, ?int $constituency = null): Member
    {
        return Member::create([
            'first_name'   => $first,
            'last_name'    => 'Test',
            'email'        => $email,
            'age'          => $age,
            'constituency' => $constituency,
            'office_id'    => $office->id,
        ]);
    }

    private function announcement(?Office $office = null, ?string $imagePath = null): Announcement
    {
        return Announcement::create([
            'office_id'   => ($office ?? $this->office)->id,
            'title'       => 'Assemblée générale',
            'description' => "Première ligne.\nSeconde ligne.",
            'image_path'  => $imagePath,
        ]);
    }

    // ------------------------------------------------------------------ counts

    /**
     * queued_count is what the detail screen polls on while a worker is getting
     * through a send, so it has to mean "still outstanding" and nothing else. A
     * recipient that failed for good is pending but not queued: counting it here
     * would leave the screen refreshing until someone navigated away.
     */
    public function test_queued_count_excludes_recipients_that_failed_for_good(): void
    {
        Sanctum::actingAs($this->admin);

        $announcement = $this->announcement();
        $delivered = $this->member('Sent', 'sent@example.com', $this->office);
        $failed = $this->member('Failed', 'failed@example.com', $this->office);
        $waiting = $this->member('Waiting', 'waiting@example.com', $this->office);

        AnnouncementRecipient::create([
            'announcement_id' => $announcement->id, 'member_id' => $delivered->id,
            'email' => $delivered->email, 'sent_at' => now(),
        ]);
        AnnouncementRecipient::create([
            'announcement_id' => $announcement->id, 'member_id' => $failed->id,
            'email' => $failed->email, 'error' => 'Mailbox does not exist',
        ]);
        AnnouncementRecipient::create([
            'announcement_id' => $announcement->id, 'member_id' => $waiting->id,
            'email' => $waiting->email,
        ]);

        $response = $this->postJson('/api/announcements/search', [
            'search' => ['filters' => [['field' => 'id', 'operator' => '=', 'value' => $announcement->id]]],
        ])->assertOk();

        $row = $response->json('data.0');

        $this->assertSame(1, $row['sent_count']);

        // Both outstanding rows, bounce included.
        $this->assertSame(2, $row['pending_count']);

        // Only the one a worker may still deliver.
        $this->assertSame(1, $row['queued_count']);
    }

    // ------------------------------------------------------------------ create

    public function test_an_admin_creates_an_announcement_and_it_is_stamped(): void
    {
        Sanctum::actingAs($this->admin);

        $response = $this->postJson('/api/announcements/mutate', [
            'mutate' => [[
                'operation'  => 'create',
                'attributes' => [
                    'office_id'   => $this->office->id,
                    'title'       => 'Réunion de janvier',
                    'description' => 'Salle communale, 18h30.',
                ],
            ]],
        ]);

        $response->assertSuccessful();

        $announcement = Announcement::firstOrFail();

        $this->assertSame('Réunion de janvier', $announcement->title);
        // Minted on create so the image URL works the moment it is saved.
        $this->assertSame(32, strlen($announcement->public_token));
        // Taken from the session, never from the request body.
        $this->assertSame($this->admin->id, $announcement->created_by);
    }

    public function test_the_public_token_cannot_be_rewritten(): void
    {
        Sanctum::actingAs($this->admin);

        $announcement = $this->announcement();
        $original = $announcement->public_token;

        $this->postJson('/api/announcements/mutate', [
            'mutate' => [[
                'operation'  => 'update',
                'key'        => $announcement->id,
                // office_id is required on update as well as create, matching
                // MemberResource; the form always round-trips it.
                'attributes' => [
                    'office_id'    => $this->office->id,
                    'title'        => 'Titre modifié',
                    'public_token' => 'hijacked',
                ],
            ]],
        ])->assertSuccessful();

        $announcement->refresh();

        $this->assertSame('Titre modifié', $announcement->title);
        // Rotating it would break the image in every email already delivered.
        $this->assertSame($original, $announcement->public_token);
    }

    public function test_an_announcement_of_another_office_is_not_visible(): void
    {
        Sanctum::actingAs($this->admin);

        $this->announcement();
        $this->announcement($this->otherOffice);

        $response = $this->postJson('/api/announcements/search', ['search' => []]);

        $response->assertSuccessful();
        $this->assertCount(1, $response->json('data'));
    }

    // -------------------------------------------------------------- recipients

    public function test_the_recipient_list_carries_the_filter_columns_and_send_status(): void
    {
        Sanctum::actingAs($this->admin);

        $announcement = $this->announcement();

        $withEmail = $this->member('Aisha', 'aisha@example.com', $this->office, '18-30', 5);
        $this->member('Bala', null, $this->office, '31-40', 12);
        $this->member('Elsewhere', 'other@example.com', $this->otherOffice);

        AnnouncementRecipient::create([
            'announcement_id' => $announcement->id,
            'member_id'       => $withEmail->id,
            'email'           => $withEmail->email,
            'sent_at'         => now(),
        ]);

        $response = $this->getJson("/api/announcements/{$announcement->id}/recipients");

        $response->assertOk();

        // Only this office, and the member with no address is still listed --
        // the picker needs to show them as unselectable rather than hide them.
        $this->assertCount(2, $response->json('data'));

        $rows = collect($response->json('data'))->keyBy('first_name');

        $this->assertSame('18-30', $rows['Aisha']['age']);
        $this->assertSame(5, $rows['Aisha']['constituency']);
        $this->assertNotNull($rows['Aisha']['sent_at']);

        $this->assertNull($rows['Bala']['email']);
        $this->assertNull($rows['Bala']['sent_at']);

        $this->assertSame(
            ['total' => 2, 'with_email' => 1, 'sent' => 1, 'failed' => 0],
            $response->json('meta')
        );
    }

    // -------------------------------------------------------------------- send

    public function test_it_mails_the_selected_members_and_records_each_one(): void
    {
        Mail::fake();
        Sanctum::actingAs($this->admin);

        $announcement = $this->announcement();

        $selected = $this->member('Aisha', 'aisha@example.com', $this->office);
        $alsoSelected = $this->member('Chan', 'chan@example.com', $this->office);
        $notSelected = $this->member('Deven', 'deven@example.com', $this->office);

        $response = $this->postJson('/api/announcements/actions/send-announcement-to-members', [
            'search' => ['filters' => [['field' => 'id', 'operator' => '=', 'value' => $announcement->id]]],
            'fields' => [['name' => 'member_ids', 'value' => [$selected->id, $alsoSelected->id]]],
        ]);

        $response->assertSuccessful();

        Mail::assertSent(AnnouncementMail::class, 2);
        Mail::assertSent(AnnouncementMail::class, fn ($mail) => $mail->hasTo('aisha@example.com'));
        Mail::assertSent(AnnouncementMail::class, fn ($mail) => $mail->hasTo('chan@example.com'));

        $this->assertSame(2, AnnouncementRecipient::whereNotNull('sent_at')->count());
        $this->assertDatabaseMissing('announcement_recipients', ['member_id' => $notSelected->id]);
    }

    public function test_a_member_without_an_email_address_is_skipped_rather_than_failing_the_send(): void
    {
        Mail::fake();
        Sanctum::actingAs($this->admin);

        $announcement = $this->announcement();

        $reachable = $this->member('Aisha', 'aisha@example.com', $this->office);
        $noAddress = $this->member('Bala', null, $this->office);

        $this->postJson('/api/announcements/actions/send-announcement-to-members', [
            'search' => ['filters' => [['field' => 'id', 'operator' => '=', 'value' => $announcement->id]]],
            'fields' => [['name' => 'member_ids', 'value' => [$reachable->id, $noAddress->id]]],
        ])->assertSuccessful();

        // The other recipient still went out, and no row was invented for the
        // member there was no way to reach.
        Mail::assertSent(AnnouncementMail::class, 1);
        $this->assertDatabaseMissing('announcement_recipients', ['member_id' => $noAddress->id]);
    }

    public function test_sending_again_does_not_mail_anyone_twice(): void
    {
        Mail::fake();
        Sanctum::actingAs($this->admin);

        $announcement = $this->announcement();
        $member = $this->member('Aisha', 'aisha@example.com', $this->office);

        $payload = [
            'search' => ['filters' => [['field' => 'id', 'operator' => '=', 'value' => $announcement->id]]],
            'fields' => [['name' => 'member_ids', 'value' => [$member->id]]],
        ];

        $this->postJson('/api/announcements/actions/send-announcement-to-members', $payload)
            ->assertSuccessful();
        $this->postJson('/api/announcements/actions/send-announcement-to-members', $payload)
            ->assertSuccessful();

        Mail::assertSent(AnnouncementMail::class, 1);
        $this->assertSame(1, AnnouncementRecipient::count());
    }

    public function test_a_member_of_another_office_cannot_be_mailed_even_if_their_id_is_supplied(): void
    {
        Mail::fake();
        Sanctum::actingAs($this->admin);

        $announcement = $this->announcement();
        $outsider = $this->member('Elsewhere', 'outsider@example.com', $this->otherOffice);

        $this->postJson('/api/announcements/actions/send-announcement-to-members', [
            'search' => ['filters' => [['field' => 'id', 'operator' => '=', 'value' => $announcement->id]]],
            'fields' => [['name' => 'member_ids', 'value' => [$outsider->id]]],
        ])->assertSuccessful();

        // The ids come from the browser, so the action re-scopes them itself.
        Mail::assertNothingSent();
        $this->assertSame(0, AnnouncementRecipient::count());
    }

    public function test_the_mail_comes_from_the_send_only_address_and_invites_no_reply(): void
    {
        Sanctum::actingAs($this->admin);

        $announcement = $this->announcement();
        $member = $this->member('Aisha', 'aisha@example.com', $this->office);

        $rendered = (new AnnouncementMail($announcement, $member))->render();
        $envelope = (new AnnouncementMail($announcement, $member))->envelope();

        $this->assertSame('app@nouveauxdemocrates.com', $envelope->from->address);
        $this->assertSame('Assemblée générale', $envelope->subject);

        // No mailbox exists behind the sender, so nothing may point replies at it.
        $this->assertEmpty($envelope->replyTo);

        // Line breaks typed into the textarea survive; the text itself is escaped.
        $this->assertStringContainsString('Première ligne.<br />', $rendered);
        $this->assertStringContainsString('ne reçoit pas de courrier', $rendered);
    }

    public function test_the_plain_text_part_is_not_html_escaped(): void
    {
        $announcement = Announcement::create([
            'office_id'   => $this->office->id,
            'title'       => "L'assemblée",
            'description' => "N'oubliez pas d'apporter votre carte & votre badge.",
        ]);

        $member = $this->member('Aisha', 'aisha@example.com', $this->office);

        $text = $this->textPartOf($announcement, $member);

        // Blade escapes for HTML, and this part is not HTML. Getting this wrong
        // delivered "N&#039;oubliez" to every recipient.
        $this->assertStringContainsString("N'oubliez pas d'apporter votre carte & votre badge.", $text);
        $this->assertStringNotContainsString('&#039;', $text);
        $this->assertStringNotContainsString('&amp;', $text);
    }

    /** Renders just the text/plain view the Mailable declares. */
    private function textPartOf(Announcement $announcement, Member $member): string
    {
        return view('mail.announcement-text', [
            'title'        => $announcement->title,
            'description'  => $announcement->description,
            'imageUrl'     => $announcement->imageUrl(),
            'greetingName' => trim((string) $member->first_name),
        ])->render();
    }

    // ------------------------------------------------------------------- image

    public function test_the_image_is_served_without_authentication_but_only_by_token(): void
    {
        Storage::fake('local');
        Storage::disk('local')->put('announcement-images/poster.png', 'binary-content');

        $announcement = $this->announcement(imagePath: 'announcement-images/poster.png');

        // No Sanctum::actingAs: a mail client presents no credentials.
        $this->get("/api/public/announcements/{$announcement->public_token}/image")
            ->assertOk()
            // The controller sets the header explicitly, so it carries no
            // filename: the image is displayed, never offered as a download.
            ->assertHeader('Content-Disposition', 'inline');

        $this->get('/api/public/announcements/not-a-real-token/image')->assertNotFound();
    }

    public function test_an_announcement_with_no_image_has_no_image_url(): void
    {
        $this->assertNull($this->announcement()->imageUrl());

        $withImage = $this->announcement(imagePath: 'announcement-images/poster.png');

        // Versioned on the path, so replacing the image busts every mail proxy's
        // copy of the old one.
        $this->assertStringContainsString(
            "/api/public/announcements/{$withImage->public_token}/image?v=",
            $withImage->imageUrl()
        );
    }

    public function test_uploading_an_image_returns_its_stored_path(): void
    {
        Storage::fake('local');
        Sanctum::actingAs($this->admin);

        $response = $this->post('/api/announcement-images', [
            'file' => UploadedFile::fake()->image('poster.jpg', 800, 400),
        ]);

        $response->assertOk();

        $path = $response->json('data.path');

        $this->assertStringStartsWith('announcement-images/', $path);
        Storage::disk('local')->assertExists($path);
    }

    public function test_a_non_image_upload_is_rejected(): void
    {
        Storage::fake('local');
        Sanctum::actingAs($this->admin);

        // Not merely the wrong extension: an SVG is a script-bearing document and
        // is refused on purpose.
        $this->post(
            '/api/announcement-images',
            ['file' => UploadedFile::fake()->create('payload.svg', 8, 'image/svg+xml')],
            ['Accept' => 'application/json']
        )->assertStatus(422);
    }
}
