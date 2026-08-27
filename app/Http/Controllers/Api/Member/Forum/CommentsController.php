<?php

namespace App\Http\Controllers\Api\Member\Forum;

use App\Http\Controllers\Controller;
use App\Models\ForumComment;
use App\Models\ForumTopic;
use App\Models\Member;
use App\Support\ForumPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Support\ActivityNotifier;

/**
 * Replies on a forum topic: post one, and edit or delete your own.
 *
 * Comments are only ever read through TopicsController::show, so there is no
 * index here -- a comment out of its thread has no meaning.
 */
class CommentsController extends Controller
{
    public function store(Request $request, ForumTopic $topic): JsonResponse
    {
        /** @var Member $member */
        $member = $request->user();

        $this->assertTopicOpen($topic, $member);

        $data = $request->validate($this->rules());

        // Capture existing participants before inserting this reply. A member
        // participates by having previously replied, not merely by viewing.
        $participantIds = $topic->comments()
            ->where('author_type', Member::class)
            ->pluck('author_id');

        // The author is stamped from the session by the model.
        $comment = $topic->comments()->create([
            'body'       => $data['body'],
            'image_path' => $data['image_path'] ?? null,
        ]);
        ActivityNotifier::staff($topic->office_id, 'forum_member_reply', 'Member replied on the forum', $topic->title, "/forum/{$topic->id}");
        ActivityNotifier::members($participantIds, 'forum_participant_reply', 'New reply in a forum you are participating in', $topic->title, "/my/forum/{$topic->id}", $member->id);

        $comment->load('author');

        return response()->json(['data' => ForumPresenter::comment($comment, $member)], 201);
    }

    public function update(Request $request, ForumComment $comment): JsonResponse
    {
        /** @var Member $member */
        $member = $request->user();

        $this->assertOwn($comment, $member);

        $data = $request->validate($this->rules());

        $comment->update([
            'body' => $data['body'],
            // Present but null clears the image; absent leaves it as it was.
            'image_path' => $request->exists('image_path')
                ? ($data['image_path'] ?? null)
                : $comment->image_path,
        ]);

        $comment->load('author');

        return response()->json(['data' => ForumPresenter::comment($comment, $member)]);
    }

    public function destroy(Request $request, ForumComment $comment): JsonResponse
    {
        /** @var Member $member */
        $member = $request->user();

        $this->assertOwn($comment, $member);

        /*
         * Soft deleted, not moderated. The author removed it themselves, so there
         * is nobody to tell and the thread simply closes over the gap. The
         * model's `deleted` hook re-stamps the topic's last_activity_at so a
         * thread does not stay at the top of the list on the strength of a
         * comment that is no longer there.
         */
        $comment->delete();

        return response()->json(null, 204);
    }

    // ------------------------------------------------------------------ guards

    /** The topic exists, is in the member's office, and still accepts replies. */
    private function assertTopicOpen(ForumTopic $topic, Member $member): void
    {
        abort_unless(
            $member->office_id !== null && (int) $topic->office_id === (int) $member->office_id,
            404
        );

        abort_if(
            $topic->isModerated(),
            403,
            'This topic was removed by an administrator and is closed to new comments.'
        );
    }

    /**
     * Theirs, in their office, and not already removed by an administrator.
     *
     * A moderated comment answers 403 with a reason rather than 404: the member
     * wrote it, so pretending it does not exist would only be confusing.
     */
    private function assertOwn(ForumComment $comment, Member $member): void
    {
        $topic = $comment->topic;

        abort_if($topic === null, 404);
        abort_unless(
            $member->office_id !== null && (int) $topic->office_id === (int) $member->office_id,
            404
        );

        abort_unless($comment->isWrittenBy($member), 403, 'You can only change your own comments.');

        abort_if(
            $comment->isModerated(),
            403,
            'This comment was removed by an administrator and can no longer be edited.'
        );
    }

    private function rules(): array
    {
        return [
            'body'       => ['required', 'string', 'max:5000'],
            'image_path' => ['nullable', 'string', 'max:255'],
        ];
    }
}
