<?php

namespace Tests\Feature;

use App\Models\ForumComment;
use App\Models\ForumTopic;
use App\Models\Member;
use App\Models\Office;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Covers the forum: the member portal side, the office's moderation side, and the
 * wall between them.
 *
 * The tests that matter most are the moderation ones. The whole design rests on
 * one distinction -- an author deleting their own post leaves nothing, an
 * administrator removing it leaves a tombstone the author can see -- and if that
 * inverts, either members are silently censored or moderated content leaks back
 * into the thread.
 */
class ForumTest extends TestCase
{
    use RefreshDatabase;

    private Office $office;

    private Office $otherOffice;

    private Member $member;

    private Member $otherMember;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Role::create(['name' => 'admin', 'guard_name' => 'web']);

        $this->office = Office::create(['name' => 'Bonne Terre']);
        $this->otherOffice = Office::create(['name' => 'Rodrigues']);

        $this->member = $this->makeMember('Aisha', 'Ramful', '52528555', $this->office);
        $this->otherMember = $this->makeMember('Chan', 'Li', '52528666', $this->office);

        $this->admin = new User();
        $this->admin->first_name = 'Ops';
        $this->admin->last_name = 'Admin';
        $this->admin->email = 'admin@example.com';
        $this->admin->password = 'secret';
        $this->admin->office_id = $this->office->id;
        $this->admin->save();
        $this->admin->assignRole('admin');
    }

    private function makeMember(string $first, string $last, string $phone, Office $office): Member
    {
        $member = new Member();
        $member->first_name = $first;
        $member->last_name = $last;
        $member->phone = $phone;
        $member->email = strtolower($first).'@example.com';
        $member->office_id = $office->id;
        // Matches Member::defaultPasswordFor: last-name initial + last 7 digits.
        $member->password = strtoupper($last[0]).substr($phone, -7);
        $member->save();

        return $member;
    }

    /**
     * Drops whatever user the auth guards have already resolved.
     *
     * A feature test reuses one application instance, and Sanctum's guard caches
     * the user it resolved on the first authenticated request. Without this a
     * later request keeps the earlier identity however different its
     * Authorization header is -- which quietly turned the member requests in the
     * moderation tests below into staff requests, and made them pass or fail for
     * entirely the wrong reason.
     *
     * Sanctum::actingAs has the same problem in a different guise, which is why
     * neither side of this suite uses it.
     */
    private function forgetIdentity(): void
    {
        $this->app['auth']->forgetGuards();
    }

    /** A real staff bearer token. */
    private function staffToken(?User $user = null): array
    {
        $user ??= $this->admin;

        $this->forgetIdentity();

        return ['Authorization' => 'Bearer '.$user->createToken('web')->plainTextToken];
    }

    /** Signs a member in through the real portal login, abilities included. */
    private function memberToken(?Member $member = null): array
    {
        $member ??= $this->member;

        $this->forgetIdentity();

        $token = $this->postJson('/api/member/auth/login', [
            'identifier' => $member->email,
            'password'   => strtoupper($member->last_name[0]).substr($member->phone, -7),
        ])->assertOk()->json('token');

        $this->forgetIdentity();

        return ['Authorization' => 'Bearer '.$token];
    }

    private function topic(array $attributes = [], ?Member $author = null): ForumTopic
    {
        $topic = ForumTopic::make(array_merge([
            'office_id'   => $this->office->id,
            'title'       => 'Road repairs in Bonne Terre',
            'description' => "The main road is in a poor state.\nWhat can we do?",
        ], $attributes));

        // Set directly: no session is active here, so the model's author hook
        // has nothing to stamp from.
        $topic->author_type = ForumTopic::AUTHOR_MEMBER;
        $topic->author_id = ($author ?? $this->member)->id;
        $topic->save();

        return $topic;
    }

    private function comment(ForumTopic $topic, ?Member $author = null, string $body = 'Agreed.'): ForumComment
    {
        $comment = ForumComment::make(['topic_id' => $topic->id, 'body' => $body]);
        $comment->author_type = ForumComment::AUTHOR_MEMBER;
        $comment->author_id = ($author ?? $this->member)->id;
        $comment->save();

        return $comment;
    }

    /* ---------------------------------------------------------------- */
    /* Member: reading                                                   */
    /* ---------------------------------------------------------------- */

    public function test_a_member_sees_their_own_offices_topics_most_recent_conversation_first(): void
    {
        $old = $this->topic(['title' => 'Older']);
        $old->forceFill(['last_activity_at' => now()->subDays(5)])->save();

        $quiet = $this->topic(['title' => 'Quiet but newer']);
        $quiet->forceFill(['last_activity_at' => now()->subDay()])->save();

        $busy = $this->topic(['title' => 'Busy']);
        $busy->forceFill(['last_activity_at' => now()])->save();

        $this->topic(['title' => 'Rodrigues only', 'office_id' => $this->otherOffice->id]);

        $response = $this->getJson('/api/member/forum/topics', $this->memberToken());

        $response->assertOk();
        $this->assertSame(
            ['Busy', 'Quiet but newer', 'Older'],
            array_column($response->json('data'), 'title')
        );
    }

    public function test_my_topics_returns_only_what_this_member_wrote(): void
    {
        $this->topic(['title' => 'Mine']);
        $this->topic(['title' => 'Theirs'], $this->otherMember);

        $response = $this->getJson('/api/member/forum/topics?mine=1', $this->memberToken());

        $response->assertOk();
        $this->assertSame(['Mine'], array_column($response->json('data'), 'title'));
        $this->assertTrue($response->json('data.0.is_mine'));
        $this->assertSame(1, $response->json('meta.mine_total'));
    }

    public function test_searching_topics_matches_the_title_and_the_body(): void
    {
        $this->topic(['title' => 'Road repairs', 'description' => 'The lane by the school.']);
        $this->topic(['title' => 'Fundraiser', 'description' => 'A clean-up day for the lane.']);
        $this->topic(['title' => 'Membership cards', 'description' => 'Collect them at the office.']);

        $token = $this->memberToken();

        $byTitle = $this->getJson('/api/member/forum/topics?search=repairs', $token);
        $this->assertSame(['Road repairs'], array_column($byTitle->json('data'), 'title'));

        // One term, both columns: the body match is found too.
        $byBody = $this->getJson('/api/member/forum/topics?search=lane', $token);
        $this->assertSame(
            ['Fundraiser', 'Road repairs'],
            array_column($byBody->json('data'), 'title')
        );

        $this->assertSame(0, $this->getJson('/api/member/forum/topics?search=nothing', $token)
            ->json('meta.total'));
    }

    public function test_a_search_cannot_be_used_to_probe_a_removed_topic(): void
    {
        $secret = $this->topic([
            'title'       => 'Something objectionable',
            'description' => 'A distinctive phrase nobody else used.',
        ]);

        $this->postJson("/api/forum/topics/{$secret->id}/moderate", [], $this->staffToken())->assertOk();

        $token = $this->memberToken();

        /*
         * The tombstone is still listed -- that is how its author learns of the
         * removal -- but it must never be a search *hit*. Otherwise a member
         * could recover the removed wording a term at a time by watching which
         * searches make the tombstone appear.
         */
        $unfiltered = $this->getJson('/api/member/forum/topics', $token);
        $this->assertCount(1, $unfiltered->json('data'));
        $this->assertTrue($unfiltered->json('data.0.moderated'));

        foreach (['objectionable', 'distinctive phrase'] as $term) {
            $this->assertSame(
                0,
                $this->getJson('/api/member/forum/topics?search='.urlencode($term), $token)
                    ->json('meta.total'),
                "The term '{$term}' must not surface a moderated topic."
            );
        }
    }

    public function test_searching_topics_still_respects_office_and_author_filters(): void
    {
        $this->topic(['title' => 'Road repairs here']);
        $this->topic(['title' => 'Road repairs elsewhere', 'office_id' => $this->otherOffice->id]);
        $this->topic(['title' => 'Road repairs by someone else'], $this->otherMember);

        $token = $this->memberToken();

        $all = $this->getJson('/api/member/forum/topics?search=road', $token);
        $this->assertSame(
            ['Road repairs by someone else', 'Road repairs here'],
            array_column($all->json('data'), 'title')
        );

        // Search and "my topics" compose rather than replacing one another.
        $mine = $this->getJson('/api/member/forum/topics?search=road&mine=1', $token);
        $this->assertSame(['Road repairs here'], array_column($mine->json('data'), 'title'));
    }

    public function test_a_thread_reads_oldest_comment_first_and_counts_them(): void
    {
        $topic = $this->topic();

        $this->comment($topic, $this->member, 'First');
        $this->comment($topic, $this->otherMember, 'Second');

        $response = $this->getJson("/api/member/forum/topics/{$topic->id}", $this->memberToken());

        $response->assertOk();
        $this->assertSame(['First', 'Second'], array_column($response->json('comments'), 'body'));
        $this->assertSame(2, $response->json('data.comments_count'));

        // Ownership is per comment, so the reply buttons can be drawn correctly.
        $this->assertTrue($response->json('comments.0.is_mine'));
        $this->assertFalse($response->json('comments.1.is_mine'));
    }

    public function test_a_member_cannot_open_another_offices_topic(): void
    {
        $topic = $this->topic(['office_id' => $this->otherOffice->id]);

        // 404, not 403: the forum must not be enumerable by watching which ids
        // answer differently.
        $this->getJson("/api/member/forum/topics/{$topic->id}", $this->memberToken())
            ->assertNotFound();
    }

    /* ---------------------------------------------------------------- */
    /* Member: writing                                                   */
    /* ---------------------------------------------------------------- */

    public function test_a_member_starts_a_topic_and_is_recorded_as_its_author(): void
    {
        $response = $this->postJson('/api/member/forum/topics', [
            'title'       => 'Youth wing meeting',
            'description' => 'Can we meet on a Saturday?',
        ], $this->memberToken());

        $response->assertCreated();

        $topic = ForumTopic::firstOrFail();

        $this->assertSame(ForumTopic::AUTHOR_MEMBER, $topic->author_type);
        $this->assertSame($this->member->id, $topic->author_id);
        // Taken from the member, never the request body.
        $this->assertSame($this->office->id, $topic->office_id);
        // A new topic counts as activity, or it would sort below every older
        // topic that happens to have a comment.
        $this->assertNotNull($topic->last_activity_at);
    }

    public function test_the_author_of_a_topic_cannot_be_forged(): void
    {
        $this->postJson('/api/member/forum/topics', [
            'title'       => 'Impersonation attempt',
            'author_type' => ForumTopic::AUTHOR_USER,
            'author_id'   => $this->admin->id,
            'office_id'   => $this->otherOffice->id,
        ], $this->memberToken())->assertCreated();

        $topic = ForumTopic::firstOrFail();

        $this->assertSame(ForumTopic::AUTHOR_MEMBER, $topic->author_type);
        $this->assertSame($this->member->id, $topic->author_id);
        $this->assertSame($this->office->id, $topic->office_id);
    }

    public function test_a_member_edits_and_deletes_their_own_topic_but_not_anothers(): void
    {
        $mine = $this->topic(['title' => 'Mine']);
        $theirs = $this->topic(['title' => 'Theirs'], $this->otherMember);

        $this->patchJson("/api/member/forum/topics/{$mine->id}", ['title' => 'Mine, corrected'],
            $this->memberToken())->assertOk();
        $this->assertSame('Mine, corrected', $mine->fresh()->title);

        $this->patchJson("/api/member/forum/topics/{$theirs->id}", ['title' => 'Hijacked'],
            $this->memberToken())->assertForbidden();
        $this->assertSame('Theirs', $theirs->fresh()->title);

        $this->deleteJson("/api/member/forum/topics/{$theirs->id}", [], $this->memberToken())
            ->assertForbidden();

        $this->deleteJson("/api/member/forum/topics/{$mine->id}", [], $this->memberToken())
            ->assertNoContent();
        $this->assertSoftDeleted('forum_topics', ['id' => $mine->id]);
    }

    public function test_posting_a_comment_lifts_the_topic_up_the_list(): void
    {
        $topic = $this->topic();
        $topic->forceFill(['last_activity_at' => now()->subDays(10)])->save();

        $this->postJson("/api/member/forum/topics/{$topic->id}/comments", ['body' => 'Still relevant.'],
            $this->memberToken())->assertCreated();

        $this->assertTrue($topic->fresh()->last_activity_at->isAfter(now()->subMinute()));
    }

    public function test_a_member_edits_and_deletes_their_own_comment_but_not_anothers(): void
    {
        $topic = $this->topic();
        $mine = $this->comment($topic, $this->member, 'Mine');
        $theirs = $this->comment($topic, $this->otherMember, 'Theirs');

        $edit = $this->patchJson("/api/member/forum/comments/{$mine->id}", ['body' => 'Mine, corrected'],
            $this->memberToken());
        $edit->assertOk();
        $this->assertSame('Mine, corrected', $mine->fresh()->body);

        $this->patchJson("/api/member/forum/comments/{$theirs->id}", ['body' => 'Hijacked'],
            $this->memberToken())->assertForbidden();
        $this->assertSame('Theirs', $theirs->fresh()->body);

        $this->deleteJson("/api/member/forum/comments/{$theirs->id}", [], $this->memberToken())
            ->assertForbidden();

        $this->deleteJson("/api/member/forum/comments/{$mine->id}", [], $this->memberToken())
            ->assertNoContent();
        $this->assertSoftDeleted('forum_comments', ['id' => $mine->id]);
    }

    public function test_an_edited_comment_is_marked_as_edited(): void
    {
        $topic = $this->topic();
        $comment = $this->comment($topic, $this->member, 'As posted');

        $before = $this->getJson("/api/member/forum/topics/{$topic->id}", $this->memberToken());
        $this->assertFalse($before->json('comments.0.edited'), 'a fresh comment is not edited');

        /*
         * Both timestamp columns are `datetime`, so the flag can only see a
         * change once the clock has moved a whole second. Travelling is exact
         * where sleeping would be flaky.
         */
        $this->travel(2)->seconds();

        $this->patchJson("/api/member/forum/comments/{$comment->id}", ['body' => 'As corrected'],
            $this->memberToken())->assertOk()->assertJsonPath('data.edited', true);

        $after = $this->getJson("/api/member/forum/topics/{$topic->id}", $this->memberToken());
        $this->assertTrue($after->json('comments.0.edited'));
        $this->assertSame('As corrected', $after->json('comments.0.body'));

        $this->travelBack();
    }

    public function test_a_comment_a_member_deleted_themselves_leaves_no_trace_in_the_thread(): void
    {
        $topic = $this->topic();
        $comment = $this->comment($topic, $this->member, 'Never mind');

        $this->deleteJson("/api/member/forum/comments/{$comment->id}", [], $this->memberToken())
            ->assertNoContent();

        $response = $this->getJson("/api/member/forum/topics/{$topic->id}", $this->memberToken());

        // No tombstone: the author knows what they did, so there is nobody to
        // inform. This is the half of the design that must not blur.
        $this->assertSame([], $response->json('comments'));
    }

    /* ---------------------------------------------------------------- */
    /* Moderation                                                        */
    /* ---------------------------------------------------------------- */

    public function test_a_moderated_topic_stays_visible_to_its_author_as_a_tombstone(): void
    {
        $topic = $this->topic(['title' => 'Something objectionable']);

        $this->postJson("/api/forum/topics/{$topic->id}/moderate", [], $this->staffToken())->assertOk();

        $response = $this->getJson('/api/member/forum/topics', $this->memberToken());

        $response->assertOk();
        // Still listed -- that is the whole point.
        $this->assertCount(1, $response->json('data'));

        $row = $response->json('data.0');
        $this->assertTrue($row['moderated']);
        $this->assertNotNull($row['moderated_at']);
        // Content stripped, including the title: a title can itself be the thing
        // that had to be removed.
        $this->assertNull($row['title']);
        $this->assertNull($row['description']);
        $this->assertNull($row['image_url']);
        // Still attributed, so the author recognises it as theirs.
        $this->assertTrue($row['is_mine']);
    }

    public function test_a_moderated_comment_shows_as_removed_rather_than_disappearing(): void
    {
        $topic = $this->topic();
        $comment = $this->comment($topic, $this->member, 'Something objectionable');

        $this->postJson("/api/forum/comments/{$comment->id}/moderate", [], $this->staffToken())->assertOk();

        $response = $this->getJson("/api/member/forum/topics/{$topic->id}", $this->memberToken());

        $response->assertOk();
        $this->assertCount(1, $response->json('comments'));
        $this->assertTrue($response->json('comments.0.moderated'));
        $this->assertNull($response->json('comments.0.body'));
        $this->assertTrue($response->json('comments.0.is_mine'));

        // Not counted as part of the conversation any more.
        $this->assertSame(0, $response->json('data.comments_count'));
    }

    public function test_a_member_cannot_edit_or_delete_something_an_administrator_removed(): void
    {
        $topic = $this->topic();
        $comment = $this->comment($topic, $this->member);

        $this->postJson("/api/forum/topics/{$topic->id}/moderate", [], $this->staffToken())->assertOk();
        $this->postJson("/api/forum/comments/{$comment->id}/moderate", [], $this->staffToken())->assertOk();

        $token = $this->memberToken();

        // 403 with a reason, not 404: they wrote it, so they know it exists.
        $this->patchJson("/api/member/forum/topics/{$topic->id}", ['title' => 'Sneaky rewrite'], $token)
            ->assertForbidden()
            ->assertJsonPath('message', 'This topic was removed by an administrator and can no longer be edited.');

        $this->patchJson("/api/member/forum/comments/{$comment->id}", ['body' => 'Sneaky rewrite'], $token)
            ->assertForbidden();

        $this->assertSame('Road repairs in Bonne Terre', $topic->fresh()->title);
    }

    public function test_a_moderated_topic_is_closed_to_new_comments(): void
    {
        $topic = $this->topic();

        $this->postJson("/api/forum/topics/{$topic->id}/moderate", [], $this->staffToken())->assertOk();

        $this->postJson("/api/member/forum/topics/{$topic->id}/comments", ['body' => 'Carrying on regardless'],
            $this->memberToken())->assertForbidden();

        $this->assertSame(0, ForumComment::count());
    }

    public function test_the_office_still_sees_what_it_moderated(): void
    {
        $topic = $this->topic(['title' => 'Something objectionable']);
        $comment = $this->comment($topic, $this->member, 'And this too');

        $this->postJson("/api/forum/topics/{$topic->id}/moderate", [], $this->staffToken())->assertOk();
        $this->postJson("/api/forum/comments/{$comment->id}/moderate", [], $this->staffToken())->assertOk();

        $response = $this->getJson("/api/forum/topics/{$topic->id}", $this->staffToken());

        $response->assertOk();
        // A moderation decision nobody can review afterwards is not a decision.
        $this->assertSame('Something objectionable', $response->json('data.title'));
        $this->assertTrue($response->json('data.moderated'));
        $this->assertSame('And this too', $response->json('comments.0.body'));
        $this->assertTrue($response->json('comments.0.moderated'));
    }

    public function test_moderation_records_who_decided_and_can_be_undone(): void
    {
        $topic = $this->topic();

        $this->postJson("/api/forum/topics/{$topic->id}/moderate", [], $this->staffToken())->assertOk();

        $topic->refresh();
        $this->assertSame($this->admin->id, $topic->moderated_by_user_id);

        $this->deleteJson("/api/forum/topics/{$topic->id}/moderate", [], $this->staffToken())->assertOk();

        $topic->refresh();
        $this->assertNull($topic->moderated_at);
        $this->assertNull($topic->moderated_by_user_id);

        // Readable again by its author, content and all.
        $this->assertSame(
            'Road repairs in Bonne Terre',
            $this->getJson('/api/member/forum/topics', $this->memberToken())->json('data.0.title')
        );
    }

    /* ---------------------------------------------------------------- */
    /* The office posting                                                */
    /* ---------------------------------------------------------------- */

    public function test_an_administrator_posts_as_the_office_not_under_their_own_name(): void
    {
        $created = $this->postJson('/api/forum/topics', [
            'title'       => 'Notice from the office',
            'description' => 'Please read.',
        ], $this->staffToken());

        $created->assertCreated();
        $this->assertTrue($created->json('data.by_office'));
        // Members are addressed by the party; naming the clerk who typed it is
        // more than they need to know.
        $this->assertSame('Nouveaux Démocrates', $created->json('data.author_name'));

        $topic = ForumTopic::firstOrFail();
        $this->assertSame(ForumTopic::AUTHOR_USER, $topic->author_type);
        $this->assertSame($this->admin->id, $topic->author_id);

        // And a member sees it that way too, without it being theirs to edit.
        $row = $this->getJson('/api/member/forum/topics', $this->memberToken())->json('data.0');
        $this->assertSame('Nouveaux Démocrates', $row['author_name']);
        $this->assertFalse($row['is_mine']);
    }

    public function test_an_administrator_replies_as_the_office(): void
    {
        $topic = $this->topic();

        $this->postJson("/api/forum/topics/{$topic->id}/comments", ['body' => 'The office is looking into it.'], $this->staffToken())
            ->assertCreated()
            ->assertJsonPath('data.by_office', true)
            ->assertJsonPath('data.author_name', 'Nouveaux Démocrates');

        // A member cannot pass it off as their own even though it is in a thread
        // they started.
        $comment = ForumComment::firstOrFail();
        $this->patchJson("/api/member/forum/comments/{$comment->id}", ['body' => 'Rewritten'],
            $this->memberToken())->assertForbidden();
    }

    public function test_the_office_only_sees_its_own_forum(): void
    {
        $this->topic(['title' => 'Ours']);
        $this->topic(['title' => 'Theirs', 'office_id' => $this->otherOffice->id]);

        $response = $this->getJson('/api/forum/topics', $this->staffToken());

        $response->assertOk();
        $this->assertSame(['Ours'], array_column($response->json('data'), 'title'));
    }

    /* ---------------------------------------------------------------- */
    /* Isolation between the two sides                                   */
    /* ---------------------------------------------------------------- */

    public function test_a_member_token_cannot_reach_the_staff_forum(): void
    {
        $topic = $this->topic();
        $token = $this->memberToken();

        $this->getJson('/api/forum/topics', $token)->assertForbidden();
        $this->postJson("/api/forum/topics/{$topic->id}/moderate", [], $token)->assertForbidden();
        $this->postJson('/api/forum/topics', ['title' => 'As the office'], $token)->assertForbidden();
    }

    public function test_a_staff_token_cannot_reach_the_member_forum(): void
    {
        $topic = $this->topic();
        $token = ['Authorization' => 'Bearer '.$this->admin->createToken('web')->plainTextToken];

        $this->getJson('/api/member/forum/topics', $token)->assertForbidden();
        $this->patchJson("/api/member/forum/topics/{$topic->id}", ['title' => 'x'], $token)->assertForbidden();
    }

    public function test_a_non_admin_user_cannot_moderate(): void
    {
        $topic = $this->topic();

        $plain = new User();
        $plain->first_name = 'Plain';
        $plain->last_name = 'User';
        $plain->email = 'plain@example.com';
        $plain->password = 'secret';
        $plain->office_id = $this->office->id;
        $plain->save();

        $plainToken = $this->staffToken($plain);

        $this->getJson('/api/forum/topics', $plainToken)->assertForbidden();
        $this->postJson("/api/forum/topics/{$topic->id}/moderate", [], $plainToken)->assertForbidden();
    }

    /* ---------------------------------------------------------------- */
    /* Images                                                            */
    /* ---------------------------------------------------------------- */

    public function test_a_member_uploads_an_image_and_attaches_it_to_a_topic(): void
    {
        Storage::fake('local');

        $upload = $this->post('/api/member/forum/images',
            ['file' => UploadedFile::fake()->image('road.jpg', 800, 600)],
            $this->memberToken() + ['Accept' => 'application/json']
        );

        $upload->assertOk();
        $path = $upload->json('data.path');
        Storage::disk('local')->assertExists($path);

        $created = $this->postJson('/api/member/forum/topics',
            ['title' => 'With a photo', 'image_path' => $path],
            $this->memberToken()
        );

        $created->assertCreated();

        $url = $created->json('data.image_url');
        $this->assertStringContainsString('/api/public/forum/topics/', $url);
        // Versioned on the stored path, so replacing the image busts the cache.
        $this->assertStringContainsString('?v=', $url);
    }

    public function test_a_forum_image_is_served_by_token_without_a_session(): void
    {
        Storage::fake('local');
        Storage::disk('local')->put('forum-images/road.png', 'binary');

        $topic = $this->topic(['image_path' => 'forum-images/road.png']);

        // No credentials at all: one URL has to work for a member token and a
        // staff token alike, and those are different guards.
        $this->get("/api/public/forum/topics/{$topic->public_token}/image")->assertOk();
        $this->get('/api/public/forum/topics/not-a-real-token/image')->assertNotFound();
    }

    public function test_a_script_bearing_upload_is_refused(): void
    {
        Storage::fake('local');

        $this->post('/api/member/forum/images',
            ['file' => UploadedFile::fake()->create('payload.svg', 8, 'image/svg+xml')],
            $this->memberToken() + ['Accept' => 'application/json']
        )->assertStatus(422);
    }

    public function test_the_public_image_token_cannot_be_rotated(): void
    {
        $topic = $this->topic(['image_path' => 'forum-images/road.png']);
        $original = $topic->public_token;

        $this->patchJson("/api/member/forum/topics/{$topic->id}", [
            'title'        => 'Renamed',
            'public_token' => 'hijacked',
        ], $this->memberToken())->assertOk();

        // Rotating it would break the image on every page already open.
        $this->assertSame($original, $topic->fresh()->public_token);
    }
}
