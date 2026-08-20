<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\MemberDocumentController;
use App\Http\Controllers\Api\MeetingParticipantsController;
use App\Http\Controllers\Api\MemberExportController;
use App\Http\Controllers\Api\PublicBadgeController;
use App\Http\Controllers\Api\Member\AuthController as MemberAuthController;
use App\Http\Controllers\Api\Member\CheckInController as MemberCheckInController;
use App\Http\Controllers\Api\Member\MeetingsController as MemberMeetingsController;
use App\Http\Controllers\Api\Member\NewsController as MemberNewsController;
use App\Http\Controllers\Api\Member\ProfileController as MemberProfileController;
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

/*
|--------------------------------------------------------------------------
| Member portal
|--------------------------------------------------------------------------
|
| Members sign in against the `members` table, not `users`. They hold no role
| and no permission: the portal shows them their own record, their own badge and
| their own attendance, and lets them check into a meeting they scan.
|
| Isolation is by token ability. These tokens carry only `member`; the staff
| group below requires `staff`, which they do not have. `member.portal` refuses
| the reverse -- a staff token ('*') technically satisfies `member`, so the
| middleware checks the authenticated model really is a Member.
|
*/
Route::prefix('member')->name('api.member.')->group(function () {
    Route::post('auth/login', [MemberAuthController::class, 'login'])
        ->middleware('throttle:10,1')
        ->name('auth.login');

    Route::middleware(['auth:sanctum', 'member.portal'])
        ->group(function () {
            Route::get('auth/me', [MemberAuthController::class, 'me'])->name('auth.me');
            Route::post('auth/logout', [MemberAuthController::class, 'logout'])->name('auth.logout');

            Route::get('profile', [MemberProfileController::class, 'show'])->name('profile.show');
            Route::patch('profile', [MemberProfileController::class, 'update'])->name('profile.update');
            Route::put('profile/password', [MemberProfileController::class, 'updatePassword'])
                ->name('profile.password');

            Route::get('meetings', [MemberMeetingsController::class, 'index'])->name('meetings.index');
            Route::get('news', MemberNewsController::class)->name('news.index');

            // The check-in itself. Throttled: the meeting token is public, so
            // this is the one member route a stranger might try to hammer.
            Route::post('check-in', [MemberCheckInController::class, 'store'])
                ->middleware('throttle:20,1')
                ->name('check-in');
        });
});

/*
 * Staff API. `staff.only` is what keeps member tokens out -- it requires the
 * caller to be a User, which no member token can ever produce.
 */
Route::middleware(['auth:sanctum', 'staff.only'])->group(function () {
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

    /*
     * Registered before the resource so 'participants' is not read as a meeting
     * key. Outside the resource because it deliberately returns members of any
     * office -- see MeetingParticipantsController.
     */
    Route::get('meetings/{meeting}/participants', MeetingParticipantsController::class)
        ->name('api.meetings.participants');

    Rest::resource('meetings', \App\Rest\Controllers\MeetingsController::class)
        ->withSoftDeletes();

    Rest::resource('users', \App\Rest\Controllers\UsersController::class)
        ->withSoftDeletes(['restore']);

    Rest::resource('offices', \App\Rest\Controllers\OfficesController::class);
});
