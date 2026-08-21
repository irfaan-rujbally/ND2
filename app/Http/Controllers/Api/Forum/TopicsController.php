<?php

namespace App\Http\Controllers\Api\Forum;

use App\Http\Controllers\Controller;
use App\Models\ForumComment;
use App\Models\ForumTopic;
use App\Support\ForumPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * The forum from the office's side: watch it, moderate it, and post in it as the
 * party.
 *
 * Not a lomkit/laravel-rest-api resource, for the same reason
 * AnnouncementRecipientsController is not: what the screen needs is not the shape
 * of a table. A topic here comes back with its comment counts, its author, and --
 * unlike the member portal -- the content of anything that has been moderated,
 * because a decision that cannot be reviewed afterwards is not a decision.
 *
 * Moderation is a state, not a deletion. `moderate` hides a post from members and
 * leaves them a tombstone saying an administrator removed it; `unmoderate` puts it
 * back. Nothing here erases anyone's words.
 */
class TopicsController extends Controller
{
    private const PER_PAGE = 15;

    public function index(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', ForumTopic::class);

        $request->validate([
            'search' => ['nullable', 'string', 'max:150'],
            // 'moderated' narrows to what has already been removed, which is how
            // an administrator reviews their own past decisions.
            'filter' => ['nullable', 'in:all,moderated,active'],
            'page'   => ['nullable', 'integer', 'min:1'],
        ]);

        $officeId = $request->user()->office_id;
        $filter = $request->input('filter', 'all');

        $topics = ForumTopic::query()
            ->forOffice($officeId)
            ->when($request->filled('search'), function ($query) use ($request) {
                $term = '%'.$request->input('search').'%';
                $query->where(fn ($q) => $q->where('title', 'like', $term)
                    ->orWhere('description', 'like', $term));
            })
            ->when($filter === 'moderated', fn ($q) => $q->moderated())
            ->when($filter === 'active', fn ($q) => $q->notModerated())
            ->with('author')
            // Counted without the moderated-comment exclusion the portal applies:
            // the office wants to know what is actually in the thread.
            ->withCount('comments')
            ->recentFirst()
            ->paginate(self::PER_PAGE);

        return response()->json([
            'data' => collect($topics->items())
                ->map(fn (ForumTopic $topic) => ForumPresenter::topic($topic, null, forStaff: true))
                ->all(),
            'meta' => [
                'current_page' => $topics->currentPage(),
                'last_page'    => $topics->lastPage(),
                'total'        => $topics->total(),
                'moderated_total' => ForumTopic::query()
                    ->forOffice($officeId)
                    ->moderated()
                    ->count(),
            ],
        ]);
    }

    public function show(ForumTopic $topic): JsonResponse
    {
        Gate::authorize('view', $topic);

        $topic->load('author')->loadCount('comments');

        $comments = $topic->comments()
            ->with('author')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => ForumPresenter::topic($topic, null, forStaff: true),
            'comments' => $comments
                ->map(fn (ForumComment $comment) => ForumPresenter::comment($comment, null, forStaff: true))
                ->values()
                ->all(),
        ]);
    }

    /**
     * Starts a topic as the office.
     *
     * The author is stamped from the session by the model, which records a User
     * rather than a Member -- so the thread attributes it to "Nouveaux
     * Démocrates" rather than naming whoever typed it. See
     * BelongsToForumAuthor::authorName.
     */
    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', ForumTopic::class);

        $data = $request->validate([
            'title'       => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:5000'],
            'image_path'  => ['nullable', 'string', 'max:255'],
        ]);

        $topic = ForumTopic::create([
            'office_id'   => $request->user()->office_id,
            'title'       => $data['title'],
            'description' => $data['description'] ?? null,
            'image_path'  => $data['image_path'] ?? null,
        ]);

        $topic->load('author')->loadCount('comments');

        return response()->json(
            ['data' => ForumPresenter::topic($topic, null, forStaff: true)],
            201
        );
    }

    /** Replies as the office. */
    public function comment(Request $request, ForumTopic $topic): JsonResponse
    {
        Gate::authorize('view', $topic);
        Gate::authorize('create', ForumComment::class);

        $data = $request->validate([
            'body'       => ['required', 'string', 'max:5000'],
            'image_path' => ['nullable', 'string', 'max:255'],
        ]);

        $comment = $topic->comments()->create([
            'body'       => $data['body'],
            'image_path' => $data['image_path'] ?? null,
        ]);

        $comment->load('author');

        return response()->json(
            ['data' => ForumPresenter::comment($comment, null, forStaff: true)],
            201
        );
    }

    // ------------------------------------------------------------- moderation

    public function moderate(Request $request, ForumTopic $topic): JsonResponse
    {
        Gate::authorize('moderate', $topic);

        $topic->moderate($request->user());

        $topic->load('author')->loadCount('comments');

        return response()->json(['data' => ForumPresenter::topic($topic, null, forStaff: true)]);
    }

    public function restore(ForumTopic $topic): JsonResponse
    {
        Gate::authorize('moderate', $topic);

        $topic->unmoderate();

        $topic->load('author')->loadCount('comments');

        return response()->json(['data' => ForumPresenter::topic($topic, null, forStaff: true)]);
    }

    public function moderateComment(Request $request, ForumComment $comment): JsonResponse
    {
        Gate::authorize('moderate', $comment);

        $comment->moderate($request->user());

        $comment->load('author');

        return response()->json(['data' => ForumPresenter::comment($comment, null, forStaff: true)]);
    }

    public function restoreComment(ForumComment $comment): JsonResponse
    {
        Gate::authorize('moderate', $comment);

        $comment->unmoderate();

        $comment->load('author');

        return response()->json(['data' => ForumPresenter::comment($comment, null, forStaff: true)]);
    }
}
