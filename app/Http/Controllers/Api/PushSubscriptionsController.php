<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Member;
use App\Models\PushSubscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PushSubscriptionsController extends Controller
{
    public function key(): JsonResponse
    {
        abort_unless(config('webpush.vapid.public_key'), 503, 'Push notifications are not configured.');
        return response()->json(['public_key' => config('webpush.vapid.public_key')]);
    }

    /**
     * Registers, or re-registers, this installation's push endpoint.
     *
     * Keyed on the device rather than the endpoint whenever the browser can give
     * us a device id, because an endpoint is one registration's address, not an
     * identity: pushManager.subscribe() mints a fresh URL every time it is
     * called. Keying on it alone turned every re-subscribe into a second live
     * row, and the member then received one copy of each banner per leftover.
     *
     * The client re-sends on every load, so this is the hot path for keeping a
     * row's endpoint and updated_at current, not just a one-off on opt-in.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'endpoint' => ['required', 'url', 'starts_with:https://', 'max:4000'],
            'keys.p256dh' => ['required', 'string', 'max:500'],
            'keys.auth' => ['required', 'string', 'max:500'],
            'content_encoding' => ['nullable', 'in:aesgcm,aes128gcm'],
            'device_id' => ['nullable', 'string', 'max:64'],
        ]);
        [$type, $id] = $this->recipient($request);
        $hash = hash('sha256', $data['endpoint']);
        $device = $data['device_id'] ?? null;

        $subscription = DB::transaction(function () use ($type, $id, $device, $hash, $data) {
            $existing = $device === null
                ? PushSubscription::where('endpoint_hash', $hash)->first()
                : PushSubscription::where('recipient_type', $type)
                    ->where('recipient_id', $id)->where('device_id', $device)->first();

            // endpoint_hash is unique, so any *other* row already holding this
            // exact endpoint has to go. That is the same browser registered
            // before device ids existed, or under a different account on a
            // shared machine; either way the newest claim on it is the true one,
            // and leaving the old row would fail the insert below.
            PushSubscription::where('endpoint_hash', $hash)
                ->when($existing, fn ($query) => $query->whereKeyNot($existing->getKey()))
                ->delete();

            $attributes = [
                'recipient_type' => $type,
                'recipient_id' => $id,
                'device_id' => $device,
                'endpoint' => $data['endpoint'],
                'endpoint_hash' => $hash,
                'public_key' => $data['keys']['p256dh'],
                'auth_token' => $data['keys']['auth'],
                'content_encoding' => $data['content_encoding'] ?? 'aes128gcm',
            ];

            if ($existing) {
                $existing->update($attributes);

                return $existing;
            }

            return PushSubscription::create($attributes);
        });

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
