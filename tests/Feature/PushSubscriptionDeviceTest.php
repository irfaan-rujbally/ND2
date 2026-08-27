<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Office;
use App\Models\PushSubscription;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PushSubscriptionDeviceTest extends TestCase
{
    use RefreshDatabase;

    private function payload(string $endpoint, ?string $device): array
    {
        return array_filter([
            'endpoint' => $endpoint,
            'keys' => ['p256dh' => 'key-'.md5($endpoint), 'auth' => 'auth-'.md5($endpoint)],
            'content_encoding' => 'aes128gcm',
            'device_id' => $device,
        ], fn ($value) => $value !== null);
    }

    private function member(): array
    {
        $office = Office::create(['name' => 'Central']);
        $member = Member::create(['first_name' => 'Alice', 'last_name' => 'Member', 'office_id' => $office->id]);

        return [$member, $member->createToken('test', [Member::PORTAL_ABILITY])->plainTextToken];
    }

    public function test_resubscribing_from_the_same_device_replaces_its_row(): void
    {
        [$member, $token] = $this->member();

        // Every subscribe() mints a new endpoint, which is exactly how the
        // duplicates arose: same phone, three URLs, three rows.
        $this->withToken($token)->postJson('/api/member/push/subscriptions', $this->payload('https://web.push.apple.com/AAA', 'device-1'))->assertCreated();
        $this->withToken($token)->postJson('/api/member/push/subscriptions', $this->payload('https://web.push.apple.com/BBB', 'device-1'))->assertCreated();
        $this->withToken($token)->postJson('/api/member/push/subscriptions', $this->payload('https://web.push.apple.com/CCC', 'device-1'))->assertCreated();

        $rows = PushSubscription::where('recipient_type', 'member')->where('recipient_id', $member->id)->get();
        $this->assertCount(1, $rows);
        $this->assertSame('https://web.push.apple.com/CCC', $rows->first()->endpoint);
    }

    public function test_a_second_device_gets_its_own_row(): void
    {
        [$member, $token] = $this->member();

        $this->withToken($token)->postJson('/api/member/push/subscriptions', $this->payload('https://web.push.apple.com/PHONE', 'device-1'))->assertCreated();
        $this->withToken($token)->postJson('/api/member/push/subscriptions', $this->payload('https://web.push.apple.com/TABLET', 'device-2'))->assertCreated();

        $this->assertSame(2, PushSubscription::where('recipient_id', $member->id)->count());
    }

    public function test_an_endpoint_already_held_by_an_older_row_is_taken_over(): void
    {
        [$member, $token] = $this->member();

        // A row written before device ids existed: keyed on the endpoint alone.
        $legacy = PushSubscription::create([
            'recipient_type' => 'member',
            'recipient_id' => $member->id,
            'device_id' => null,
            'endpoint' => 'https://web.push.apple.com/AAA',
            'endpoint_hash' => hash('sha256', 'https://web.push.apple.com/AAA'),
            'public_key' => 'old', 'auth_token' => 'old', 'content_encoding' => 'aesgcm',
        ]);

        // The same browser now identifies itself. endpoint_hash is unique, so
        // this has to displace the legacy row rather than collide with it.
        $this->withToken($token)->postJson('/api/member/push/subscriptions', $this->payload('https://web.push.apple.com/AAA', 'device-1'))->assertCreated();

        $this->assertDatabaseMissing('push_subscriptions', ['id' => $legacy->id]);
        $rows = PushSubscription::where('recipient_id', $member->id)->get();
        $this->assertCount(1, $rows);
        $this->assertSame('device-1', $rows->first()->device_id);
    }

    public function test_a_client_that_cannot_supply_a_device_id_still_registers(): void
    {
        [$member, $token] = $this->member();

        $this->withToken($token)->postJson('/api/member/push/subscriptions', $this->payload('https://web.push.apple.com/AAA', null))->assertCreated();
        $this->withToken($token)->postJson('/api/member/push/subscriptions', $this->payload('https://web.push.apple.com/AAA', null))->assertCreated();

        // Keyed on the endpoint, as before device ids: repeats of the same
        // endpoint update rather than duplicate.
        $this->assertSame(1, PushSubscription::where('recipient_id', $member->id)->count());
    }
}
