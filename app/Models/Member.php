<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Member extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'members';

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
}
