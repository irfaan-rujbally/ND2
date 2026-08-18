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
