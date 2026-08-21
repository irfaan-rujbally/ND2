<?php

namespace App\Support;

use App\Models\ForumComment;
use App\Models\ForumTopic;
use App\Models\Member;

/**
 * Turns forum records into the shape the API returns.
 *
 * One class rather than mapping in each controller, because the member portal
 * and the staff moderation screen must not drift on the one rule that matters:
 * what a moderated post shows. Members get a tombstone with the content stripped;
 * administrators keep seeing the content, because a moderation decision nobody
 * can review afterwards is not a decision, it is a disappearance.
 *
 * The content is never scrubbed from the database -- hiding happens here, at the
 * boundary.
 */
class ForumPresenter
{
    /**
     * @param  ForumTopic  $topic  with `author` loaded, and `comments_count` when listing
     * @param  Member|null  $viewer  the signed-in member, or null for a staff caller
     * @param  bool  $forStaff  true to keep moderated content visible
     */
    public static function topic(ForumTopic $topic, ?Member $viewer, bool $forStaff = false): array
    {
        $hide = $topic->isModerated() && ! $forStaff;

        return [
            'id'    => $topic->id,
            // Nulled rather than replaced with placeholder text: the client owns
            // the wording of the tombstone, and a title can itself be the thing
            // that had to be removed.
            'title'       => $hide ? null : $topic->title,
            'description' => $hide ? null : $topic->description,
            'image_url'   => $hide ? null : $topic->imageUrl(),

            'author_name' => $topic->authorName(),
            'by_office'   => $topic->isByOffice(),
            'is_mine'     => $viewer !== null && $topic->isWrittenBy($viewer),

            'comments_count' => (int) ($topic->comments_count ?? 0),

            'created_at'       => $topic->created_at?->toIso8601String(),
            'last_activity_at' => $topic->last_activity_at?->toIso8601String(),

            'moderated'    => $topic->isModerated(),
            'moderated_at' => $topic->moderated_at?->toIso8601String(),
        ];
    }

    public static function comment(ForumComment $comment, ?Member $viewer, bool $forStaff = false): array
    {
        $hide = $comment->isModerated() && ! $forStaff;

        return [
            'id'        => $comment->id,
            'body'      => $hide ? null : $comment->body,
            'image_url' => $hide ? null : $comment->imageUrl(),

            'author_name' => $comment->authorName(),
            'by_office'   => $comment->isByOffice(),
            'is_mine'     => $viewer !== null && $comment->isWrittenBy($viewer),

            'created_at' => $comment->created_at?->toIso8601String(),
            /*
             * Whether it has been changed since it was posted. Compared with a
             * second of tolerance because created_at and updated_at are written
             * in the same statement on insert and can land either side of a tick.
             */
            'edited' => $comment->updated_at !== null
                && $comment->created_at !== null
                && $comment->updated_at->diffInSeconds($comment->created_at) > 1,

            'moderated'    => $comment->isModerated(),
            'moderated_at' => $comment->moderated_at?->toIso8601String(),
        ];
    }
}
