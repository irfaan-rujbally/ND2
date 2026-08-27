<?php

use App\Http\Controllers\Api\AnnouncementImageController;
use App\Http\Controllers\Api\AnnouncementRecipientsController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\Forum\TopicsController as StaffForumTopicsController;
use App\Http\Controllers\Api\ForumImageController;
use App\Http\Controllers\Api\Member\Forum\CommentsController as MemberForumCommentsController;
use App\Http\Controllers\Api\Member\Forum\TopicsController as MemberForumTopicsController;
use App\Http\Controllers\Api\MemberDocumentController;
use App\Http\Controllers\Api\MeetingParticipantsController;
use App\Http\Controllers\Api\MemberExportController;
use App\Http\Controllers\Api\PublicBadgeController;
use App\Http\Controllers\Api\Member\AnnouncementsController as MemberAnnouncementsController;
use App\Http\Controllers\Api\Member\AuthController as MemberAuthController;
use App\Http\Controllers\Api\Member\CheckInController as MemberCheckInController;
use App\Http\Controllers\Api\Member\MeetingsController as MemberMeetingsController;
use App\Http\Controllers\Api\Member\IncidentsController as MemberIncidentsController;
use App\Http\Controllers\Api\Member\IncidentCommentsController as MemberIncidentCommentsController;
use App\Http\Controllers\Api\IncidentCommentsController;
use App\Http\Controllers\Api\NotificationsController;
use App\Http\Controllers\Api\PushSubscriptionsController;
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
 * An announcement's image, unauthenticated by necessity: this URL goes out
 * inside an email, and no mail client will present a bearer token when it loads
 * the picture. The 32-character public_token in the path is what stands in for
 * the credentials -- the numeric id is never exposed, so nothing is enumerable.
 *
 * Not throttled: a single announcement mailed to five hundred members produces a
 * burst of requests from the recipients' mail proxies, all of them legitimate,
 * and a rate limit would blank the image for whoever opened it last.
 */
Route::get('public/announcements/{token}/image', [AnnouncementImageController::class, 'show'])
    ->name('api.public.announcements.image');

/*
 * Forum images, token-addressed for a different reason: the same picture has to
 * render for a member holding a portal token and for an administrator holding a
 * staff token, and those are separate guards. One unauthenticated URL keyed on 32
 * random characters serves both, rather than the endpoint existing twice with the
 * two sessions each able to reach only half the forum. The files themselves stay
 * on the private disk.
 */
Route::get('public/forum/topics/{token}/image', [ForumImageController::class, 'topicImage'])
    ->name('api.public.forum.topics.image');

