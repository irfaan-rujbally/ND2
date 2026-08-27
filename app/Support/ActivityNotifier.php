<?php

namespace App\Support;

use App\Models\ActivityNotification;
use App\Models\Member;
use App\Models\User;

class ActivityNotifier
{
    public static function staff(?int $officeId, string $type, string $title, ?string $message, string $url): void
    {
        if ($officeId === null) return;

        User::query()->where('office_id', $officeId)->pluck('id')->each(
            fn ($id) => ActivityNotification::create([
                'recipient_type' => 'user', 'recipient_id' => $id, 'type' => $type,
                'title' => $title, 'message' => $message, 'url' => $url,
            ])
        );
    }

    public static function member(?int $memberId, string $type, string $title, ?string $message, string $url): void
    {
        if ($memberId === null || ! Member::query()->whereKey($memberId)->exists()) return;

        ActivityNotification::create([
            'recipient_type' => 'member', 'recipient_id' => $memberId, 'type' => $type,
            'title' => $title, 'message' => $message, 'url' => $url,
        ]);
    }

    public static function officeMembers(?int $officeId, string $type, string $title, ?string $message, string $url, ?int $exceptMemberId = null): void
    {
        if ($officeId === null) return;

        Member::query()->where('office_id', $officeId)
            ->when($exceptMemberId, fn ($query) => $query->where('id', '!=', $exceptMemberId))
            ->pluck('id')
            ->each(fn ($id) => self::member($id, $type, $title, $message, $url));
    }

    public static function members(iterable $memberIds, string $type, string $title, ?string $message, string $url, ?int $exceptMemberId = null): void
    {
        collect($memberIds)->unique()->reject(fn ($id) => (int) $id === (int) $exceptMemberId)
            ->each(fn ($id) => self::member((int) $id, $type, $title, $message, $url));
    }
}
