<?php

namespace App\Policies;

use App\Models\Announcement;
use App\Models\User;
use App\Policies\Concerns\ScopesToOffice;

/**
 * Same shape as MeetingPolicy: admin only, and only within the user's own
 * office. lomkit/laravel-rest-api refuses to expose a model with no policy, so
 * every method the resource can reach has to be answered here.
 */
class AnnouncementPolicy
{
    use ScopesToOffice;

    public function viewAny(User $user): bool
    {
        return $this->isAdmin($user);
    }

    public function view(User $user, Announcement $announcement): bool
    {
        return $this->canTouch($user, $announcement);
    }

    public function create(User $user): bool
    {
        return $this->isAdmin($user);
    }

    public function replicate(User $user, Announcement $announcement): bool
    {
        return $this->canTouch($user, $announcement);
    }

    public function update(User $user, Announcement $announcement): bool
    {
        return $this->canTouch($user, $announcement);
    }

    public function delete(User $user, Announcement $announcement): bool
    {
        return $this->canTouch($user, $announcement);
    }

    public function restore(User $user, Announcement $announcement): bool
    {
        return $this->canTouch($user, $announcement);
    }

    public function forceDelete(User $user, Announcement $announcement): bool
    {
        return $this->canTouch($user, $announcement);
    }

    /**
     * Emailing it out.
     *
     * Separate from `update` on purpose: sending is the irreversible half of
     * this feature, and keeping it its own ability means a future "editor" role
     * can be allowed to draft without being allowed to broadcast.
     */
    public function send(User $user, Announcement $announcement): bool
    {
        return $this->canTouch($user, $announcement);
    }
}
