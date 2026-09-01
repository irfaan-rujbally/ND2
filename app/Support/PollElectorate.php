<?php

namespace App\Support;

use App\Models\Member;
use App\Models\Poll;

/**
 * Writing down who a poll is put to, and refusing to strand a vote already cast.
 *
 * Reading the electorate is Poll::eligibleMembers(); this is the other half --
 * changing it. Kept out of the controller because the rule that matters here is
 * not an HTTP concern: an office may widen a poll's audience at any time, and may
 * never narrow it past somebody who has already answered.
 */
class PollElectorate
{
    /**
     * Records who the poll is put to.
     *
     * `sync` rather than append, so an edit that drops a name really drops it --
     * the caller has already refused any removal that would strand a vote. An
     * office-wide poll clears the list rather than leaving a stale electorate
     * behind for a later switch back to silently inherit.
     */
    public static function write(Poll $poll, array $data): void
    {
        $audience = $data['audience'] ?? Poll::AUDIENCE_OFFICE;

        $poll->forceFill(['audience' => $audience])->save();

        if ($audience !== Poll::AUDIENCE_SELECTED) {
            $poll->invitedMembers()->sync([]);

            return;
        }

        /*
         * Filtered against the office's own register rather than trusted from
         * the request. Member ids are sequential across every office, so an id
         * pasted from elsewhere would otherwise invite a stranger into this
         * office's decision -- and an unapproved applicant, who cannot sign in
         * to answer, would sit in the turnout denominator for ever.
         */
        $poll->invitedMembers()->sync(
            Member::query()
                ->where('office_id', $poll->office_id)
                ->whereNotNull('approved_at')
                ->whereIn('id', $data['member_ids'] ?? [])
                ->pluck('id')
        );
    }

    /**
     * How many members who have already voted the proposed electorate excludes.
     *
     * Zero is the only acceptable answer. Anything above it means the office is
     * about to leave ballots in the tally cast by people the poll would then say
     * were never entitled to give them.
     */
    public static function votersExcludedBy(Poll $poll, array $data): int
    {
        // Widening to the whole office can strand nobody.
        if (($data['audience'] ?? Poll::AUDIENCE_OFFICE) !== Poll::AUDIENCE_SELECTED) {
            return 0;
        }

        return $poll->votes()
            ->whereNotIn('member_id', $data['member_ids'] ?? [])
            ->distinct()
            ->count('member_id');
    }
}
