<?php

namespace App\Support;

use App\Models\ActivityNotification;
use App\Models\PushSubscription as StoredSubscription;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;
use Throwable;

class PushService
{
    public static function send(ActivityNotification $notification): void
    {
        if (! config('webpush.vapid.public_key') || ! config('webpush.vapid.private_key')) return;

        $subscriptions = StoredSubscription::query()
            ->where('recipient_type', $notification->recipient_type)
            ->where('recipient_id', $notification->recipient_id)
            ->get();

        if ($subscriptions->isEmpty()) return;

        try {
            $webPush = new WebPush(['VAPID' => [
                'subject' => config('webpush.vapid.subject'),
                'publicKey' => config('webpush.vapid.public_key'),
                'privateKey' => config('webpush.vapid.private_key'),
            ]]);

            foreach ($subscriptions as $stored) {
                $webPush->queueNotification(Subscription::create([
                    'endpoint' => $stored->endpoint,
                    'keys' => ['p256dh' => $stored->public_key, 'auth' => $stored->auth_token],
                    'contentEncoding' => $stored->content_encoding,
                ]), json_encode([
                    'title' => $notification->title,
                    'body' => $notification->message,
                    'url' => $notification->url ?: '/',
                    'notification_id' => $notification->id,
                ], JSON_THROW_ON_ERROR));
            }

            foreach ($webPush->flush() as $report) {
                if (! $report->isSuccess() && $report->isSubscriptionExpired()) {
                    StoredSubscription::where('endpoint_hash', hash('sha256', (string) $report->getRequest()->getUri()))->delete();
                }
            }
        } catch (Throwable $error) {
            // A push provider outage must never make the underlying app action fail.
            Log::warning('Web push delivery failed', ['notification_id' => $notification->id, 'error' => $error->getMessage()]);
        }
    }
}
