<?php

namespace App\Jobs;

use App\Mail\AnnouncementMail;
use App\Models\AnnouncementRecipient;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Sends one announcement to one member.
 *
 * One job per recipient, not one per send, for two reasons: a single bad address
 * cannot take the other four hundred down with it, and the announcement_recipients
 * row is updated as each one lands, so the screen can show real progress instead
 * of a spinner.
 *
 * Failures are caught and written to the row rather than rethrown. That looks
 * unusual for a queued job -- normally you want the retry -- but it is what makes
 * the behaviour identical whether QUEUE_CONNECTION is `sync` or a real queue. On
 * `sync` a rethrown exception would surface as a 500 halfway through the send,
 * abandoning every member after the bad one. Recording it instead lets the run
 * finish, shows the administrator exactly which addresses failed, and leaves
 * those rows eligible for a re-send.
 */
class SendAnnouncementEmail implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public AnnouncementRecipient $recipient)
    {
    }

    public function handle(): void
    {
        $recipient = $this->recipient->fresh();

        // Already delivered. Reached when a re-send races a queued job, or when
        // the same job is retried after the mail had in fact gone out.
        if ($recipient === null || $recipient->wasDelivered()) {
            return;
        }

        $announcement = $recipient->announcement;
        $member = $recipient->member;

        if ($announcement === null || $member === null) {
            $recipient->update(['error' => 'The announcement or member no longer exists.']);

            return;
        }

        try {
            Mail::to($recipient->email)->send(new AnnouncementMail($announcement, $member));

            $recipient->update(['sent_at' => now(), 'error' => null]);
        } catch (Throwable $e) {
            // The full exception goes to the log; the row keeps the message,
            // which is what the administrator sees next to the member's name.
            Log::error('Announcement email failed', [
                'announcement_id' => $announcement->id,
                'member_id'       => $member->id,
                'email'           => $recipient->email,
                'exception'       => $e,
            ]);

            $recipient->update(['error' => $e->getMessage()]);
        }
    }
}
