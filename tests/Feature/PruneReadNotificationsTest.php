<?php

namespace Tests\Feature;

use App\Models\ActivityNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PruneReadNotificationsTest extends TestCase
{
    use RefreshDatabase;

    private function notify(?string $readAt): ActivityNotification
    {
        return ActivityNotification::create([
            'recipient_type' => 'member',
            'recipient_id' => 1,
            'type' => 'test',
            'title' => 'Something happened',
            'message' => null,
            'url' => '/my',
            'read_at' => $readAt,
        ]);
    }

    public function test_it_deletes_notifications_read_over_a_week_ago(): void
    {
        $readLongAgo = $this->notify(now()->subMonth()->toDateTimeString());
        $readMinutesAgo = $this->notify(now()->subMinutes(5)->toDateTimeString());
        $readSixDaysAgo = $this->notify(now()->subDays(6)->toDateTimeString());
        $unreadLongAgo = $this->notify(null);

        $this->artisan('notifications:prune')
            ->expectsOutputToContain('read notifications pruned: 1')
            ->assertExitCode(0);

        $this->assertDatabaseMissing('activity_notifications', ['id' => $readLongAgo->id]);

        // The whole reason for the delay: a weekly run must not clear something
        // the member read an hour before it fired.
        $this->assertDatabaseHas('activity_notifications', ['id' => $readMinutesAgo->id]);

        // Just inside the window.
        $this->assertDatabaseHas('activity_notifications', ['id' => $readSixDaysAgo->id]);

        // Never touched at any age: it is the only copy of something the member
        // has not seen.
        $this->assertDatabaseHas('activity_notifications', ['id' => $unreadLongAgo->id]);
    }

    public function test_it_works_across_more_rows_than_one_batch(): void
    {
        for ($i = 0; $i < 25; $i++) {
            $this->notify(now()->subDays(30)->toDateTimeString());
        }
        $this->notify(null);

        $this->artisan('notifications:prune')->assertExitCode(0);

        $this->assertSame(1, ActivityNotification::count());
    }

    public function test_it_is_a_no_op_when_nothing_is_old_enough(): void
    {
        $this->notify(null);
        $this->notify(now()->subDay()->toDateTimeString());

        $this->artisan('notifications:prune')
            ->expectsOutputToContain('read notifications pruned: 0')
            ->assertExitCode(0);

        $this->assertSame(2, ActivityNotification::count());
    }
}
