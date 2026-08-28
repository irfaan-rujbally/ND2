<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Department extends Model
{
    public $timestamps = false;

    protected $fillable = ['name', 'sort_order'];

    public function incidents(): HasMany
    {
        return $this->hasMany(Incident::class);
    }
}
