<?php

namespace App\Rest\Actions;

use App\Jobs\SendAnnouncementEmail;
use App\Models\Announcement;
use App\Models\AnnouncementRecipient;
use App\Models\Member;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Gate;
use Lomkit\Rest\Actions\Action as RestAction;
use Lomkit\Rest\Http\Requests\RestRequest;

/**
 * Emails an announcement to the members whose ids the screen sends.
 *
 * An action rather than a controller endpoint, matching how attendance is
 * handled: it needs the policy check and the office scoping that the resource
 * already provides.
 *
 * Idempotent. A member who has already received this announcement is skipped
 * rather than mailed twice, which is what makes "send again after fixing two bad
 * addresses" safe. The unique index on announcement_recipients is what enforces
 * that even if two administrators press send at the same moment.
 *
 * Members with no email address are silently ignored here as well as filtered out
 * in the UI -- the list on screen can be seconds out of date, and a null address
 * must not become a validation error that abandons the other recipients.
 */
class SendAnnouncementToMembersAction extends RestAction
{
    public function fields(RestRequest $request): array
    {
        return [
            'member_ids'   => ['required', 'array', 'min:1'],
            'member_ids.*' => ['integer'],
        ];
    }

    /**
     * $fields arrives keyed by field name: the package maps the client's
     * {name, value} pairs before calling handle().
     */
    public function handle(array $fields, Collection $models)
    {
        $ids = collect($fields['member_ids'] ?? [])
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->all();

        $queued = 0;
        $skipped = 0;

        foreach ($models as $announcement) {
            Gate::authorize('send', $announcement);

            foreach ($this->recipientsFor($announcement, $ids) as $member) {
                if ($this->queue($announcement, $member)) {
                    $queued++;
                } else {
                    $skipped++;
                }
            }
        }

        return ['queued' => $queued, 'skipped' => $skipped];
    }

    /**
     * The members that may actually be mailed: in the announcement's own office,
     * among those asked for, and holding an address to send to.
     *
     * Scoped on office_id independently of the request. The ids come from the
     * browser, so trusting them would let an administrator of one office mail the
     * members of another.
     */
    protected function recipientsFor(Announcement $announcement, array $ids): Collection
    {
        if ($ids === []) {
            return collect();
        }

        return Member::query()
            ->where('office_id', $announcement->office_id)
            ->whereIn('id', $ids)
            ->whereNotNull('email')
            ->where('email', '!=', '')
            ->get();
    }

    /**
     * Records the intent to mail this member and queues the job.
     *
     * Returns false when there is nothing to do because the member already has
     * the announcement.
     */
    protected function queue(Announcement $announcement, Member $member): bool
    {
        $recipient = AnnouncementRecipient::firstOrNew([
            'announcement_id' => $announcement->id,
            'member_id'       => $member->id,
        ]);

        if ($recipient->exists && $recipient->wasDelivered()) {
            return false;
        }

        // Refreshed on a re-send: the address may have been corrected since the
        // attempt that failed, which is usually the whole point of re-sending.
        $recipient->email = $member->email;
        $recipient->error = null;
        $recipient->save();

        SendAnnouncementEmail::dispatch($recipient);

        return true;
    }
}
