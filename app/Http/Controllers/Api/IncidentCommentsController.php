<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Incident;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Support\ActivityNotifier;

class IncidentCommentsController extends Controller
{
    public function index(Request $request, Incident $incident): JsonResponse
    {
        $this->ensureOffice($request, $incident);

        return response()->json(['data' => $this->comments($incident)]);
    }

    public function store(Request $request, Incident $incident): JsonResponse
    {
        $this->ensureOffice($request, $incident);
        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);
        $incident->comments()->create(['user_id' => $request->user()->id, 'body' => $data['body']]);
        ActivityNotifier::member($incident->member_id, 'incident_staff_comment', 'Staff commented on your incident', $incident->title, '/my/incidents');

        return response()->json(['data' => $this->comments($incident)], 201);
    }

    private function ensureOffice(Request $request, Incident $incident): void
    {
        abort_unless($incident->office_id === $request->user()->office_id, 404);
    }

    private function comments(Incident $incident): array
    {
        return $incident->comments()->with(['user:id,first_name,last_name', 'member:id,first_name,last_name'])->get()
            ->map(fn ($comment) => [
                'id' => $comment->id,
                'body' => $comment->body,
                'author_name' => $comment->authorName(),
                'author_type' => $comment->member_id ? 'member' : 'staff',
                'created_at' => $comment->created_at,
            ])->all();
    }
}
