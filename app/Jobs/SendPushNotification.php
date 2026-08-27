<?php

namespace App\Jobs;

use App\Models\ActivityNotification;
use App\Support\PushService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Delivers one already-persisted notification to that recipient's registered
 * devices.
 *
 * One job per notification, dispatched by ActivityNotifier once the row exists.
 * Signing a web-push payload is elliptic-curve work followed by a blocking HTTPS
 * request per device, so an announcement to a four-hundred-member office used to
 * mean four hundred of those inside a single web request. The notification rows
 * -- which are what the bell in the header reads -- are written first and are
 * unaffected if the push half is slow or the provider is down.
 *
 * No retry, and no rethrow: PushService::send() already catches everything,
 * logs it, and prunes subscriptions the provider reports as expired. A retry
 * would re-notify the devices that did succeed on the first pass, because the
 * report is per-device and the job has no memory of which ones those were.
 */
class SendPushNotification implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * A notification deleted between dispatch and execution has nothing left to
     * deliver, so drop the job rather than failing it.
     */
    public bool $deleteWhenMissingModels = true;

    public function __construct(public ActivityNotification $notification)
    {
    }

    public function handle(): void
    {
        PushService::send($this->notification);
    }
}
