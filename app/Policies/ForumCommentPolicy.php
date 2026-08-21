<?php

namespace App\Policies;

use App\Models\ForumComment;
use App\Models\User;
use App\Policies\Concerns\ScopesToOffice;

/**
 * As ForumTopicPolicy, but a comment carries no office_id of its own -- it
 * belongs to a topic and inherits that topic's office. So the office check runs
 * against the parent, and a comment whose topic has gone is reachable by nobody.
 */
class ForumCommentPolicy
{
    use ScopesToOffice;

    public function view(User $user, ForumComment $comment): bool
    {
        return $this->sharesTopicOffice($user, $comment);
    }

    /** Replying as the office. */
    public function create(User $user): bool
    {
        return $this->isAdmin($user);
    }

    public function moderate(User $user, ForumComment $comment): bool
    {
        return $this->sharesTopicOffice($user, $comment);
    }

    private function sharesTopicOffice(User $user, ForumComment $comment): bool
    {
        $topic = $comment->topic;

        return $topic !== null && $this->canTouch($user, $topic);
    }
}
