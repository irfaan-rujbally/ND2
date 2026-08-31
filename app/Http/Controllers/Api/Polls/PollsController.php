<?php

namespace App\Http\Controllers\Api\Polls;

use App\Http\Controllers\Controller;
use App\Models\Poll;
use App\Support\ActivityNotifier;
use App\Support\PollPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/**
 * Polls from the office's side: write one, watch the answers arrive, and read
 * the result.
 *
 * Not a lomkit/laravel-rest-api resource, for the reason the forum is not one
 * either: what these endpoints return is not the shape of a table. A poll comes
 * back with its options, its tallies and its turnout, and creating one writes a
 * poll plus up to ten option rows in a single transaction -- neither of which a
 * resource mutation expresses without fighting it.
 *
 * Every response goes through PollPresenter, which has no way to pair a member
 * with the option they chose. That is the whole of the ballot's confidentiality:
 * not a field somebody remembered to leave out, but a shape that cannot carry it.
 */
class PollsController extends Controller
{
    private const PER_PAGE = 20;

    public function index(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', Poll::class);

        $request->validate([
            'status' => ['nullable', 'in:all,open,closed'],
            'page'   => ['nullable', 'integer', 'min:1'],
        ]);

        $status = $request->input('status', 'all');

        $polls = Poll::query()
            ->where('office_id', $request->user()->office_id)
            ->when($status === 'open', fn ($query) => $query->open())
            // "closed" means "no longer taking votes", so a poll that ran past
            // its deadline belongs in it as much as one somebody shut by hand.
            ->when($status === 'closed', fn ($query) => $query->whereNot(fn ($inner) => $inner->open()))
            ->with(['options', 'author'])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(self::PER_PAGE);

        return response()->json([
            'data' => collect($polls->items())
                ->map(fn (Poll $poll) => PollPresenter::withResults($poll))
                ->all(),
            'meta' => [
                'current_page' => $polls->currentPage(),
                'last_page'    => $polls->lastPage(),
                'total'        => $polls->total(),
            ],
        ]);
    }

    public function show(Poll $poll): JsonResponse
    {
        Gate::authorize('view', $poll);

        $poll->load(['options', 'author']);

        return response()->json(['data' => PollPresenter::withResults($poll)]);
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', Poll::class);

        $data = $request->validate(self::rules());

        $poll = DB::transaction(function () use ($data, $request) {
            $poll = Poll::create([
                'office_id'       => $request->user()->office_id,
                'title'           => $data['title'],
                'description'     => $data['description'] ?? null,
                'allows_multiple' => (bool) ($data['allows_multiple'] ?? false),
                'closes_at'       => $data['closes_at'] ?? null,
            ]);

            self::writeOptions($poll, $data['options']);

            return $poll;
        });

        /*
         * Announced after the transaction, not from a `created` model event the
         * way Announcement does it. A poll is not usable until its options
         * exist, and on QUEUE_CONNECTION=sync a push fired from inside the
         * transaction would reach members before a single option row was
         * written -- they would tap through to an empty ballot.
         */
        ActivityNotifier::officeMembers(
            $poll->office_id,
            'new_poll',
            'New poll',
            $poll->title,
            '/my/polls'
        );

        return response()->json(
            ['data' => PollPresenter::withResults($poll->load(['options', 'author']))],
            201
        );
    }

    /**
     * Editing the wording, the deadline, and the answers.
     *
     * Rewriting the options replaces the rows, and the votes cast against them
     * go with them -- so it is refused once anybody has answered. An office that
     * wants a different ballot after the fact asks a new question rather than
     * silently rewriting the one people already answered.
     */
    public function update(Request $request, Poll $poll): JsonResponse
    {
        Gate::authorize('update', $poll);

        $rules = self::rules();
        $rules['options'] = ['sometimes', 'array', 'min:'.Poll::MIN_OPTIONS, 'max:'.Poll::MAX_OPTIONS];
        // allows_multiple is fixed at creation: see the polls migration.
        unset($rules['allows_multiple']);

        $data = $request->validate($rules);

        if (array_key_exists('options', $data) && $poll->votes()->exists()) {
            return response()->json([
                'message' => 'The answers cannot be changed once members have voted.',
            ], 422);
        }

        DB::transaction(function () use ($data, $poll) {
            $poll->update([
                'title'       => $data['title'],
                'description' => $data['description'] ?? null,
                'closes_at'   => $data['closes_at'] ?? null,
            ]);

            if (array_key_exists('options', $data)) {
                $poll->options()->delete();
                self::writeOptions($poll, $data['options']);
            }
        });

        return response()->json([
            'data' => PollPresenter::withResults($poll->fresh()->load(['options', 'author'])),
        ]);
    }

    /** Soft delete, so a poll pulled by mistake is still on the record. */
    public function destroy(Poll $poll): JsonResponse
    {
        Gate::authorize('delete', $poll);

        $poll->delete();

        return response()->json(null, 204);
    }

    /** @return array<string, array<int, string>> */
    private static function rules(): array
    {
        return [
            'title'           => ['required', 'string', 'max:150'],
            'description'     => ['nullable', 'string', 'max:5000'],
            'allows_multiple' => ['nullable', 'boolean'],
            // The optional deadline. `after:now` keeps an office from publishing
            // a poll that is already shut.
            'closes_at'       => ['nullable', 'date', 'after:now'],
            'options'         => ['required', 'array', 'min:'.Poll::MIN_OPTIONS, 'max:'.Poll::MAX_OPTIONS],
            'options.*'       => ['required', 'string', 'max:255'],
        ];
    }

    /** @param  array<int, string>  $labels */
    private static function writeOptions(Poll $poll, array $labels): void
    {
        // Position is the array index, so the ballot reads back in the order the
        // office typed it however the rows are later fetched.
        foreach (array_values($labels) as $position => $label) {
            $poll->options()->create(['label' => $label, 'position' => $position]);
        }
    }
}
