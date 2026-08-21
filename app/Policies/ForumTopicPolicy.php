<?php

namespace App\Policies;

use App\Models\ForumTopic;
use App\Models\User;
use App\Policies\Concerns\ScopesToOffice;

/**
 * The staff side of the forum. Members are not authorised here at all: they hold
 * no role, and their own permissions are checked directly in the member portal
 * controllers, which only ever look at records they wrote.
 *
 * Note what is missing: `update` and `delete`. An administrator does not edit a
 * member's words, and does not make them disappear -- they moderate, which leaves
 * the row in place and tells the author. That is `moderate` below.
 */
class ForumTopicPolicy
{
    use ScopesToOffice;

    public function viewAny(User $user): bool
    {
        return $this->isAdmin($user);
    }

    public function view(User $user, ForumTopic $topic): bool
    {
        return $this->canTouch($user, $topic);
    }

    /** Starting a topic as the office. */
    public function create(User $user): bool
    {
        return $this->isAdmin($user);
    }

    /** Removing a topic from view, leaving a tombstone for its author. */
    public function moderate(User $user, ForumTopic $topic): bool
    {
        return $this->canTouch($user, $topic);
    }
}
