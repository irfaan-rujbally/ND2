<?php

namespace App\Policies;

use App\Models\Incident;
use App\Models\User;
use App\Policies\Concerns\ScopesToOffice;

class IncidentPolicy
{
    use ScopesToOffice;

    public function viewAny(User $user): bool { return $this->isAdmin($user); }
    public function view(User $user, Incident $incident): bool { return $this->canTouch($user, $incident); }
    public function create(User $user): bool { return $this->isAdmin($user); }
    public function replicate(User $user, Incident $incident): bool { return $this->canTouch($user, $incident); }
    public function update(User $user, Incident $incident): bool { return $this->canTouch($user, $incident); }
    public function delete(User $user, Incident $incident): bool { return $this->canTouch($user, $incident); }
    public function restore(User $user, Incident $incident): bool { return $this->canTouch($user, $incident); }
    public function forceDelete(User $user, Incident $incident): bool { return $this->canTouch($user, $incident); }
}
