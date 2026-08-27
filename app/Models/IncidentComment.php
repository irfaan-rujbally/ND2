<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IncidentComment extends Model
{
    protected $fillable = ['incident_id', 'user_id', 'member_id', 'body'];

    public function incident(): BelongsTo { return $this->belongsTo(Incident::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function member(): BelongsTo { return $this->belongsTo(Member::class); }

    public function authorName(): string
    {
        if ($this->member) {
            return trim($this->member->first_name.' '.$this->member->last_name);
        }

        if ($this->user) {
            return trim($this->user->first_name.' '.$this->user->last_name);
        }

        return 'Former user';
    }
}
