<?php

use App\Http\Controllers\ImagesController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| The application is now a React single page app that talks to the token
| authenticated REST API in routes/api.php. The only server rendered things
| left are the SPA shell and the on-the-fly image resizer.
|
| The previous Inertia routes are kept in git history; see the pre-rewrite
| revision of this file if you need the old controller wiring.
|
*/

Route::get('/img/{path}', [ImagesController::class, 'show'])
    ->where('path', '.*')
    ->name('image');

/*
 * SPA catch-all. Every non-API, non-image path returns the shell and lets the
 * React router decide what to render, including 404s. Excluding the prefixes
 * below keeps Laravel's own routes reachable.
 */
Route::get('/{any?}', fn () => view('app'))
    ->where('any', '^(?!api|img|sanctum|api-documentation|up|build|storage).*$')
    ->name('spa');
