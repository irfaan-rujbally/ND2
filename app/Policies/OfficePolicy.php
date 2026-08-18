<?php

namespace App\Policies;

use App\Models\Office;
use App\Models\User;

/**
 * Offices are reference data: readable by any authenticated user (the forms
 * need them to populate their office selector) but not mutable through the API.
 */
class OfficePolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Office $office): bool
    {
        return true;
    }

    public function create(User $user): bool
    {
        return false;
    }

    public function replicate(User $user, Office $office): bool
    {
        return false;
    }

    public function update(User $user, Office $office): bool
    {
        return false;
    }

    public function delete(User $user, Office $office): bool
    {
        return false;
    }

    public function restore(User $user, Office $office): bool
    {
        return false;
    }

    public function forceDelete(User $user, Office $office): bool
    {
        return false;
    }
}