Route::get('public/forum/comments/{token}/image', [ForumImageController::class, 'commentImage'])
    ->name('api.public.forum.comments.image');

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
            Route::get('incidents', [MemberIncidentsController::class, 'index'])->name('incidents.index');
            Route::post('incidents', [MemberIncidentsController::class, 'store'])->name('incidents.store');
            Route::get('incidents/{incident}/comments', [MemberIncidentCommentsController::class, 'index'])->name('incidents.comments.index');
            Route::post('incidents/{incident}/comments', [MemberIncidentCommentsController::class, 'store'])->name('incidents.comments.store');
            Route::get('notifications', [NotificationsController::class, 'index'])->name('notifications.index');
            Route::patch('notifications/{notification}/read', [NotificationsController::class, 'read'])->name('notifications.read');
            Route::post('notifications/read-all', [NotificationsController::class, 'readAll'])->name('notifications.read-all');
            Route::delete('notifications/{notification}', [NotificationsController::class, 'destroy'])->name('notifications.destroy');
            Route::delete('notifications', [NotificationsController::class, 'destroyAll'])->name('notifications.destroy-all');
            Route::get('push/key', [PushSubscriptionsController::class, 'key'])->name('push.key');
            Route::post('push/subscriptions', [PushSubscriptionsController::class, 'store'])->name('push.store');
            Route::delete('push/subscriptions', [PushSubscriptionsController::class, 'destroy'])->name('push.destroy');

            // Read-only. The staff resource is what writes and sends them; this
            // returns the notice alone, never the recipient list.
            Route::get('announcements', MemberAnnouncementsController::class)
                ->name('announcements.index');

            /*
             * The forum. A member reads their own office's topics, starts one,
             * and edits or deletes what they wrote. Nothing here can reach
             * another office or another member's post -- the controllers prove
             * ownership on every write, because members hold no role for a
             * policy to consult.
             */
            Route::prefix('forum')->name('forum.')->group(function () {
                Route::post('images', [ForumImageController::class, 'store'])->name('images.store');

                Route::get('topics', [MemberForumTopicsController::class, 'index'])->name('topics.index');
                Route::post('topics', [MemberForumTopicsController::class, 'store'])->name('topics.store');
                Route::get('topics/{topic}', [MemberForumTopicsController::class, 'show'])->name('topics.show');
                Route::patch('topics/{topic}', [MemberForumTopicsController::class, 'update'])->name('topics.update');
                Route::delete('topics/{topic}', [MemberForumTopicsController::class, 'destroy'])->name('topics.destroy');

                Route::post('topics/{topic}/comments', [MemberForumCommentsController::class, 'store'])
                    ->name('comments.store');
                Route::patch('comments/{comment}', [MemberForumCommentsController::class, 'update'])
                    ->name('comments.update');
                Route::delete('comments/{comment}', [MemberForumCommentsController::class, 'destroy'])
                    ->name('comments.destroy');
            });

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

    // Multipart upload for an announcement's image; the resource below is JSON
    // only, so it receives only the stored path.
    Route::post('announcement-images', [AnnouncementImageController::class, 'store'])
        ->name('api.announcement-images.store');

    /*
     * The recipient picker's data source. Registered before the resource so the
     * literal 'recipients' segment is not read as part of a resource route, and
     * kept outside it because it returns members joined to send status rather
     * than announcements -- see AnnouncementRecipientsController.
     */
    Route::get('announcements/{announcement}/recipients', AnnouncementRecipientsController::class)
        ->name('api.announcements.recipients');

    Rest::resource('announcements', \App\Rest\Controllers\AnnouncementsController::class)
        ->withSoftDeletes();

    Rest::resource('incidents', \App\Rest\Controllers\IncidentsController::class)
        ->withSoftDeletes();
    Route::get('incidents/{incident}/comments', [IncidentCommentsController::class, 'index'])->name('api.incidents.comments.index');
    Route::post('incidents/{incident}/comments', [IncidentCommentsController::class, 'store'])->name('api.incidents.comments.store');
    Route::get('notifications', [NotificationsController::class, 'index'])->name('api.notifications.index');
    Route::patch('notifications/{notification}/read', [NotificationsController::class, 'read'])->name('api.notifications.read');
    Route::post('notifications/read-all', [NotificationsController::class, 'readAll'])->name('api.notifications.read-all');
    Route::delete('notifications/{notification}', [NotificationsController::class, 'destroy'])->name('api.notifications.destroy');
    Route::delete('notifications', [NotificationsController::class, 'destroyAll'])->name('api.notifications.destroy-all');
    Route::get('push/key', [PushSubscriptionsController::class, 'key'])->name('api.push.key');
    Route::post('push/subscriptions', [PushSubscriptionsController::class, 'store'])->name('api.push.store');
    Route::delete('push/subscriptions', [PushSubscriptionsController::class, 'destroy'])->name('api.push.destroy');

    /*
     * Forum moderation. Plain controllers rather than a Rest::resource because
     * what these return is not the shape of the table: the office sees the
     * content of posts it has already moderated, which the member portal hides.
     *
     * There is no route here that edits or deletes a member's words. Removal is
     * `moderate`, which hides the post and leaves its author a tombstone; the
     * matching DELETE puts it back.
     */
    Route::prefix('forum')->name('api.forum.')->group(function () {
        Route::post('images', [ForumImageController::class, 'store'])->name('images.store');

        Route::get('topics', [StaffForumTopicsController::class, 'index'])->name('topics.index');
        Route::post('topics', [StaffForumTopicsController::class, 'store'])->name('topics.store');
        Route::get('topics/{topic}', [StaffForumTopicsController::class, 'show'])->name('topics.show');

        Route::post('topics/{topic}/comments', [StaffForumTopicsController::class, 'comment'])
            ->name('topics.comment');

        Route::post('topics/{topic}/moderate', [StaffForumTopicsController::class, 'moderate'])
            ->name('topics.moderate');
        Route::delete('topics/{topic}/moderate', [StaffForumTopicsController::class, 'restore'])
            ->name('topics.unmoderate');

        Route::post('comments/{comment}/moderate', [StaffForumTopicsController::class, 'moderateComment'])
            ->name('comments.moderate');
        Route::delete('comments/{comment}/moderate', [StaffForumTopicsController::class, 'restoreComment'])
            ->name('comments.unmoderate');
    });

    Rest::resource('offices', \App\Rest\Controllers\OfficesController::class);
});
