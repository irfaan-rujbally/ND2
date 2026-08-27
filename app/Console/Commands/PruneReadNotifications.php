<?php

namespace App\Console\Commands;

use App\Models\ActivityNotification;
use Illuminate\Console\Command;

/**
 * Deletes activity notifications the recipient has already read.
 *
 * The bell shows the thirty most recent and nothing offers a history, so a read
 * notification has no reader left: it is a delivery receipt for an event that is
 * already recorded properly elsewhere -- the forum reply, the incident comment,
 * the announcement all still exist on their own tables. Keeping the receipts
 * grows a table nobody queries.
 *
 * Read, and read at least KEEP_DAYS ago. The delay is the point: the weekly run
 * would otherwise clear a notification the member read an hour earlier, and the
 * bell would empty out under them between one glance and the next. A week means
 * what they read is still there when they come back to look for it.
 *
 * Unread rows are never touched at any age. An unread notification is the only
 * copy of something the member has not seen yet.
 */
class PruneReadNotifications extends Command
{
    protected $signature = 'notifications:prune';

    protected $description = 'Delete activity notifications read more than a week ago';

    /** How long a read notification stays readable before it is cleared. */
    private const KEEP_DAYS = 7;

    /**
     * Ids are collected and deleted by key rather than issuing one big
     * conditional DELETE, to keep each statement short enough not to sit on a
     * lock while the app is serving, and because DELETE ... LIMIT is MySQL only.
     */
    private const BATCH = 1000;

    public function handle(): int
    {
        $deleted = 0;

        do {
            $ids = ActivityNotification::query()
                // whereNotNull is redundant against the comparison -- NULL is
                // never less than anything -- and kept because "unread rows are
                // never touched" is the rule here, not a side effect of SQL.
                ->whereNotNull('read_at')
                ->where('read_at', '<', now()->subDays(self::KEEP_DAYS))
                ->limit(self::BATCH)
                ->pluck('id');

            if ($ids->isEmpty()) {
                break;
            }

            $deleted += ActivityNotification::whereKey($ids)->delete();
        } while ($ids->count() === self::BATCH);

        $this->info("read notifications pruned: {$deleted}");

        return self::SUCCESS;
    }
}
