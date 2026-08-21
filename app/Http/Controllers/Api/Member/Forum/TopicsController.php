<?php

namespace App\Http\Controllers\Api\Member\Forum;

use App\Http\Controllers\Controller;
use App\Models\ForumTopic;
use App\Models\Member;
use App\Support\ForumPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The forum, from a member's side: read the topics of their own office, start
 * one, and edit or delete their own.
 *
 * Authorisation is explicit here rather than in a policy. Policies in this app
 * take a User; members hold no role and no permission, so every member endpoint
 * proves the record is theirs by looking at it -- see `ownTopic()`.
 *
 * Moderated topics stay in the list. That is the point: a member whose topic an
 * administrator removed has to be able to see that it happened, so the row comes
 * back with its content stripped and `moderated: true` rather than vanishing.
 */
class TopicsController extends Controller
{
    private const PER_PAGE = 15;

    public function index(Request $request): JsonResponse
    {
        /** @var Member $member */
        $member = $request->user();

        $request->validate([
            // "My topics" is the same list with an author filter.
            'mine'   => ['nullable', 'boolean'],
            'search' => ['nullable', 'string', 'max:150'],
            'page'   => ['nullable', 'integer', 'min:1'],
        ]);

        $topics = ForumTopic::query()
            ->forOffice($member->office_id)
            ->when($request->boolean('mine'), fn ($q) => $q->writtenByMember($member->id))
            /*
             * Server side because the list is paginated: filtering the fifteen
             * rows already on screen would silently miss every match on page two.
             *
             * Title and body only. Searching the author's name would let a member
             * comb the register for who has posted about what, which is not what
             * a forum search is for.
             */
            ->when($request->filled('search'), function ($query) use ($request) {
                $term = '%'.$request->input('search').'%';

                /*
                 * Moderated topics are excluded from matches, not just from the
                 * output. Their text is stripped by the presenter, so a hit would
                 * render as a tombstone with no visible reason -- and a member
                 * could then probe the removed wording by watching which search
                 * terms make that tombstone appear. They still show in an
                 * unfiltered list, which is how their author learns of the removal.
                 */
                $query->notModerated()
                    ->where(fn ($q) => $q->where('title', 'like', $term)
                        ->orWhere('description', 'like', $term));
            })
            ->with('author')
            ->withCount(['comments' => fn ($q) => $q->whereNull('moderated_at')])
            ->recentFirst()
            ->paginate(self::PER_PAGE);

        return response()->json([
            'data' => collect($topics->items())
                ->map(fn (ForumTopic $topic) => ForumPresenter::topic($topic, $member))
                ->all(),
            'meta' => [
                'current_page' => $topics->currentPage(),
                'last_page'    => $topics->lastPage(),
                'total'        => $topics->total(),
                // So "My topics" can show a count without a second request.
                'mine_total' => ForumTopic::query()
                    ->forOffice($member->office_id)
                    ->writtenByMember($member->id)
                    ->count(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        /** @var Member $member */
        $member = $request->user();

        abort_if($member->office_id === null, 403, 'Your membership is not attached to an office yet.');

        $data = $request->validate($this->rules());

        // author_type / author_id are stamped from the session by the model, and
        // office_id comes from the member -- never from the request.
        $topic = ForumTopic::create([
            'office_id'   => $member->office_id,
            'title'       => $data['title'],
            'description' => $data['description'] ?? null,
            'image_path'  => $data['image_path'] ?? null,
        ]);

        $topic->load('author')->loadCount('comments');

        return response()->json(['data' => ForumPresenter::topic($topic, $member)], 201);
    }

    public function show(Request $request, ForumTopic $topic): JsonResponse
    {
        /** @var Member $member */
        $member = $request->user();

        $this->assertVisible($topic, $member);

        $topic->load('author')->loadCount(['comments' => fn ($q) => $q->whereNull('moderated_at')]);

        /*
         * Moderated comments are included, stripped of their content, for the
         * same reason moderated topics are: the gap in the conversation is
         * explained instead of being a silent hole. Oldest first -- a thread
         * reads in the order it was written.
         */
        $comments = $topic->comments()
            ->with('author')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => ForumPresenter::topic($topic, $member),
            'comments' => $comments
                ->map(fn ($comment) => ForumPresenter::comment($comment, $member))
                ->values()
                ->all(),
        ]);
    }

    public function update(Request $request, ForumTopic $topic): JsonResponse
    {
        /** @var Member $member */
        $member = $request->user();

        $this->assertOwn($topic, $member);

        $data = $request->validate($this->rules());

        $topic->update([
            'title'       => $data['title'],
            'description' => $data['description'] ?? null,
            // Present but null clears the image; absent leaves it alone.
            'image_path' => $request->exists('image_path') ? ($data['image_path'] ?? null) : $topic->image_path,
        ]);

        $topic->load('author')->loadCount('comments');

        return response()->json(['data' => ForumPresenter::topic($topic, $member)]);
    }

    public function destroy(Request $request, ForumTopic $topic): JsonResponse
    {
        /** @var Member $member */
        $member = $request->user();

        $this->assertOwn($topic, $member);

        /*
         * A plain soft delete, not moderation: the author knows perfectly well
         * they removed it, so there is nobody to inform and no tombstone to
         * leave. The comments go with it -- they are only reachable through the
         * topic, and the relation is filtered by it.
         */
        $topic->delete();

        return response()->json(null, 204);
    }

    // ------------------------------------------------------------------ guards

    /** Readable: in the member's own office. */
    private function assertVisible(ForumTopic $topic, Member $member): void
    {
        abort_unless(
            $member->office_id !== null && (int) $topic->office_id === (int) $member->office_id,
            404
        );
    }

    /**
     * Writable: theirs, and not already removed by an administrator.
     *
     * 404 rather than 403 for another office's topic, so the forum cannot be
     * enumerated by watching which ids answer differently. A moderated topic
     * answers 403 with a reason, because the member does know it exists -- they
     * wrote it.
     */
    private function assertOwn(ForumTopic $topic, Member $member): void
    {
        $this->assertVisible($topic, $member);

        abort_unless($topic->isWrittenBy($member), 403, 'You can only change your own topics.');

        abort_if(
            $topic->isModerated(),
            403,
            'This topic was removed by an administrator and can no longer be edited.'
        );
    }

    private function rules(): array
    {
        return [
            'title'       => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:5000'],
            // A path produced by the forum image upload endpoint, not a file.
            'image_path' => ['nullable', 'string', 'max:255'],
        ];
    }
}
