<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| The application is a React single page app that talks to the token
| authenticated REST API in routes/api.php. The only server rendered thing left
| is the SPA shell.
|
| The Inertia routes this file used to hold, and the Glide image resizer at
| /img/{path} that served PingCRM's user avatars, are in git history. Nothing in
| the React app ever called either.
|
*/

/*
 * SPA catch-all. Every non-API path returns the shell and lets the React router
 * decide what to render, including 404s. Excluding the prefixes below keeps
 * Laravel's own routes reachable.
 */
Route::get('/{any?}', fn () => view('app'))
    ->where('any', '^(?!api|sanctum|api-documentation|up|build|storage).*$')
    ->name('spa');
