<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote')->hourly();

/*
 * Housekeeping. Sunday 03:00 rather than the default midnight: nothing else runs
 * then, and it is the far side of any Saturday meeting whose check-ins and forum
 * replies produced the week's notifications.
 *
 * Requires `php artisan schedule:run` on a one-minute cron. Without it this line
 * is inert -- see the note in the deploy steps.
 */
Schedule::command('notifications:prune')
    ->weeklyOn(0, '03:00')
    ->withoutOverlapping();
