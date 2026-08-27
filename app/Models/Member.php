<?php

namespace App\Models;

use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\Access\Authorizable;
use Illuminate\Auth\Authenticatable;
use Laravel\Sanctum\HasApiTokens;
use App\Support\ActivityNotifier;

/**
 * A party member.
 *
 * Members are authenticatable so they can sign in to the member portal, but they
 * are NOT users: they hold no role, no permission and no office authority. The
 * portal reaches them through tokens carrying only the `member` ability, and the
 * staff API requires the `staff` ability, so a member token cannot address a
 * staff endpoint even though both are verified by Sanctum. See routes/api.php.
 */
class Member extends Model implements AuthenticatableContract
{
    use Authenticatable, Authorizable, HasApiTokens, HasFactory, SoftDeletes;

    /** The single ability a member portal token is granted. */
    public const PORTAL_ABILITY = 'member';

    protected $table = 'members';

    /*
     * qr_token is deliberately NOT hidden: MemberResource exposes it and the
     * badge components render it, so hiding it here would blank every printed
     * badge. It is guarded by policy at the resource, not by serialisation.
     */
    protected $hidden = ['password'];

    /**
     * Every member needs a QR token from the moment they exist, so their badge
     * can be printed straight after registration.
     */
    protected static function booted(): void
    {
        static::creating(function (self $member) {
            if (blank($member->qr_token)) {
                $member->qr_token = static::freshQrToken();
            }
        });

        static::created(fn (self $member) => ActivityNotifier::staff(
            $member->office_id, 'member_created', 'Member created', $member->name, "/members/{$member->id}"
        ));

        static::updated(function (self $member) {
            // Password/login bookkeeping should not generate an "edited" alert.
            $meaningful = array_diff(array_keys($member->getChanges()), [
                'password', 'password_set_at', 'last_login_at', 'remember_token', 'updated_at',
            ]);
            if ($meaningful) {
                ActivityNotifier::staff($member->office_id, 'member_edited', 'Member edited', $member->name, "/members/{$member->id}");
            }
        });
    }

    /**
     * The password a member starts with: the initial of their last name in upper
     * case followed by the last seven digits of their phone number, e.g. Ragoo /
     * 5712 3456 -> "R7123456".
     *
     * Seven digits because that is what the rule specifies, and taking them from
     * the *end* is what makes it work across the register: numbers are stored
     * inconsistently ("+230 5712 3456", "230-57123456", "57123456"), and the
     * trailing seven survive every one of those forms.
     *
     * Returns null when it cannot be built -- no last name, or fewer than seven
     * digits of phone. Those members get no default password and therefore cannot
     * sign in until one is set for them, which is the safe direction to fail:
     * a short or blank phone must never collapse into a guessable password.
     */
    public static function defaultPasswordFor(?string $lastName, ?string $phone): ?string
    {
        $initial = strtoupper(substr(trim((string) $lastName), 0, 1));

        if ($initial === '' || ! preg_match('/[A-Z]/', $initial)) {
            return null;
        }

        $digits = preg_replace('/\D/', '', (string) $phone);

        if (strlen($digits) < 7) {
            return null;
        }

        return $initial.substr($digits, -7);
    }

    /** The default password for this member, or null if one cannot be built. */
    public function defaultPassword(): ?string
    {
        return static::defaultPasswordFor($this->last_name, $this->phone);
    }

    public static function freshQrToken(): string
    {
        do {
            $token = \Illuminate\Support\Str::random(32);
        } while (static::withTrashed()->where('qr_token', $token)->exists());

        return $token;
    }

    protected function casts(): array
    {
        return [
            'date_of_birth'             => 'date:Y-m-d',
            'whatsapp_available'        => 'boolean',
            'documents_confirmed'       => 'boolean',
            'communication_preferences' => 'array',
            'volunteer_interests'       => 'array',
            'password'                  => 'hashed',
            'password_set_at'           => 'datetime',
            'last_login_at'             => 'datetime',
        ];
    }

    public function getNameAttribute()
    {
        return $this->last_name.' '.$this->first_name;
    }

    public function scopeOrderByName($query)
    {
        $query->orderBy('last_name')->orderBy('first_name');
    }

    public function scopeFilter($query, array $filters)
    {
        $query->when($filters['search'] ?? null, function ($query, $search) {
            $query->where(function ($query) use ($search) {
                $query->where('first_name', 'like', '%'.$search.'%')
                    ->orWhere('last_name', 'like', '%'.$search.'%');
            });
        })->when($filters['constituency'] ?? null, function ($query, $constituency) {
            $query->where(function ($query) use ($constituency) {
                $query->where('constituency', $constituency);
            });
        });
    }

    /**
     * Orders members by when they were last recorded at a given meeting, most
     * recent first — what the attendance panel wants, so somebody just scanned
     * in appears at the top rather than wherever the alphabet puts them.
     *
     * Correlated subqueries rather than a join: the pivot carries no unique
     * index (see the meeting_has_member migration), so a join could duplicate a
     * member if a stray un-deleted duplicate pair ever existed.
     *
     * Ordering keys, in order of preference:
     *  - updated_at, because attaching an already-attached member restores the
     *    existing pivot row rather than inserting a new one, so its created_at
     *    still reads as the original attachment;
     *  - created_at, for rows imported before updated_at was written;
     *  - the pivot id, which is monotonic, as the final tie-break.
     */
    public function scopeOrderByAttendanceAddedAt($query, int $meetingId, string $direction = 'desc')
    {
        // SoftDeletes on MeetingHasMember already excludes detached rows.
        $pivot = MeetingHasMember::query()
            ->whereColumn('meeting_has_member.member_id', 'members.id')
            ->where('meeting_has_member.meeting_id', $meetingId)
            ->latest('meeting_has_member.id')
            ->limit(1);

        return $query
            ->reorder()  // Drops the resource's default name ordering.
            ->orderBy(
                (clone $pivot)->select(\Illuminate\Support\Facades\DB::raw(
                    'COALESCE(meeting_has_member.updated_at, meeting_has_member.created_at)'
                )),
                $direction
            )
            ->orderBy((clone $pivot)->select('meeting_has_member.id'), $direction);
    }

    /**
     * Ordering by how many meetings a member attended.
     *
     * Sorting the members list by its Attendance column comes through here
     * rather than through a `sorts` entry: the percentage is not a column, it is
     * the meetings count over a denominator shared by every row, so ordering by
     * the count orders by the percentage.
     *
     * A correlated subquery for the same reason scopeOrderByAttendanceAddedAt
     * uses one -- the pivot has no unique index, so a join could count a member
     * twice. Name is the tie-break, so members on 0% keep a stable order.
     */
    public function scopeOrderByMeetingsCount($query, string $direction = 'desc')
    {
        $count = MeetingHasMember::query()
            ->selectRaw('count(*)')
            ->whereColumn('meeting_has_member.member_id', 'members.id');

        return $query
            ->reorder()  // Drops the resource's default name ordering.
            ->orderBy($count, $direction)
            ->orderBy('members.first_name')
            ->orderBy('members.id');
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    /**
     * Meetings this member attended.
     *
     * The pivot table is soft deleted, so detached rows are excluded explicitly:
     * belongsToMany has no awareness of the pivot's deleted_at on its own.
     */
    public function meetings(): BelongsToMany
    {
        return $this->belongsToMany(Meeting::class, 'meeting_has_member', 'member_id', 'meeting_id')
            ->whereNull('meeting_has_member.deleted_at')
            ->withTimestamps();
    }

    public function incidents(): HasMany
    {
        return $this->hasMany(Incident::class);
    }
}
