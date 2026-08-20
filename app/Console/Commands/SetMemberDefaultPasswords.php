<?php

namespace App\Console\Commands;

use App\Models\Member;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Assigns the starting password (last-name initial + last seven phone digits) to
 * members who do not have one yet.
 *
 * The initial backfill ran as a migration, but the register is still being
 * completed: members whose phone number is added later have no default password
 * until this runs again. Migrations only run once, so the job lives here as a
 * command that is safe to run as often as you like.
 *
 * Only members with a null password are touched, so a member who has chosen
 * their own password is never reset by this. Use --force-default to deliberately
 * reset someone back to the default (accepts --member=ID, repeatable).
 */
class SetMemberDefaultPasswords extends Command
{
    protected $signature = 'members:set-default-passwords
                            {--member=* : Limit to these member ids}
                            {--force-default : Reset matching members to the default even if they already have a password}
                            {--dry-run : Report what would change without writing}';

    protected $description = 'Give members without a password their default one (last-name initial + last 7 phone digits)';

    public function handle(): int
    {
        $ids = $this->option('member');
        $force = (bool) $this->option('force-default');
        $dryRun = (bool) $this->option('dry-run');

        if ($force && $ids === []) {
            $this->error('--force-default resets passwords, so it must be limited with --member=ID.');

            return self::FAILURE;
        }

        $query = Member::query()
            ->when($ids !== [], fn ($q) => $q->whereIn('id', $ids))
            ->when(! $force, fn ($q) => $q->whereNull('password'))
            ->orderBy('id')
            ->select(['id', 'first_name', 'last_name', 'phone']);

        $set = 0;
        $skipped = [];

        $query->chunkById(200, function ($members) use (&$set, &$skipped, $dryRun) {
            foreach ($members as $member) {
                $default = $member->defaultPassword();

                if ($default === null) {
                    $skipped[] = "#{$member->id} {$member->first_name} {$member->last_name}";

                    continue;
                }

                if (! $dryRun) {
                    DB::table('members')->where('id', $member->id)->update([
                        'password'        => Hash::make($default),
                        'password_set_at' => null,
                    ]);
                }

                $set++;
            }
        });

        $verb = $dryRun ? 'would be set' : 'set';
        $this->info("Default passwords {$verb}: {$set}");

        if ($skipped !== []) {
            $this->warn(count($skipped).' member(s) skipped -- no last name, or fewer than 7 digits of phone:');
            foreach (array_slice($skipped, 0, 20) as $line) {
                $this->line('  '.$line);
            }
            if (count($skipped) > 20) {
                $this->line('  ... and '.(count($skipped) - 20).' more');
            }
            $this->line('Fill in their phone number, then run this again.');
        }

        return self::SUCCESS;
    }
}
