<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Rest\Resources\AnnouncementResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Upload and delivery of an announcement's image.
 *
 * Same two-step shape as MemberDocumentController, because the REST resources
 * speak JSON only:
 *
 *   1. POST /api/announcement-images            -> stores the file, returns its path
 *   2. POST /api/announcements/mutate           -> saves that path on the announcement
 *
 * Delivery is where this differs, and the difference is the whole reason it is a
 * separate controller. A member document is streamed behind the member policy;
 * an announcement image has to load inside an email, and a mail client sends no
 * bearer token and no session cookie. So `show()` is unauthenticated and keyed on
 * announcements.public_token -- 32 random characters standing in for the
 * credentials that cannot be presented, exactly as the public member badge does.
 *
 * The file itself still lives on the private disk. Nothing is reachable by
 * guessing a numeric id, and nothing appears under public/.
 */
class AnnouncementImageController extends Controller
{
    /**
     * Only formats a mail client will actually render inline. No SVG: it is a
     * script-bearing document, it is blocked by every major mail client anyway,
     * and serving user-supplied SVG from our own origin is an XSS vector.
     */
    private const MIMES = 'jpg,jpeg,png,webp,gif';

    public function store(Request $request): JsonResponse
    {
        // Whoever may create an announcement may upload its image.
        Gate::authorize('create', Announcement::class);

        $request->validate([
            'file' => [
                'required',
                'file',
                'mimes:'.self::MIMES,
                'max:'.AnnouncementResource::MAX_IMAGE_KILOBYTES,
            ],
        ]);

        $file = $request->file('file');

        $path = $file->store('announcement-images', 'local');

        return response()->json([
            'data' => [
                'path'          => $path,
                'original_name' => $file->getClientOriginalName(),
                'size'          => $file->getSize(),
                'mime_type'     => $file->getClientMimeType(),
            ],
        ]);
    }

    /**
     * Streams the image for a mail client, or for the <img> on the app's own
     * announcement screen.
     *
     * Resolved by token rather than by route model binding on the id, so an
     * announcement cannot be enumerated. Trashed announcements are included on
     * purpose: an email already in someone's inbox should not lose its image
     * because the announcement was archived afterwards.
     */
    public function show(string $token): StreamedResponse
    {
        $announcement = Announcement::withTrashed()
            ->where('public_token', $token)
            ->first();

        abort_if($announcement === null, 404);
        abort_if(blank($announcement->image_path), 404);
        abort_unless(Storage::disk('local')->exists($announcement->image_path), 404);

        return Storage::disk('local')->response(
            $announcement->image_path,
            basename($announcement->image_path),
            [
                'Content-Disposition' => 'inline',
                /*
                 * Mail clients and their image proxies re-fetch this URL for
                 * years. A long cache saves the app from serving the same bytes
                 * on every open, and the URL is safe to cache indefinitely
                 * because a new image means a new stored path.
                 */
                'Cache-Control' => 'public, max-age=31536000, immutable',
            ]
        );
    }
}
