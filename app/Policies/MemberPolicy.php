<?php

namespace App\Policies;

use App\Models\Member;
use App\Models\User;
use App\Policies\Concerns\ScopesToOffice;

class MemberPolicy
{
    use ScopesToOffice;

    public function viewAny(User $user): bool
    {
        return $this->isAdmin($user);
    }

    public function view(User $user, Member $member): bool
    {
        return $this->canTouch($user, $member);
    }

    public function create(User $user): bool
    {
        return $this->isAdmin($user);
    }

    public function replicate(User $user, Member $member): bool
    {
        return $this->canTouch($user, $member);
    }

    public function update(User $user, Member $member): bool
    {
        return $this->canTouch($user, $member);
    }

    public function delete(User $user, Member $member): bool
    {
        return $this->canTouch($user, $member);
    }

    public function restore(User $user, Member $member): bool
    {
        return $this->canTouch($user, $member);
    }

    public function forceDelete(User $user, Member $member): bool
    {
        return $this->canTouch($user, $member);
    }

    public function attachMeeting(User $user, Member $member, $meeting): bool
    {
        return $this->canTouch($user, $member) && $this->sharesOffice($user, $meeting);
    }

    public function detachMeeting(User $user, Member $member, $meeting): bool
    {
        return $this->attachMeeting($user, $member, $meeting);
    }
}
