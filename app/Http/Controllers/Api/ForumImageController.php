<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ForumComment;
use App\Models\ForumTopic;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Images attached to forum topics and comments.
 *
 * Upload is a separate multipart request from the record itself, the same two
 * steps the membership form and announcements already use: store the file, get a
 * path back, then send that path with the topic or comment.
 *
 * Delivery is by unguessable token, unauthenticated. That is not laziness: the
 * same image has to render for a member holding a portal token and for an
 * administrator holding a staff token, and those are different guards. One token
 * URL serves both without the endpoint being written twice or either session
 * being handed the other's credentials. The files stay on the private disk and
 * nothing is reachable by guessing an id.
 *
 * A moderated post keeps a working image URL. Only the API response hides it --
 * see ForumPresenter -- because an administrator reviewing what they removed
 * still needs to see it.
 */
class ForumImageController extends Controller
{
    /** No SVG: it is a script-bearing document, and this is user-supplied. */
    private const MIMES = 'jpg,jpeg,png,webp,gif';

    private const MAX_KILOBYTES = 5120;

    /**
     * Uploads on behalf of a member. Reached through the member portal group, so
     * the caller is already proven to be a Member.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:'.self::MIMES, 'max:'.self::MAX_KILOBYTES],
        ]);

        $file = $request->file('file');

        $path = $file->store('forum-images', 'local');

        return response()->json([
            'data' => [
                'path'          => $path,
                'original_name' => $file->getClientOriginalName(),
                'size'          => $file->getSize(),
                'mime_type'     => $file->getClientMimeType(),
            ],
        ]);
    }

    public function topicImage(string $token): StreamedResponse
    {
        $topic = ForumTopic::withTrashed()->where('public_token', $token)->first();

        return $this->stream($topic?->image_path);
    }

    public function commentImage(string $token): StreamedResponse
    {
        $comment = ForumComment::withTrashed()->where('public_token', $token)->first();

        return $this->stream($comment?->image_path);
    }

    /**
     * Trashed records are included above on purpose: a page open in someone's
     * browser when a post is removed should not turn into a broken image icon.
     * The post itself is already gone from every list.
     */
    private function stream(?string $path): StreamedResponse
    {
        abort_if(blank($path), 404);
        abort_unless(Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->response(
            $path,
            basename($path),
            [
                'Content-Disposition' => 'inline',
                /*
                 * Safe to cache hard because the URL carries a digest of the
                 * stored path: replacing the image changes the URL. The token
                 * alone would not be enough -- it survives a replacement.
                 */
                'Cache-Control' => 'private, max-age=31536000, immutable',
            ]
        );
    }
}
