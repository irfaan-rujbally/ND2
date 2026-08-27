<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = $this->query($request);
        return response()->json([
            'data' => (clone $query)->latest()->limit(30)->get(),
            'unread_count' => (clone $query)->whereNull('read_at')->count(),
        ]);
    }

    public function read(Request $request, ActivityNotification $notification): JsonResponse
    {
        abort_unless($this->owns($request, $notification), 404);
        $notification->update(['read_at' => $notification->read_at ?? now()]);
        return response()->json(['data' => $notification]);
    }

    public function readAll(Request $request): JsonResponse
    {
        $this->query($request)->whereNull('read_at')->update(['read_at' => now()]);
        return response()->json(null, 204);
    }

    public function destroy(Request $request, ActivityNotification $notification): JsonResponse
    {
        // 404 rather than 403 on someone else's row: the id is sequential and
        // guessable, and a 403 would confirm the notification exists.
        abort_unless($this->owns($request, $notification), 404);
        $notification->delete();

        return response()->json(null, 204);
    }

    public function destroyAll(Request $request): JsonResponse
    {
        $this->query($request)->delete();

        return response()->json(null, 204);
    }

    private function query(Request $request)
    {
        $type = $request->user() instanceof \App\Models\Member ? 'member' : 'user';
        return ActivityNotification::query()->where('recipient_type', $type)->where('recipient_id', $request->user()->id);
    }

    private function owns(Request $request, ActivityNotification $notification): bool
    {
        $type = $request->user() instanceof \App\Models\Member ? 'member' : 'user';
        return $notification->recipient_type === $type && (int) $notification->recipient_id === (int) $request->user()->id;
    }
}
