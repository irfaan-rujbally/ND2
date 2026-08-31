<?php

namespace App\Policies;

use App\Models\Poll;
use App\Models\User;
use App\Policies\Concerns\ScopesToOffice;

/**
 * Same shape as AnnouncementPolicy: admin only, and only within the user's own
 * office.
 *
 * These polls are reached through plain controllers rather than a Rest resource,
 * so nothing calls these methods for us -- every action authorises explicitly.
 */
class PollPolicy
{
    use ScopesToOffice;

    public function viewAny(User $user): bool
    {
        return $this->isAdmin($user);
    }

    public function view(User $user, Poll $poll): bool
    {
        return $this->canTouch($user, $poll);
    }

    public function create(User $user): bool
    {
        return $this->isAdmin($user);
    }

    public function update(User $user, Poll $poll): bool
    {
        return $this->canTouch($user, $poll);
    }

    public function delete(User $user, Poll $poll): bool
    {
        return $this->canTouch($user, $poll);
    }

    /**
     * Closing it, and reopening it.
     *
     * Its own ability rather than part of `update`, for the reason
     * AnnouncementPolicy::send is separate: closing is the half of this feature
     * that changes what members can still do, and keeping it apart leaves room
     * for a role that may draft a poll without being able to end one.
     */
    public function close(User $user, Poll $poll): bool
    {
        return $this->canTouch($user, $poll);
    }

    /**
     * Who has answered and who has not.
     *
     * Deliberately not "who voted for what" -- no ability grants that, because
     * no endpoint returns it. See PollTally.
     */
    public function viewParticipation(User $user, Poll $poll): bool
    {
        return $this->canTouch($user, $poll);
    }
}
