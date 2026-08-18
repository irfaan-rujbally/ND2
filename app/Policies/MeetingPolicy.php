<?php

namespace App\Policies;

use App\Models\Meeting;
use App\Models\User;
use App\Policies\Concerns\ScopesToOffice;

class MeetingPolicy
{
    use ScopesToOffice;

    public function viewAny(User $user): bool
    {
        return $this->isAdmin($user);
    }

    public function view(User $user, Meeting $meeting): bool
    {
        return $this->canTouch($user, $meeting);
    }

    public function create(User $user): bool
    {
        return $this->isAdmin($user);
    }

    public function replicate(User $user, Meeting $meeting): bool
    {
        return $this->canTouch($user, $meeting);
    }

    public function update(User $user, Meeting $meeting): bool
    {
        return $this->canTouch($user, $meeting);
    }

    public function delete(User $user, Meeting $meeting): bool
    {
        return $this->canTouch($user, $meeting);
    }

    public function restore(User $user, Meeting $meeting): bool
    {
        return $this->canTouch($user, $meeting);
    }

    public function forceDelete(User $user, Meeting $meeting): bool
    {
        return $this->canTouch($user, $meeting);
    }

    public function attachMember(User $user, Meeting $meeting, $member): bool
    {
        return $this->canTouch($user, $meeting) && $this->sharesOffice($user, $member);
    }

    public function detachMember(User $user, Meeting $meeting, $member): bool
    {
        return $this->attachMember($user, $meeting, $member);
    }
}
