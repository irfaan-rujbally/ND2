<?php

namespace App\Support;

use App\Models\Member;
use App\Models\Poll;
use App\Models\PollVote;
use Illuminate\Support\Collection;

/**
 * Turns a poll into the shape both sides of the app render.
 *
 * One class rather than a method on each controller because the staff results
 * screen and the member portal show the same numbers, and two implementations
 * would drift -- the moment they disagree about a percentage, somebody is
 * looking at the wrong result of a party decision.
 *
 * This is also where the ballot's confidentiality lives. Everything below reads
 * poll_votes grouped by option, or counts distinct members, and nothing selects
 * member_id beside poll_option_id. There is no method here that could answer
 * "how did Alice vote", which is why no endpoint can.
 */
class PollTally
{
    /**
     * The poll, its options, and the count against each.
     *
     * `options` must already be loaded -- callers eager-load them, so this stays
     * two queries whatever the size of the list.
     */
    public static function for(Poll $poll): array
    {
        $counts = self::countsByOption($poll);
        $voters = self::voterCount($poll);
        $eligible = self::eligibleCount($poll);
        $totalVotes = (int) $counts->sum();

        return [
            'options' => $poll->options->map(fn ($option) => [
                'id'    => $option->id,
                'label' => $option->label,
                'votes' => (int) ($counts[$option->id] ?? 0),
                /*
                 * Of the members who answered, not of the votes cast. On a
                 * multiple-choice poll those differ -- one member ticking three
                 * boxes casts three votes -- and a share of the votes would put
                 * "60% chose this" next to a number nobody can act on. Share of
                 * respondents is the sentence the office actually says out loud.
                 */
                'share' => $voters > 0 ? round(((int) ($counts[$option->id] ?? 0)) / $voters * 100, 1) : 0.0,
            ])->values()->all(),

            'total_votes'    => $totalVotes,
            'voter_count'    => $voters,
            'eligible_count' => $eligible,
            'turnout'        => $eligible > 0 ? round($voters / $eligible * 100, 1) : 0.0,
        ];
    }

    /** Votes per option id. */
    private static function countsByOption(Poll $poll): Collection
    {
        return PollVote::query()
            ->where('poll_id', $poll->id)
            ->selectRaw('poll_option_id, COUNT(*) as aggregate')
            ->groupBy('poll_option_id')
            ->pluck('aggregate', 'poll_option_id');
    }

    /**
     * Members who answered, counted once each however many boxes they ticked.
     */
    public static function voterCount(Poll $poll): int
    {
        return (int) PollVote::query()
            ->where('poll_id', $poll->id)
            ->distinct()
            ->count('member_id');
    }

    /**
     * Members entitled to answer: the approved, non-deleted members of the
     * poll's own office.
     *
     * Counted live rather than frozen when the poll was created, so the turnout
     * figure always reads against today's register. That means a member approved
     * mid-poll widens the denominator; the alternative -- a roll snapshot -- is a
     * table nobody asked for, and this is a consultation rather than an election.
     */
    public static function eligibleCount(Poll $poll): int
    {
        return Member::query()
            ->where('office_id', $poll->office_id)
            ->whereNotNull('approved_at')
            ->count();
    }
}
