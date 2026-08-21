<?php

namespace App\Http\Controllers\Api\Member;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\Member;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The announcements a member may read, newest first.
 *
 * Read-only, and deliberately not the staff resource: this returns the notice
 * itself and nothing about the send -- no recipient list, no addresses, no counts.
 * A member has no business knowing who else was emailed.
 *
 * Scope is the member's own office, so a member never sees another office's
 * notices. That is *not* the same as "announcements I was emailed": only 93 of
 * the 505 members have an email address at all, so keying the portal off
 * announcement_recipients would leave four members in five with a permanently
 * empty page. The portal is how the other four hundred read them.
 *
 * A member with no office recorded therefore sees nothing rather than everything.
 * That is the safe direction to fail -- the alternative leaks one office's notices
 * to another's members -- and no member is currently in that state, since
 * default_members_to_the_first_office back-filled them all.
 */
class AnnouncementsController extends Controller
{
    /**
     * The feed is capped rather than paginated: a member portal is a page you
     * scroll, not one you page through. `meta.total` is returned so the UI can
     * say plainly when there is more than it is showing, instead of silently
     * cutting the list off.
     */
    private const LIMIT = 50;

    public function __invoke(Request $request): JsonResponse
    {
        /** @var Member $member */
        $member = $request->user();

        if ($member->office_id === null) {
            return response()->json([
                'data' => [],
                'meta' => ['total' => 0, 'limit' => self::LIMIT],
            ]);
        }

        $query = Announcement::query()->where('office_id', $member->office_id);

        $total = $query->count();

        $announcements = $query
            // created_at, not updated_at: "latest" means when it was published,
            // and fixing a typo should not jump an old notice to the top.
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(self::LIMIT)
            ->get();

        return response()->json([
            'data' => $announcements->map(fn (Announcement $announcement) => [
                'id'          => $announcement->id,
                'title'       => $announcement->title,
                'description' => $announcement->description,
                // Absolute, and public by token -- the same URL the email uses.
                'image_url'   => $announcement->imageUrl(),
                'created_at'  => $announcement->created_at?->toIso8601String(),
            ])->values()->all(),
            'meta' => [
                'total' => $total,
                'limit' => self::LIMIT,
            ],
        ]);
    }
}
