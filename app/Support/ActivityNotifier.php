<?php

namespace App\Support;

use App\Jobs\SendPushNotification;
use App\Models\ActivityNotification;
use App\Models\Member;
use App\Models\PushSubscription;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Writes the rows behind the bell in the header, and hands the push half to a
 * queue.
 *
 * The fan-out helpers insert in bulk. They used to write one row per recipient
 * through the model, each preceded by an existence check -- two round trips per
 * member, which on a five-hundred-member office is a thousand queries inside one
 * web request. Against a database that is not on the same host that is over a
 * minute, and the request died on max_execution_time before the last member was
 * notified. Announcing anything to a real office was therefore a 500 with the
 * notice half-delivered.
 *
 * The rows are identical to what the loop produced; only the number of
 * statements changed. ActivityNotification has no model events, so nothing is
 * skipped by inserting directly.
 */
class ActivityNotifier
{
    /** Rows per INSERT. Large enough to be one statement for most offices. */
    private const CHUNK = 500;

    public static function staff(?int $officeId, string $type, string $title, ?string $message, string $url): void
    {
        if ($officeId === null) return;

        self::fanOut(
            'user',
            User::query()->where('office_id', $officeId)->pluck('id'),
            $type, $title, $message, $url
        );
    }

    public static function member(?int $memberId, string $type, string $title, ?string $message, string $url): void
    {
        if ($memberId === null || ! Member::query()->whereKey($memberId)->exists()) return;

        self::fanOut('member', collect([$memberId]), $type, $title, $message, $url);
    }

    public static function officeMembers(?int $officeId, string $type, string $title, ?string $message, string $url, ?int $exceptMemberId = null): void
    {
        if ($officeId === null) return;

        self::fanOut(
            'member',
            Member::query()->where('office_id', $officeId)
                ->when($exceptMemberId, fn ($query) => $query->where('id', '!=', $exceptMemberId))
                ->pluck('id'),
            $type, $title, $message, $url
        );
    }

    public static function members(iterable $memberIds, string $type, string $title, ?string $message, string $url, ?int $exceptMemberId = null): void
    {
        $wanted = collect($memberIds)
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->reject(fn ($id) => $id === (int) $exceptMemberId);

        if ($wanted->isEmpty()) return;

        /*
         * Filtered against the register in one query rather than one per id.
         * Callers hand this list in from elsewhere -- a meeting's attendance,
         * say -- so an id for a member who has since been deleted is a normal
         * thing to receive, not a bug to let through into a row nobody can read.
         */
        self::fanOut(
            'member',
            Member::query()->whereIn('id', $wanted)->pluck('id'),
            $type, $title, $message, $url
        );
    }

    /**
     * @param  Collection<int, int>  $recipientIds  known to exist
     */
    private static function fanOut(string $recipientType, Collection $recipientIds, string $type, string $title, ?string $message, string $url): void
    {
        if ($recipientIds->isEmpty()) return;

        // Read before the insert so the new rows can be found again by id
        // without re-querying on a timestamp, which two fan-outs in the same
        // second would both match.
        $highWaterMark = (int) ActivityNotification::query()->max('id');

        $now = now();

        $rows = $recipientIds->map(fn ($id) => [
            'recipient_type' => $recipientType,
            'recipient_id'   => $id,
            'type'           => $type,
            'title'          => $title,
            'message'        => $message,
            'url'            => $url,
            'read_at'        => null,
            'created_at'     => $now,
            'updated_at'     => $now,
        ])->all();

        foreach (array_chunk($rows, self::CHUNK) as $chunk) {
            ActivityNotification::insert($chunk);
        }

        self::push($recipientType, $recipientIds, $highWaterMark);
    }

    /**
     * Queues a push for the recipients who actually have a device registered.
     *
     * PushService already returns immediately for a recipient with no
     * subscription, so dispatching for everyone was correct -- and meant five
     * hundred jobs to discover that four hundred and ninety of them had nothing
     * to deliver. Asking the subscriptions table once is the same outcome.
     */
    private static function push(string $recipientType, Collection $recipientIds, int $highWaterMark): void
    {
        $subscribed = PushSubscription::query()
            ->where('recipient_type', $recipientType)
            ->whereIn('recipient_id', $recipientIds)
            ->distinct()
            ->pluck('recipient_id');

        if ($subscribed->isEmpty()) return;

        ActivityNotification::query()
            ->where('id', '>', $highWaterMark)
            ->where('recipient_type', $recipientType)
            ->whereIn('recipient_id', $subscribed)
            ->get()
            ->each(fn (ActivityNotification $notification) => SendPushNotification::dispatch($notification));
    }
}
