<?php

namespace App\Policies;

use App\Models\User;
use App\Policies\Concerns\ScopesToOffice;

class UserPolicy
{
    use ScopesToOffice;

    public function viewAny(User $user): bool
    {
        return $this->isAdmin($user);
    }

    public function view(User $user, User $model): bool
    {
        return $this->canTouch($user, $model);
    }

    public function create(User $user): bool
    {
        return $this->isAdmin($user);
    }

    public function replicate(User $user, User $model): bool
    {
        return $this->canTouch($user, $model);
    }

    public function update(User $user, User $model): bool
    {
        return $this->canTouch($user, $model);
    }

    /**
     * Deleting your own account would lock you out of the app mid-session,
     * so it is refused even for an admin.
     */
    public function delete(User $user, User $model): bool
    {
        return $this->canTouch($user, $model) && $user->id !== $model->id;
    }

    public function restore(User $user, User $model): bool
    {
        return $this->canTouch($user, $model);
    }

    public function forceDelete(User $user, User $model): bool
    {
        return false;
    }
}
