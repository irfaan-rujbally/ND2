<?php

namespace App\Mail;

use App\Models\Announcement;
use App\Models\Member;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailables\Headers;
use Illuminate\Queue\SerializesModels;

/**
 * One announcement, to one member.
 *
 * Sent from app@nouveauxdemocrates.com, which is a send-only address with no
 * mailbox behind it. That has three consequences, all of them deliberate:
 *
 *   - No Reply-To header. Setting one would point replies at an address that
 *     also cannot receive them; leaving it off means the client shows the From
 *     address, which the footer explains is unattended.
 *   - `Auto-Submitted: auto-generated`, the RFC 3834 marker for mail that is not
 *     a person writing to a person. Well-behaved mail servers use it to suppress
 *     out-of-office replies, which would otherwise pile up unanswered.
 *   - The template says in plain words that replies go nowhere, because a member
 *     will hit Reply regardless of what the headers say.
 */
class AnnouncementMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Announcement $announcement,
        public Member $member,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            // Explicit rather than inherited: see config/mail.php for why the
            // framework default cannot be relied on here.
            from: config('mail.from.address'),
            subject: $this->announcement->title,
        );
    }

    public function headers(): Headers
    {
        return new Headers(
            text: [
                'Auto-Submitted' => 'auto-generated',
                // Tells Gmail and Outlook not to offer "unsubscribe" UI that we
                // have nothing to handle, while still marking the class of mail.
                'X-Auto-Response-Suppress' => 'All',
            ],
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.announcement',
            text: 'mail.announcement-text',
            with: [
                'title'       => $this->announcement->title,
                'description' => $this->announcement->description,
                'imageUrl'    => $this->announcement->imageUrl(),
                'greetingName' => trim((string) $this->member->first_name),
            ],
        );
    }
}
