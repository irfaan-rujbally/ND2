<?php

namespace Tests\Feature;

use App\Jobs\SendPushNotification;
use App\Models\ActivityNotification;
use App\Models\Member;
use App\Models\Office;
use App\Support\ActivityNotifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class PushNotificationQueueTest extends TestCase
{
    use RefreshDatabase;

    public function test_notifying_an_office_writes_every_row_and_queues_one_push_each(): void
    {
        Queue::fake();

        $office = Office::create(['name' => 'Central']);
        $alice = Member::create(['first_name' => 'Alice', 'last_name' => 'Member', 'office_id' => $office->id]);
        $bob = Member::create(['first_name' => 'Bob', 'last_name' => 'Member', 'office_id' => $office->id]);

        ActivityNotifier::officeMembers($office->id, 'new_forum', 'New forum', 'Roadworks', '/my/forum/1', $bob->id);

        // The bell reads these rows, so they must exist synchronously even
        // though delivery to the devices does not.
        $this->assertSame(1, ActivityNotification::where('recipient_type', 'member')->count());
        $this->assertDatabaseHas('activity_notifications', [
            'recipient_type' => 'member',
            'recipient_id' => $alice->id,
            'type' => 'new_forum',
        ]);

        // Delivery is deferred, and the excluded author gets no job.
        Queue::assertPushed(SendPushNotification::class, 1);
        Queue::assertPushed(
            SendPushNotification::class,
            fn (SendPushNotification $job) => $job->notification->recipient_id === $alice->id,
        );
    }
}
