<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Support\ActivityNotifier;

class Incident extends Model
{
    use HasFactory, SoftDeletes;

    public const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

    protected $fillable = [
        'office_id', 'member_id', 'created_by', 'department_id', 'title', 'description', 'status',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $incident) {
            $actor = auth()->user();

            if ($actor instanceof User) {
                $incident->office_id = $actor->office_id;
                $incident->created_by = $actor->id;
            }
        });

        static::updated(function (self $incident) {
            if ($incident->wasChanged('status') && $incident->member_id) {
                $labels = [
                    'open' => 'Open', 'in_progress' => 'In progress',
                    'resolved' => 'Resolved', 'closed' => 'Closed',
                ];
                ActivityNotifier::member(
                    $incident->member_id,
                    'incident_status_changed',
                    'Your incident status has changed',
                    $incident->title.' · '.($labels[$incident->status] ?? $incident->status),
                    '/my/incidents'
                );
            }
        });
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(Member::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(IncidentComment::class)->oldest();
    }

    public function scopeUnassignedDepartment(Builder $query): Builder
    {
        return $query->whereNull('department_id');
    }
}
