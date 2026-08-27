<?php

return [

    /*
     * Public membership applications: POST /api/public/member-signup.
     */
    'signup' => [

        /*
         * Turn the public form off without a deploy. The route stays registered
         * and answers 503, so the sign-up button on the portal explains itself
         * rather than 404ing.
         */
        'enabled' => (bool) env('MEMBER_SIGNUP_ENABLED', true),

        /*
         * Every member must belong to an office, and an applicant has no way to
         * know which one is theirs, so all applications land in one intake
         * office and staff reassign on approval.
         *
         * Unset falls back to the lowest office id. If there are no offices at
         * all the endpoint refuses rather than writing an orphan record.
         */
        'office_id' => env('MEMBER_SIGNUP_OFFICE_ID'),
    ],

];
