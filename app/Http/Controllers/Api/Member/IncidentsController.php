<?php

namespace App\Http\Controllers\Api\Member;

use App\Http\Controllers\Controller;
use App\Models\Incident;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Support\ActivityNotifier;

class IncidentsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $incidents = Incident::query()
            ->with('department:id,name')
            ->where('member_id', $request->user()->id)
            ->latest()
            ->paginate(20);

        return response()->json($incidents);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:150'],
            'description' => ['required', 'string', 'max:10000'],
        ]);

        $member = $request->user();
        $incident = Incident::create([
            ...$data,
            'office_id' => $member->office_id,
            'member_id' => $member->id,
            'status' => 'open',
        ]);
        ActivityNotifier::staff($member->office_id, 'incident_created', 'Incident created', $incident->title, '/incidents');

        return response()->json(['data' => $incident], 201);
    }
}
