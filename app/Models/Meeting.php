<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Meeting extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'meetings';

    protected $casts = [
        'date' => 'date:Y-m-d',
    ];

    /**
     * Every meeting gets its check-in token the moment it is created, so the QR
     * code can be printed or projected straight after saving. Mirrors how
     * Member::booted assigns a badge token.
     */
    protected static function booted(): void
    {
        static::creating(function (self $meeting) {
            if (blank($meeting->qr_token)) {
                $meeting->qr_token = static::freshQrToken();
            }
        });

        /*
         * The token is write-once. Model::unguard() is global in this app, so
         * without this an update carrying a qr_token would overwrite it -- and
         * every code already printed on a poster or projected in a hall would
         * stop working, with no way to tell which meeting they belonged to.
         *
         * Reverted rather than rejected: an edit form that round-trips the whole
         * record should not fail because it echoed a field back unchanged.
         */
        static::updating(function (self $meeting) {
            if ($meeting->isDirty('qr_token') && filled($meeting->getOriginal('qr_token'))) {
                $meeting->qr_token = $meeting->getOriginal('qr_token');
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

    public function scopeOrderByDate($query)
    {
        $query->orderBy('date');
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function scopeFilter($query, array $filters)
    {
        $query->when($filters['search'] ?? null, function ($query, $search) {
            $query->where(function ($query) use ($search) {
                $query->where('title', 'like', '%'.$search.'%')
                    ->orWhere('date', 'like', '%'.$search.'%');
            });
        })->when($filters['office_id'] ?? null, function ($query, $office) {
            $query->where(function ($query) use ($office) {
                $query->where('office_id', $office);
            });
        })->when($filters['date'] ?? null, function ($query, $date) {
            $query->where(function ($query) use ($date) {
                $query->where('date', $date);
            });
        });
    }

    /**
     * Members who attended. Excludes detached (soft deleted) pivot rows.
     */
    public function members(): BelongsToMany
    {
        return $this->belongsToMany(Member::class, 'meeting_has_member', 'meeting_id', 'member_id')
            ->whereNull('meeting_has_member.deleted_at')
            ->withTimestamps();
    }

    public function attendances()
    {
        return $this->hasMany(MeetingHasMember::class, 'meeting_id');
    }
}
