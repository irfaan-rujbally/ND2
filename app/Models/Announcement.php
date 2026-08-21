<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

/**
 * A notice an administrator writes once and then emails to a chosen set of
 * members.
 *
 * Announcements are tenanted by office like every other record here: an admin
 * only ever sees, edits and sends the announcements of their own office.
 */
class Announcement extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'announcements';

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * The token that makes the image URL work inside an email. Minted on create
     * for the same reason meetings mint theirs: the URL may be sent out the
     * moment the record is saved.
     */
    protected static function booted(): void
    {
        static::creating(function (self $announcement) {
            if (blank($announcement->public_token)) {
                $announcement->public_token = static::freshPublicToken();
            }

            /*
             * Stamped from the session, overwriting anything the request carried:
             * accepting it from the client would let one user file an
             * announcement under another's name. Falls through untouched when
             * there is nobody signed in, so seeders and console commands can
             * still set it themselves.
             */
            if (auth()->id() !== null) {
                $announcement->created_by = auth()->id();
            }
        });

        /*
         * Write-once, for the same reason Meeting::booted protects qr_token:
         * Model::unguard() is global in this app, so an edit form echoing the
         * field back unchanged would otherwise be able to rotate it and break
         * the image in every email already delivered.
         */
        static::updating(function (self $announcement) {
            if ($announcement->isDirty('public_token') && filled($announcement->getOriginal('public_token'))) {
                $announcement->public_token = $announcement->getOriginal('public_token');
            }
        });
    }

    public static function freshPublicToken(): string
    {
        do {
            $token = Str::random(32);
        } while (static::withTrashed()->where('public_token', $token)->exists());

        return $token;
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Every send attempt, successful or not. */
    public function recipients(): HasMany
    {
        return $this->hasMany(AnnouncementRecipient::class);
    }

    /**
     * Members the announcement actually reached.
     *
     * Filtered on sent_at, so a member whose address bounced is not counted as
     * having received it.
     */
    public function members(): BelongsToMany
    {
        return $this->belongsToMany(Member::class, 'announcement_recipients')
            ->whereNotNull('announcement_recipients.sent_at')
            ->withPivot(['sent_at', 'email'])
            ->withTimestamps();
    }

    public function hasImage(): bool
    {
        return filled($this->image_path);
    }

    /**
     * Absolute URL for the image, or null when there is none.
     *
     * Absolute because the only consumer that matters is an email: a relative
     * path in a mail client resolves against nothing.
     *
     * The `v` parameter is a digest of the stored path, and it is what makes the
     * response safe to cache forever. The token alone is not enough: it stays the
     * same when the image is replaced, so without a version a mail proxy would
     * keep serving the picture the announcement used to have.
     */
    public function imageUrl(): ?string
    {
        if (! $this->hasImage() || blank($this->public_token)) {
            return null;
        }

        $version = substr(sha1($this->image_path), 0, 8);

        return url("/api/public/announcements/{$this->public_token}/image?v={$version}");
    }
}
