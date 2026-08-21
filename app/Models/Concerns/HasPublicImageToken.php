<?php

namespace App\Models\Concerns;

use Illuminate\Support\Str;

/**
 * An unguessable token standing in for credentials on an image URL.
 *
 * Some images have to load where no bearer token can be presented -- inside an
 * email, most obviously -- and a mail client sends nothing. Others simply need
 * one URL that works for both a member's portal session and an administrator's
 * staff session without the controller being written twice. In both cases the
 * file stays on the private disk and 32 random characters in the path are what
 * stand in for authentication, exactly as members.qr_token does for the public
 * badge.
 *
 * The consuming model provides `imageUrl()`, since only it knows its own route.
 *
 * Requires a nullable, unique `public_token` column and a nullable `image_path`.
 */
trait HasPublicImageToken
{
    /**
     * Call from the model's `booted()`.
     *
     * Mints the token on create, because the URL may be needed the moment the
     * record is saved, and reverts any later attempt to change it: rotating a
     * token breaks the image in every email already delivered and every page
     * already open. Reverted rather than rejected, so an edit form that
     * round-trips the whole record does not fail for echoing the field back.
     */
    protected static function bootPublicImageToken(): void
    {
        static::creating(function (self $model) {
            if (blank($model->public_token)) {
                $model->public_token = static::freshPublicToken();
            }
        });

        static::updating(function (self $model) {
            if ($model->isDirty('public_token') && filled($model->getOriginal('public_token'))) {
                $model->public_token = $model->getOriginal('public_token');
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

    public function hasImage(): bool
    {
        return filled($this->image_path);
    }

    /**
     * The cache-busting suffix for the image URL.
     *
     * The token does not change when the image is replaced, so without this a
     * cached copy -- a browser's, or a mail provider's image proxy -- would keep
     * serving the picture the record used to have. A digest of the stored path
     * changes exactly when the file does.
     */
    protected function imageVersion(): string
    {
        return substr(sha1((string) $this->image_path), 0, 8);
    }
}
