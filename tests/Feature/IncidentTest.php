<?php

namespace Tests\Feature;

use App\Models\Incident;
use App\Models\Member;
use App\Models\Office;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IncidentTest extends TestCase
{
    use RefreshDatabase;

    public function test_member_can_create_and_only_list_their_own_incidents(): void
    {
        $office = Office::create(['name' => 'Central']);
        $member = Member::create(['first_name' => 'Alice', 'last_name' => 'Member', 'office_id' => $office->id]);
        $other = Member::create(['first_name' => 'Bob', 'last_name' => 'Member', 'office_id' => $office->id]);
        Incident::create(['office_id' => $office->id, 'member_id' => $other->id, 'title' => 'Other', 'description' => 'Hidden', 'status' => 'open']);
        $token = $member->createToken('test', [Member::PORTAL_ABILITY])->plainTextToken;

        $this->withToken($token)->postJson('/api/member/incidents', [
            'title' => 'Street light',
            'description' => 'The light is not working.',
            'status' => 'closed',
            'member_id' => $other->id,
        ])->assertCreated()->assertJsonPath('data.status', 'open')->assertJsonPath('data.member_id', $member->id);

        $this->withToken($token)->getJson('/api/member/incidents')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Street light');

        $ownIncident = Incident::where('member_id', $member->id)->firstOrFail();
        $otherIncident = Incident::where('member_id', $other->id)->firstOrFail();

        $this->withToken($token)->postJson("/api/member/incidents/{$ownIncident->id}/comments", [
            'body' => 'Could you please provide an update?',
        ])->assertCreated()
            ->assertJsonPath('data.0.author_type', 'member')
            ->assertJsonPath('data.0.author_name', 'Alice Member');

        $this->withToken($token)->getJson("/api/member/incidents/{$otherIncident->id}/comments")
            ->assertNotFound();
    }
}
