<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Transaction extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_id',
        'amount',
        'status',
        'snap_token',
        'snap_url',
    ];

    public function photo()
    {
        return $this->hasOne(Photo::class, 'order_id', 'order_id');
    }
}
