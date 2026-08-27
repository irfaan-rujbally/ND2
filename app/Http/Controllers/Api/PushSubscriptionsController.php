<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Member;
use App\Models\PushSubscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PushSubscriptionsController extends Controller
{
    public function key(): JsonResponse
    {
        abort_unless(config('webpush.vapid.public_key'), 503, 'Push notifications are not configured.');
        return response()->json(['public_key' => config('webpush.vapid.public_key')]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'endpoint' => ['required', 'url', 'starts_with:https://', 'max:4000'],
            'keys.p256dh' => ['required', 'string', 'max:500'],
            'keys.auth' => ['required', 'string', 'max:500'],
            'content_encoding' => ['nullable', 'in:aesgcm,aes128gcm'],
        ]);
        [$type, $id] = $this->recipient($request);
        $hash = hash('sha256', $data['endpoint']);

        $subscription = PushSubscription::updateOrCreate(['endpoint_hash' => $hash], [
            'recipient_type' => $type,
            'recipient_id' => $id,
            'endpoint' => $data['endpoint'],
            'public_key' => $data['keys']['p256dh'],
            'auth_token' => $data['keys']['auth'],
            'content_encoding' => $data['content_encoding'] ?? 'aes128gcm',
        ]);

        return response()->json(['data' => $subscription], 201);
    }

    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate(['endpoint' => ['required', 'url', 'starts_with:https://', 'max:4000']]);
        [$type, $id] = $this->recipient($request);
        PushSubscription::where('recipient_type', $type)->where('recipient_id', $id)
            ->where('endpoint_hash', hash('sha256', $data['endpoint']))->delete();
        return response()->json(null, 204);
    }

    private function recipient(Request $request): array
    {
        return [$request->user() instanceof Member ? 'member' : 'user', $request->user()->id];
    }
}
