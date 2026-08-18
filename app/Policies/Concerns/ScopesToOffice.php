<?php

namespace App\Policies\Concerns;

use App\Models\User;

/**
 * The app is tenanted by office: an admin only ever sees and mutates records
 * belonging to their own office. This mirrors the pre-API behaviour, where
 * every query went through Auth::user()->office->members() / ->meetings().
 */
trait ScopesToOffice
{
    protected function isAdmin(User $user): bool
    {
        return $user->hasRole('admin');
    }

    protected function sharesOffice(User $user, mixed $record): bool
    {
        return $user->office_id !== null
            && $record->office_id !== null
            && (int) $user->office_id === (int) $record->office_id;
    }

    protected function canTouch(User $user, mixed $record): bool
    {
        return $this->isAdmin($user) && $this->sharesOffice($user, $record);
    }
}
