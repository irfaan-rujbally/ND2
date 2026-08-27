<?php

namespace App\Http\Controllers\Api\Member;

use App\Http\Controllers\Controller;
use App\Models\Incident;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Support\ActivityNotifier;

class IncidentCommentsController extends Controller
{
    public function index(Request $request, Incident $incident): JsonResponse
    {
        $this->ensureOwner($request, $incident);

        return response()->json(['data' => $this->comments($incident)]);
    }

    public function store(Request $request, Incident $incident): JsonResponse
    {
        $this->ensureOwner($request, $incident);
        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);
        $incident->comments()->create(['member_id' => $request->user()->id, 'body' => $data['body']]);
        ActivityNotifier::staff($incident->office_id, 'incident_member_comment', 'Member commented on an incident', $incident->title, '/incidents');

        return response()->json(['data' => $this->comments($incident)], 201);
    }

    private function ensureOwner(Request $request, Incident $incident): void
    {
        abort_unless($incident->member_id === $request->user()->id, 404);
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
