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
