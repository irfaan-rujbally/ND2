<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Member;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Upload and retrieval of the files the membership application collects: an
 * optional CV and the mandatory national ID + birth certificate scan.
 *
 * lomkit/laravel-rest-api speaks JSON only, so multipart uploads get their own
 * endpoint. The flow is two steps, which also suits the future mobile app:
 *
 *   1. POST /api/member-documents        -> stores the file, returns its path
 *   2. POST /api/members/mutate          -> saves that path on the member
 *
 * Files are written to the private disk, never to public/. They are identity
 * documents, so they are only ever served back through `show()`, which runs the
 * member policy first.
 */
class MemberDocumentController extends Controller
{
    /** Matches the limit advertised on the public form. */
    private const MAX_KILOBYTES = 5120;

    private const KINDS = ['cv', 'documents'];

    public function store(Request $request): JsonResponse
    {
        $kind = $request->input('kind');

        abort_unless(in_array($kind, self::KINDS, true), 422, 'Unknown document kind.');

        // Only an admin may create or edit members, so only an admin may upload.
        Gate::authorize('create', Member::class);

        $rules = $kind === 'cv'
            ? ['file' => ['required', 'file', 'mimes:pdf,doc,docx,jpg,jpeg,png', 'max:'.self::MAX_KILOBYTES]]
            : ['file' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:'.self::MAX_KILOBYTES]];

        $request->validate($rules);

        $file = $request->file('file');

        $path = $file->store("member-documents/{$kind}", 'local');

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
     * Streams a member's stored document. Never a redirect to a public URL:
     * the file must not be reachable without passing the policy check.
     */
    public function show(Request $request, Member $member, string $kind): StreamedResponse
    {
        abort_unless(in_array($kind, self::KINDS, true), 404);

        Gate::authorize('view', $member);

        $path = $kind === 'cv' ? $member->cv_path : $member->documents_path;

        abort_if(blank($path) || ! Storage::disk('local')->exists($path), 404, 'Document not found.');

        /*
         * Disposition goes in the fourth argument, not the headers array. Passing
         * ['Content-Disposition' => 'inline'] overwrote the one Laravel builds
         * from $name, so the carefully derived filename never reached the client
         * and a saved copy arrived called "documents" with no extension.
         */
        return Storage::disk('local')->response(
            $path,
            $this->downloadName($member, $kind, $path),
            [],
            'inline'
        );
    }

    private function downloadName(Member $member, string $kind, string $path): string
    {
        $name = trim($member->last_name.' '.$member->first_name) ?: 'member-'.$member->id;
        $extension = pathinfo($path, PATHINFO_EXTENSION);

        return str($name)->slug().'-'.$kind.($extension ? '.'.$extension : '');
    }
}
