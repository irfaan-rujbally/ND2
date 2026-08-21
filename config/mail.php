<?php

return [

    /*
     * Announcement mail goes out from app@nouveauxdemocrates.com, a send-only
     * address with no mailbox behind it. AnnouncementMail sets no Reply-To for
     * that reason and says so in the message body; see the class for the rest.
     *
     * The `?:` is not decoration. .env carries MAIL_FROM_ADDRESS=null, and
     * env() converts that string to a real null rather than falling through to
     * its default argument -- so without it every announcement would be rejected
     * by the transport for having no sender.
     */
    'from' => [
        'address' => env('MAIL_FROM_ADDRESS') ?: 'app@nouveauxdemocrates.com',
        'name' => env('MAIL_FROM_NAME') ?: 'Nouveaux Démocrates',
    ],

    'mailers' => [
        'mailgun' => [
            'transport' => 'mailgun',
            // 'client' => [
            //     'timeout' => 5,
            // ],
        ],

        'roundrobin' => [
            'transport' => 'roundrobin',
            'mailers' => [
                'ses',
                'postmark',
            ],
        ],
    ],

];
