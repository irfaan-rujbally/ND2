<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PushSubscription extends Model
{
    protected $fillable = [
        'recipient_type', 'recipient_id', 'device_id', 'endpoint', 'endpoint_hash',
        'public_key', 'auth_token', 'content_encoding',
    ];
}
