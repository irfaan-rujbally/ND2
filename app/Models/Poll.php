<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A question the office puts to its members before the party takes a decision.
 *
 * Tenanted by office like everything else here: an administrator only ever sees
 * and closes the polls of their own office, and only that office's members can
 * answer them.
 */
class Poll extends Model
{
    use SoftDeletes;

    /** What the ballot may carry. The office cannot type an eleventh answer. */
    public const MAX_OPTIONS = 10;

    public const MIN_OPTIONS = 2;

    /** Every approved member of the poll's office. */
    public const AUDIENCE_OFFICE = 'office';

    /** Only the members listed in poll_member. */
    public const AUDIENCE_SELECTED = 'selected';

    protected $table = 'polls';

    protected $casts = [
        'allows_multiple' => 'boolean',
        'closes_at'       => 'datetime',
        'closed_at'       => 'datetime',
        'created_at'      => 'datetime',
        'updated_at'      => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $poll) {
            /*
             * Stamped from the session, overwriting anything the request
             * carried -- the same rule as Announcement: accepting an author from
             * the client would let one user file a poll under another's name.
             * Left alone when nobody is signed in, so seeders still work.
             */
            if (auth()->id() !== null) {
                $poll->created_by = auth()->id();
            }
        });
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Always in the order the office typed them; see the position column. */
    public function options(): HasMany
    {
        return $this->hasMany(PollOption::class)->orderBy('position')->orderBy('id');
    }

    public function votes(): HasMany
    {
        return $this->hasMany(PollVote::class);
    }

    /** The electorate of a restricted poll; empty on an office-wide one. */
    public function invitedMembers(): BelongsToMany
    {
        return $this->belongsToMany(Member::class, 'poll_member')->withTimestamps();
    }

    public function isRestricted(): bool
    {
        return $this->audience === self::AUDIENCE_SELECTED;
    }

    /**
     * Who may answer this poll: the one definition of the electorate.
     *
     * Everything that needs it asks here -- the turnout denominator, the "who
     * has answered" list, what a member sees in the portal, and whether a vote
     * is accepted. Four places deciding it separately is four places to disagree
     * about who was entitled to take part in a party decision.
     *
     * Approved only, and never soft-deleted members: an applicant the office has
     * not accepted cannot sign in to answer, so counting them would depress
     * every turnout figure by people who could never have voted.
     */
    public function eligibleMembers(): Builder
    {
        return Member::query()
            ->where('office_id', $this->office_id)
            ->whereNotNull('approved_at')
            ->when($this->isRestricted(), fn (Builder $query) => $query->whereIn(
                'members.id',
                fn ($sub) => $sub->select('member_id')->from('poll_member')->where('poll_id', $this->id)
            ));
    }

    public function allows(Member $member): bool
    {
        return $this->eligibleMembers()->whereKey($member->id)->exists();
    }

    /**
     * The polls this member may see at all.
     *
     * A restricted poll they were not invited to is not hidden from the list
     * afterwards -- it never enters the query, so there is no filtering step to
     * forget somewhere else.
     */
    public function scopeVisibleTo(Builder $query, Member $member): Builder
    {
        return $query
            ->where('office_id', $member->office_id)
            ->where(fn (Builder $inner) => $inner
                ->where('audience', self::AUDIENCE_OFFICE)
                ->orWhereHas('invitedMembers', fn (Builder $invited) => $invited->whereKey($member->id)));
    }

    /**
     * Open means "still accepting votes", which is not the same as "not closed
     * by hand": a poll with a deadline in the past is shut whether or not anyone
     * pressed the button. Every write path asks this, never the columns.
     */
    public function isOpen(): bool
    {
        if ($this->closed_at !== null) {
            return false;
        }

        return $this->closes_at === null || $this->closes_at->isFuture();
    }

    /**
     * The word the interface prints, and the only place it is decided.
     *
     * 'expired' rather than 'closed' when a deadline ran out: the two are the
     * same to a voter and quite different to the office, which may still want to
     * close an expired poll formally before publishing what it decided.
     */
    public function status(): string
    {
        if ($this->closed_at !== null) {
            return 'closed';
        }

        return $this->isOpen() ? 'open' : 'expired';
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query
            ->whereNull('closed_at')
            ->where(fn (Builder $inner) => $inner->whereNull('closes_at')->orWhere('closes_at', '>', now()));
    }
}
