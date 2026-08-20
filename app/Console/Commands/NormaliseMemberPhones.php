<?php

namespace App\Console\Commands;

use App\Models\Member;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Brings members.phone in line with the rule enforced on every write: exactly
 * eight digits, and unique across the register.
 *
 * Numbers that cannot satisfy it are cleared to null rather than guessed at. A
 * seven digit number is missing a digit and there is no way to know which, so
 * inventing one would put a wrong number in the register -- worse than an empty
 * one, because nobody would know to ask.
 *
 * Duplicates are a different problem: the number itself is fine, it is just
 * attached to more than one member. Only one may keep it, and which one is a
 * judgement about the data rather than something to infer, so the tie-break is
 * explicit:
 *
 *   --keep=oldest  (default) the lowest member id keeps it, the rest are cleared
 *   --keep=none              every member in the group is cleared
 *
 * Clearing a phone also clears the password of any member still on the default,
 * because that password was derived from the number: leaving the old hash would
 * mean a live password nobody -- not even the office -- could tell them. Once the
 * correct number is filled in, members:set-default-passwords issues a fresh one.
 */
class NormaliseMemberPhones extends Command
{
    protected $signature = 'members:normalise-phones
                            {--keep=oldest : Which member keeps a shared number: oldest|none}
                            {--dry-run : Report what would change without writing}';

    protected $description = 'Clear member phone numbers that are not exactly 8 digits or are shared by several members';

    public function handle(): int
    {
        $keep = $this->option('keep');

        if (! in_array($keep, ['oldest', 'none'], true)) {
            $this->error('--keep must be either "oldest" or "none".');

            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');

        $members = Member::withTrashed()
            ->whereNotNull('phone')
            ->where('phone', '!=', '')
            ->orderBy('id')
            ->get(['id', 'first_name', 'last_name', 'phone', 'password_set_at']);

        $malformed = [];
        $byNumber = [];
        $reformat = [];

        foreach ($members as $member) {
            $digits = preg_replace('/\D/', '', (string) $member->phone);

            if (strlen($digits) !== 8) {
                $malformed[] = $member;

                continue;
            }

            /*
             * Eight digits, but written with a space or dash. The number itself
             * is valid and nothing is lost by rewriting it, so it is normalised
             * rather than cleared -- the rule wants digits only, and this row
             * already has the right ones.
             */
            if ((string) $member->phone !== $digits) {
                $reformat[$member->id] = $digits;
            }

            $byNumber[$digits][] = $member;
        }

        // A number held by more than one member; whoever does not keep it loses it.
        $duplicated = array_filter($byNumber, fn ($group) => count($group) > 1);

        $toClear = collect($malformed);

        foreach ($duplicated as $group) {
            $losers = $keep === 'oldest' ? array_slice($group, 1) : $group;
            $toClear = $toClear->concat($losers);
        }

        $toClear = $toClear->unique('id')->values();

        $this->line('');
        $this->line('Not 8 digits ....... '.count($malformed).' member(s)');
        $this->line('Shared numbers ..... '.count($duplicated).' number(s) across '
            .array_sum(array_map('count', $duplicated)).' member(s)');
        $this->line('Phones to clear .... '.$toClear->count().' member(s)');
        $this->line('Reformat to digits . '.count($reformat).' member(s)');
        $this->line('');

        if ($malformed !== []) {
            $this->warn('Not 8 digits (cleared -- the correct number has to be re-entered):');
            foreach ($malformed as $m) {
                $digits = preg_replace('/\D/', '', (string) $m->phone);
                $this->line(sprintf('  #%-5d %-28s %-20s (%d digits)',
                    $m->id, trim($m->first_name.' '.$m->last_name), $m->phone, strlen($digits)));
            }
            $this->line('');
        }

        if ($duplicated !== []) {
            $this->warn('Shared numbers'.($keep === 'oldest' ? ' (first listed keeps it)' : ' (all cleared)').':');
            foreach ($duplicated as $number => $group) {
                $this->line('  '.$number);
                foreach ($group as $index => $m) {
                    $verdict = ($keep === 'oldest' && $index === 0) ? 'keeps' : 'cleared';
                    $this->line(sprintf('      #%-5d %-28s %s',
                        $m->id, trim($m->first_name.' '.$m->last_name), $verdict));
                }
            }
            $this->line('');
        }

        if ($toClear->isEmpty() && $reformat === []) {
            $this->info('Nothing to change.');

            return self::SUCCESS;
        }

        if ($dryRun) {
            $this->info('Dry run: nothing was written.');

            return self::SUCCESS;
        }

        $clearedPasswords = 0;

        DB::transaction(function () use ($toClear, $reformat, &$clearedPasswords) {
            // Strip separators from otherwise valid numbers. Done before the
            // clears so a reformatted row is not also in $toClear.
            foreach ($reformat as $id => $digits) {
                DB::table('members')->where('id', $id)->update(['phone' => $digits]);
            }

            foreach ($toClear as $member) {
                $update = ['phone' => null];

                /*
                 * Still on the default password, which was built from the number
                 * being removed. Clear it so no unknowable password stays live;
                 * a new one is issued when the real number is filled in.
                 */
                if ($member->password_set_at === null) {
                    $update['password'] = null;
                    $clearedPasswords++;
                }

                DB::table('members')->where('id', $member->id)->update($update);
            }
        });

        if ($reformat !== []) {
            $this->info('Phones reformatted to plain digits: '.count($reformat));
        }

        $this->info('Phones cleared: '.$toClear->count());
        $this->info('Default passwords cleared with them: '.$clearedPasswords);
        $this->line('Once the correct numbers are in, run: php artisan members:set-default-passwords');

        return self::SUCCESS;
    }
}
