<?php

namespace Database\Seeders;

use App\Models\Office;
use App\Models\User;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Role;

/**
 * The minimum a fresh install needs to be usable: one office, and one
 * administrator who can sign in and create everything else.
 *
 * This used to seed PingCRM's demo data -- an "Acme Corporation" account, a
 * johndoe@example.com owner, and a hundred Faker contacts and organizations.
 * None of those tables exist any more.
 *
 * Idempotent, so running it against a database that already has an office or an
 * admin adds nothing and changes no password.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $role = Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);

        $office = Office::firstOrCreate(['name' => 'Bonne Terre']);

        $admin = User::firstOrNew(['email' => 'admin@nd.com']);

        if (! $admin->exists) {
            $admin->first_name = 'ND';
            $admin->last_name = 'Admin';
            // Development only. Change it on any real deployment -- the staff
            // sign-in is the whole register's front door.
            $admin->password = 'password';
        }

        // Set on every run: an admin with no office sees an empty application,
        // since every screen is scoped by office.
        $admin->office_id = $office->id;
        $admin->save();

        if (! $admin->hasRole($role)) {
            $admin->assignRole($role);
        }

        $this->command?->info("Seeded office '{$office->name}' and admin {$admin->email}.");
    }
}
