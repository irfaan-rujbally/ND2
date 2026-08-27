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
    public static function send(ActivityNotification $notification): array
    {
        $result = ['subscriptions' => 0, 'sent' => 0, 'failed' => 0, 'reasons' => []];
        if (! config('webpush.vapid.public_key') || ! config('webpush.vapid.private_key')) {
            $result['reasons'][] = 'VAPID is not configured.';
            return $result;
        }

        $subscriptions = StoredSubscription::query()
            ->where('recipient_type', $notification->recipient_type)
            ->where('recipient_id', $notification->recipient_id)
            ->get();

        $result['subscriptions'] = $subscriptions->count();
        if ($subscriptions->isEmpty()) {
            $result['reasons'][] = 'No push subscription is registered for this account.';
            return $result;
        }

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
                if ($report->isSuccess()) {
                    $result['sent']++;
                    continue;
                }

                $result['failed']++;
                $reason = $report->getReason();
                $result['reasons'][] = $reason;
                $endpoint = (string) $report->getRequest()->getUri();
                Log::warning('Web push provider rejected delivery', [
                    'notification_id' => $notification->id,
                    'endpoint_hash' => hash('sha256', $endpoint),
                    'reason' => $reason,
                ]);
                if ($report->isSubscriptionExpired()) {
                    StoredSubscription::where('endpoint_hash', hash('sha256', $endpoint))->delete();
                }
            }
        } catch (Throwable $error) {
            // A push provider outage must never make the underlying app action fail.
            Log::warning('Web push delivery failed', ['notification_id' => $notification->id, 'error' => $error->getMessage()]);
            $result['failed']++;
            $result['reasons'][] = $error->getMessage();
        }


        return $result;
    }
}
