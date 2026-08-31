<?php

namespace Tests\Feature;

use App\Jobs\SendPushNotification;
use App\Models\ActivityNotification;
use App\Models\Member;
use App\Models\Office;
use App\Models\PushSubscription;
use App\Support\ActivityNotifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class PushNotificationQueueTest extends TestCase
{
    use RefreshDatabase;

    private function subscribe(Member $member): void
    {
        PushSubscription::create([
            'recipient_type' => 'member',
            'recipient_id'   => $member->id,
            'endpoint'       => "https://push.example/{$member->id}",
            'endpoint_hash'  => hash('sha256', "https://push.example/{$member->id}"),
            'public_key'     => 'key',
            'auth_token'     => 'token',
        ]);
    }

    public function test_notifying_an_office_writes_every_row_and_queues_a_push_per_registered_device(): void
    {
        Queue::fake();

        $office = Office::create(['name' => 'Central']);
        $alice = Member::create(['first_name' => 'Alice', 'last_name' => 'Member', 'office_id' => $office->id]);
        $carol = Member::create(['first_name' => 'Carol', 'last_name' => 'Member', 'office_id' => $office->id]);
        $bob = Member::create(['first_name' => 'Bob', 'last_name' => 'Member', 'office_id' => $office->id]);

        // Alice has the app installed; Carol does not.
        $this->subscribe($alice);

        ActivityNotifier::officeMembers($office->id, 'new_forum', 'New forum', 'Roadworks', '/my/forum/1', $bob->id);

        // The bell reads these rows, so they must exist synchronously even
        // though delivery to the devices does not -- and they exist for every
        // recipient, whether or not that member has ever installed the app.
        $this->assertSame(2, ActivityNotification::where('recipient_type', 'member')->count());
        foreach ([$alice, $carol] as $recipient) {
            $this->assertDatabaseHas('activity_notifications', [
                'recipient_type' => 'member',
                'recipient_id'   => $recipient->id,
                'type'           => 'new_forum',
            ]);
        }

        // The excluded author is notified neither way.
        $this->assertDatabaseMissing('activity_notifications', ['recipient_id' => $bob->id]);

        /*
         * One job, not one per recipient. PushService returns immediately for a
         * member with nothing registered, so dispatching for Carol was only ever
         * a job that discovered it had nothing to deliver -- and a five-hundred
         * member office paid for five hundred of those inside one web request.
         */
        Queue::assertPushed(SendPushNotification::class, 1);
        Queue::assertPushed(
            SendPushNotification::class,
            fn (SendPushNotification $job) => $job->notification->recipient_id === $alice->id,
        );
    }

    public function test_a_fan_out_pushes_only_the_notifications_it_just_wrote(): void
    {
        $office = Office::create(['name' => 'Central']);
        $alice = Member::create(['first_name' => 'Alice', 'last_name' => 'Member', 'office_id' => $office->id]);
        $this->subscribe($alice);

        ActivityNotifier::officeMembers($office->id, 'new_forum', 'First', null, '/my/forum/1');

        Queue::fake();

        ActivityNotifier::officeMembers($office->id, 'new_poll', 'Second', null, '/my/polls');

        // The second fan-out must not re-push the first one's row, which is
        // still sitting unread in the same table.
        Queue::assertPushed(SendPushNotification::class, 1);
        Queue::assertPushed(
            SendPushNotification::class,
            fn (SendPushNotification $job) => $job->notification->type === 'new_poll',
        );
    }
}
