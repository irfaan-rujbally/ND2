<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ActivityNotification extends Model
{
    protected $fillable = ['recipient_type', 'recipient_id', 'type', 'title', 'message', 'url', 'read_at'];
    protected $casts = ['read_at' => 'datetime'];
}
