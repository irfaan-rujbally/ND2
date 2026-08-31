<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Office;
use App\Models\Poll;
use App\Models\PollVote;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Covers the poll feature end to end: the office writes a question, members
 * answer it, and the office closes it and reads the result.
 *
 * The risk here is not the counting, it is the ballot. Two things must hold
 * whatever else changes: no response may ever pair a member with the option they
 * chose, and no member may answer another office's poll or vote twice.
 */
class PollTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Office $office;

    private Office $otherOffice;

    protected function setUp(): void
    {
        parent::setUp();

        Role::create(['name' => 'admin', 'guard_name' => 'web']);

        $this->office = Office::create(['name' => 'Bonne Terre']);
        $this->otherOffice = Office::create(['name' => 'Rodrigues']);

        $this->admin = new User();
        $this->admin->first_name = 'Ops';
        $this->admin->last_name = 'Admin';
        $this->admin->email = 'admin@example.com';
        $this->admin->password = 'secret';
        $this->admin->office_id = $this->office->id;
        $this->admin->save();

        $this->admin->assignRole('admin');
    }

    private function member(string $first, ?Office $office = null): Member
    {
        return Member::create([
            'first_name'  => $first,
            'last_name'   => 'Test',
            'office_id'   => ($office ?? $this->office)->id,
            'approved_at' => now(),
        ]);
    }

    /**
     * Switches the test to a member's portal token.
     *
     * forgetGuards is what makes it a switch rather than a no-op: Sanctum's
     * actingAs puts the resolved user on the guard instance, and until that
     * instance is dropped every later request is still the administrator
     * however many bearer tokens the header carries.
     */
    private function asMember(Member $member): self
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($member->createToken('test', [Member::PORTAL_ABILITY])->plainTextToken);
    }

    private function asAdmin(): self
    {
        Sanctum::actingAs($this->admin);

        return $this;
    }

    private function createPoll(array $overrides = []): array
    {
        return $this->asAdmin()->postJson('/api/polls', [
            'title'   => 'Should we contest the by-election?',
            'options' => ['Yes', 'No', 'Undecided'],
            ...$overrides,
        ])->assertCreated()->json('data');
    }

    public function test_staff_create_a_poll_and_members_answer_it(): void
    {
        $poll = $this->createPoll();

        $this->assertSame('open', $poll['status']);
        $this->assertCount(3, $poll['options']);
        $this->assertFalse($poll['allows_multiple']);

        $yes = $poll['options'][0]['id'];
        $no = $poll['options'][1]['id'];

        $alice = $this->member('Alice');
        $bob = $this->member('Bob');
        $this->member('Carol');

        $this->asMember($alice)
            ->postJson("/api/member/polls/{$poll['id']}/vote", ['option_ids' => [$yes]])
            ->assertCreated()
            ->assertJsonPath('data.has_voted', true)
            ->assertJsonPath('data.my_option_ids.0', $yes);

        $this->asMember($bob)
            ->postJson("/api/member/polls/{$poll['id']}/vote", ['option_ids' => [$no]])
            ->assertCreated();

        $results = $this->asAdmin()->getJson("/api/polls/{$poll['id']}")->assertOk()->json('data.results');

        $this->assertSame(1, $results['options'][0]['votes']);
        $this->assertSame(1, $results['options'][1]['votes']);
        $this->assertSame(0, $results['options'][2]['votes']);
        $this->assertSame(2, $results['voter_count']);
        // Three approved members in the office, two of whom answered.
        $this->assertSame(3, $results['eligible_count']);
        $this->assertSame(66.7, $results['turnout']);
    }

    public function test_a_member_changing_their_answer_replaces_it_rather_than_adding_to_it(): void
    {
        $poll = $this->createPoll();
        $alice = $this->member('Alice');

        $this->asMember($alice)
            ->postJson("/api/member/polls/{$poll['id']}/vote", ['option_ids' => [$poll['options'][0]['id']]])
            ->assertCreated();

        $this->asMember($alice)
            ->postJson("/api/member/polls/{$poll['id']}/vote", ['option_ids' => [$poll['options'][1]['id']]])
            ->assertCreated()
            ->assertJsonPath('data.results.options.0.votes', 0)
            ->assertJsonPath('data.results.options.1.votes', 1)
            ->assertJsonPath('data.results.voter_count', 1);

        $this->assertSame(1, PollVote::where('member_id', $alice->id)->count());
    }

    public function test_a_single_choice_poll_refuses_two_answers_and_a_multiple_choice_one_accepts_them(): void
    {
        $single = $this->createPoll();
        $alice = $this->member('Alice');

        $this->asMember($alice)
            ->postJson("/api/member/polls/{$single['id']}/vote", [
                'option_ids' => [$single['options'][0]['id'], $single['options'][1]['id']],
            ])
            ->assertStatus(422);

        $this->assertSame(0, PollVote::count());

        $multiple = $this->createPoll(['title' => 'Which days suit you?', 'allows_multiple' => true]);

        $this->asMember($alice)
            ->postJson("/api/member/polls/{$multiple['id']}/vote", [
                'option_ids' => [$multiple['options'][0]['id'], $multiple['options'][1]['id']],
            ])
            ->assertCreated()
            // Two votes from one member: the tally counts both, the turnout
            // counts the member once.
            ->assertJsonPath('data.results.total_votes', 2)
            ->assertJsonPath('data.results.voter_count', 1);
    }

    public function test_a_poll_may_carry_no_more_than_ten_answers(): void
    {
        $this->asAdmin();

        $this->postJson('/api/polls', [
            'title'   => 'Too many',
            'options' => array_map(fn ($n) => "Option {$n}", range(1, 11)),
        ])->assertStatus(422)->assertJsonValidationErrors('options');

        $this->postJson('/api/polls', [
            'title'   => 'Too few',
            'options' => ['Only one'],
        ])->assertStatus(422)->assertJsonValidationErrors('options');
    }

    public function test_a_closed_poll_stops_taking_votes(): void
    {
        $poll = $this->createPoll();
        $alice = $this->member('Alice');

        $this->asAdmin()
            ->postJson("/api/polls/{$poll['id']}/close")
            ->assertOk()
            ->assertJsonPath('data.status', 'closed');

        $this->asMember($alice)
            ->postJson("/api/member/polls/{$poll['id']}/vote", ['option_ids' => [$poll['options'][0]['id']]])
            ->assertStatus(422);

        $this->assertSame(0, PollVote::count());
    }

    public function test_a_poll_shuts_itself_when_its_deadline_passes(): void
    {
        $poll = $this->createPoll(['closes_at' => now()->addHour()->toIso8601String()]);
        $alice = $this->member('Alice');

        Poll::whereKey($poll['id'])->update(['closes_at' => now()->subMinute()]);

        $this->asMember($alice)
            ->postJson("/api/member/polls/{$poll['id']}/vote", ['option_ids' => [$poll['options'][0]['id']]])
            ->assertStatus(422);

        // 'expired', not 'closed': nobody pressed the button, and the office may
        // still want to close it formally.
        $this->asAdmin()->getJson("/api/polls/{$poll['id']}")->assertJsonPath('data.status', 'expired');
    }

    public function test_no_staff_endpoint_reveals_which_option_a_member_chose(): void
    {
        $poll = $this->createPoll();
        $alice = $this->member('Alice');

        $this->asMember($alice)
            ->postJson("/api/member/polls/{$poll['id']}/vote", ['option_ids' => [$poll['options'][0]['id']]])
            ->assertCreated();

        $this->asAdmin();

        $detail = $this->getJson("/api/polls/{$poll['id']}")->assertOk();
        $detail->assertJsonMissingPath('data.votes');
        $this->assertStringNotContainsString('Alice', $detail->getContent());

        $participation = $this->getJson("/api/polls/{$poll['id']}/participation")->assertOk();

        // The name is here, because chasing the members who have not answered
        // needs it...
        $participation->assertJsonPath('data.0.name', 'Alice Test')
            ->assertJsonPath('data.0.has_voted', true)
            ->assertJsonPath('meta.voted', 1);

        // ...and the answer is not, on this or any other row.
        foreach ($participation->json('data') as $row) {
            $this->assertSame(['id', 'name', 'has_voted', 'answered_at'], array_keys($row));
        }
    }

    public function test_a_member_cannot_reach_another_office_poll_or_borrow_its_options(): void
    {
        $poll = $this->createPoll();
        $outsider = $this->member('Outsider', $this->otherOffice);

        $this->asMember($outsider)
            ->postJson("/api/member/polls/{$poll['id']}/vote", ['option_ids' => [$poll['options'][0]['id']]])
            ->assertNotFound();

        $this->getJson('/api/member/polls')->assertOk()->assertJsonCount(0, 'data');

        // An option id from another poll is refused rather than counted against
        // the poll it was sent to.
        $other = $this->createPoll(['title' => 'A different question']);
        $alice = $this->member('Alice');

        $this->asMember($alice)
            ->postJson("/api/member/polls/{$poll['id']}/vote", ['option_ids' => [$other['options'][0]['id']]])
            ->assertStatus(422);

        $this->assertSame(0, PollVote::count());
    }

    public function test_an_administrator_of_another_office_cannot_read_or_close_the_poll(): void
    {
        $poll = $this->createPoll();

        $outsider = new User();
        $outsider->first_name = 'Other';
        $outsider->last_name = 'Admin';
        $outsider->email = 'other@example.com';
        $outsider->password = 'secret';
        $outsider->office_id = $this->otherOffice->id;
        $outsider->save();
        $outsider->assignRole('admin');

        Sanctum::actingAs($outsider);

        $this->getJson("/api/polls/{$poll['id']}")->assertForbidden();
        $this->postJson("/api/polls/{$poll['id']}/close")->assertForbidden();
        $this->getJson('/api/polls')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_the_answers_are_frozen_once_somebody_has_voted(): void
    {
        $poll = $this->createPoll();
        $alice = $this->member('Alice');

        // Before any vote, the ballot can still be rewritten.
        $this->asAdmin()->patchJson("/api/polls/{$poll['id']}", [
            'title'   => 'Should we contest the by-election?',
            'options' => ['Yes', 'No'],
        ])->assertOk()->assertJsonCount(2, 'data.options');

        $rewritten = $this->getJson("/api/polls/{$poll['id']}")->json('data');

        $this->asMember($alice)
            ->postJson("/api/member/polls/{$poll['id']}/vote", ['option_ids' => [$rewritten['options'][0]['id']]])
            ->assertCreated();

        $this->asAdmin()->patchJson("/api/polls/{$poll['id']}", [
            'title'   => 'Should we contest the by-election?',
            'options' => ['Yes', 'No', 'Maybe'],
        ])->assertStatus(422);

        // The wording alone still moves.
        $this->patchJson("/api/polls/{$poll['id']}", ['title' => 'Contest the by-election?'])
            ->assertOk()
            ->assertJsonPath('data.title', 'Contest the by-election?')
            ->assertJsonCount(2, 'data.options');
    }

    public function test_a_member_sees_the_tallies_only_after_answering(): void
    {
        $poll = $this->createPoll();
        $alice = $this->member('Alice');

        $this->asMember($alice)->getJson('/api/member/polls')
            ->assertOk()
            ->assertJsonPath('data.0.has_voted', false)
            ->assertJsonMissingPath('data.0.results');

        $this->asMember($alice)
            ->postJson("/api/member/polls/{$poll['id']}/vote", ['option_ids' => [$poll['options'][0]['id']]])
            ->assertCreated();

        $this->asMember($alice)->getJson('/api/member/polls')
            ->assertOk()
            ->assertJsonPath('data.0.results.options.0.votes', 1);
    }
}
