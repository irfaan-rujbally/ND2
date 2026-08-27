<?php

namespace Tests\Feature;

use App\Models\ActivityNotification;
use App\Models\Member;
use App\Models\Office;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationRemovalTest extends TestCase
{
    use RefreshDatabase;

    private function notify(string $type, int $id, string $title = 'Something happened'): ActivityNotification
    {
        return ActivityNotification::create([
            'recipient_type' => $type,
            'recipient_id' => $id,
            'type' => 'test',
            'title' => $title,
            'message' => null,
            'url' => '/my',
        ]);
    }

    public function test_a_member_can_remove_one_of_their_notifications(): void
    {
        $office = Office::create(['name' => 'Central']);
        $member = Member::create(['first_name' => 'Alice', 'last_name' => 'Member', 'office_id' => $office->id]);
        $mine = $this->notify('member', $member->id);
        $keep = $this->notify('member', $member->id, 'Still here');
        $token = $member->createToken('test', [Member::PORTAL_ABILITY])->plainTextToken;

        $this->withToken($token)->deleteJson("/api/member/notifications/{$mine->id}")->assertNoContent();

        $this->assertDatabaseMissing('activity_notifications', ['id' => $mine->id]);
        $this->assertDatabaseHas('activity_notifications', ['id' => $keep->id]);
    }

    public function test_a_member_cannot_remove_someone_elses_notification(): void
    {
        $office = Office::create(['name' => 'Central']);
        $member = Member::create(['first_name' => 'Alice', 'last_name' => 'Member', 'office_id' => $office->id]);
        $other = Member::create(['first_name' => 'Bob', 'last_name' => 'Member', 'office_id' => $office->id]);
        $theirs = $this->notify('member', $other->id);
        $token = $member->createToken('test', [Member::PORTAL_ABILITY])->plainTextToken;

        // 404 rather than 403: the ids are sequential, and a 403 would confirm
        // the row exists.
        $this->withToken($token)->deleteJson("/api/member/notifications/{$theirs->id}")->assertNotFound();

        $this->assertDatabaseHas('activity_notifications', ['id' => $theirs->id]);
    }

    public function test_clearing_removes_only_the_callers_own_notifications(): void
    {
        $office = Office::create(['name' => 'Central']);
        $member = Member::create(['first_name' => 'Alice', 'last_name' => 'Member', 'office_id' => $office->id]);
        $other = Member::create(['first_name' => 'Bob', 'last_name' => 'Member', 'office_id' => $office->id]);
        $this->notify('member', $member->id);
        $this->notify('member', $member->id, 'And another');
        $theirs = $this->notify('member', $other->id);

        // A staff row that happens to share the recipient id must survive too:
        // the two id spaces are unrelated, so recipient_type has to be part of
        // every query.
        $staff = $this->notify('user', $member->id, 'Staff row');

        $token = $member->createToken('test', [Member::PORTAL_ABILITY])->plainTextToken;

        $this->withToken($token)->deleteJson('/api/member/notifications')->assertNoContent();

        $this->assertSame(0, ActivityNotification::where('recipient_type', 'member')->where('recipient_id', $member->id)->count());
        $this->assertDatabaseHas('activity_notifications', ['id' => $theirs->id]);
        $this->assertDatabaseHas('activity_notifications', ['id' => $staff->id]);

        $this->withToken($token)->getJson('/api/member/notifications')
            ->assertOk()
            ->assertJsonCount(0, 'data')
            ->assertJsonPath('unread_count', 0);
    }
}
