<?php

namespace App\Support;

use App\Models\Poll;

/**
 * Turns a poll into the shape the API returns.
 *
 * One class rather than mapping in each controller, because the staff screens and
 * the member portal must not drift on the rule that matters here: the ballot
 * always carries its options in the office's order, and it never carries the
 * pairing of a member with the option they chose. See PollTally.
 */
class PollPresenter
{
    /**
     * The poll itself, with its options. `options` must be loaded.
     *
     * @param  array<int>|null  $chosenOptionIds  the viewing member's own answer,
     *                                            omitted entirely for staff
     */
    public static function poll(Poll $poll, ?array $chosenOptionIds = null): array
    {
        $payload = [
            'id'              => $poll->id,
            'title'           => $poll->title,
            'description'     => $poll->description,
            'allows_multiple' => $poll->allows_multiple,
            /*
             * Who it was put to. The list of names is deliberately NOT here --
             * the picker fetches it from polls/candidates, so a poll on a list
             * of twenty never carries five hundred member ids it will not draw.
             */
            'audience'        => $poll->audience,
            'is_restricted'   => $poll->isRestricted(),
            // Derived from the two timestamps, never stored -- see Poll::status().
            'status'          => $poll->status(),
            'is_open'         => $poll->isOpen(),
            'closes_at'       => $poll->closes_at?->toIso8601String(),
            'closed_at'       => $poll->closed_at?->toIso8601String(),
            'created_at'      => $poll->created_at?->toIso8601String(),
            'author'          => $poll->relationLoaded('author') && $poll->author
                ? trim($poll->author->first_name.' '.$poll->author->last_name)
                : null,
            'options'         => $poll->options->map(fn ($option) => [
                'id'    => $option->id,
                'label' => $option->label,
            ])->values()->all(),
        ];

        if ($chosenOptionIds !== null) {
            /*
             * Only ever the viewer's own answer, and only on the member portal.
             * The staff payload has no equivalent key -- there is nothing to
             * accidentally leave in a response, because nothing puts it there.
             */
            $payload['my_option_ids'] = array_values($chosenOptionIds);
            $payload['has_voted'] = $chosenOptionIds !== [];
        }

        return $payload;
    }

    /** The poll with its numbers attached, for a caller allowed to see them. */
    public static function withResults(Poll $poll, ?array $chosenOptionIds = null): array
    {
        return [...self::poll($poll, $chosenOptionIds), 'results' => PollTally::for($poll)];
    }
}
