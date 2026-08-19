<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\MemberDocumentController;
use App\Http\Controllers\Api\MemberExportController;
use App\Http\Controllers\Api\PublicBadgeController;
use App\Http\Controllers\Api\StatsController;
use Illuminate\Support\Facades\Route;
use Lomkit\Rest\Facades\Rest;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Token authenticated REST API consumed by the React SPA and, later, by the
| mobile app. Reads and writes go through lomkit/laravel-rest-api resources,
| which whitelist every exposed field, relation and scope and run each record
| through its policy.
|
*/

Route::post('auth/login', [AuthController::class, 'login'])
    ->middleware('throttle:10,1')
    ->name('api.auth.login');

/*
 * The one unauthenticated endpoint: a member proves who they are with their
 * national ID and date of birth, and gets their own attendance badge back.
 * Throttled hard because those two facts are all that stand in front of it.
 */
Route::post('public/member-badge', PublicBadgeController::class)
    ->middleware('throttle:6,1')
    ->name('api.public.member-badge');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('auth/me', [AuthController::class, 'me'])->name('api.auth.me');
    Route::post('auth/logout', [AuthController::class, 'logout'])->name('api.auth.logout');

    Route::get('stats', [StatsController::class, 'index'])->name('api.stats');

    // Multipart uploads for the membership application's attachments; the REST
    // resources below only speak JSON.
    Route::post('member-documents', [MemberDocumentController::class, 'store'])
        ->name('api.member-documents.store');

    Route::get('members/{member}/documents/{kind}', [MemberDocumentController::class, 'show'])
        ->name('api.member-documents.show');

    // Spreadsheet download, registered before the resource so the literal
    // 'export' segment is not read as a member key.
    Route::get('members/export', MemberExportController::class)
        ->name('api.members.export');

    Rest::resource('members', \App\Rest\Controllers\MembersController::class)
        ->withSoftDeletes();

    Rest::resource('meetings', \App\Rest\Controllers\MeetingsController::class)
        ->withSoftDeletes();

    Rest::resource('users', \App\Rest\Controllers\UsersController::class)
        ->withSoftDeletes(['restore']);

    Rest::resource('offices', \App\Rest\Controllers\OfficesController::class);
});
