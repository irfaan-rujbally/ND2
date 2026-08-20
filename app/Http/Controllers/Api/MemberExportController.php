<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Member;
use App\Support\Xlsx;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

/**
 * Spreadsheet export of the members list.
 *
 * lomkit/laravel-rest-api speaks JSON only, so a binary download gets its own
 * endpoint — the same reasoning as MemberDocumentController.
 *
 * The export deliberately answers with *every* row matching the current
 * filters, not the page being viewed: someone exporting a constituency wants
 * that whole constituency, not the ten rows on screen.
 */
class MemberExportController extends Controller
{
    /**
     * Column heading => [width in characters, value resolver].
     *
     * One list drives the header row, the widths and the cells, so a column can
     * never end up in the wrong place.
     *
     * @var array<string, array{int, callable(Member): mixed}>
     */
    private function columns(): array
    {
        return [
            'ID'                 => [8,  fn (Member $m) => $m->id],
            'First name'         => [18, fn (Member $m) => $m->first_name],
            'Last name'          => [18, fn (Member $m) => $m->last_name],
            'Date of birth'      => [14, fn (Member $m) => $m->date_of_birth],
            'Age group'          => [12, fn (Member $m) => $m->age],
            'Gender'             => [10, fn (Member $m) => $m->gender],
            'National ID'        => [18, fn (Member $m) => $m->national_id],
            'Mobile'             => [16, fn (Member $m) => $m->phone],
            'On WhatsApp'        => [12, fn (Member $m) => $m->whatsapp_available],
            'Alternative contact' => [18, fn (Member $m) => $m->alternative_contact],
            'Email'              => [30, fn (Member $m) => $m->email],
            'Address'            => [36, fn (Member $m) => $m->address],
            'Constituency'       => [13, fn (Member $m) => $m->constituency],
            'Office'             => [18, fn (Member $m) => $m->office?->name],
            'Profession'         => [22, fn (Member $m) => $m->profession],
            'Employer'           => [22, fn (Member $m) => $m->employer_name],
            'Skills / expertise' => [30, fn (Member $m) => $m->skills_expertise],
            'Communication'      => [22, fn (Member $m) => $this->list($m->communication_preferences)],
            'Volunteer interests' => [30, fn (Member $m) => $this->list($m->volunteer_interests)],
            'Referred by'        => [20, fn (Member $m) => $m->referrer_name],
            'Referrer contact'   => [18, fn (Member $m) => $m->referrer_contact],
            'Heard about us'     => [18, fn (Member $m) => $m->how_heard_about_us],
            'Documents confirmed' => [18, fn (Member $m) => $m->documents_confirmed],
            'Meetings attended'  => [16, fn (Member $m) => $m->meetings_count],
            'Registered'         => [14, fn (Member $m) => $m->created_at],
        ];
    }

    public function __invoke(Request $request): Response
    {
        Gate::authorize('viewAny', Member::class);

        $validated = $request->validate([
            'search'       => ['nullable', 'string', 'max:100'],
            'constituency' => ['nullable', 'integer', 'between:1,21'],
            // 'attendance' is not a column: it is the meetings count, which is
            // what the list's Attendance column sorts by. Kept in step with the
            // sortable headings in MembersList.jsx.
            'sort'         => ['nullable', 'string', 'in:first_name,last_name,email,phone,constituency,attendance'],
            'direction'    => ['nullable', 'string', 'in:asc,desc'],
        ]);

        $columns = $this->columns();

        // Tenanting is not optional here: this endpoint sits outside the Lomkit
        // resource, so it must apply the same office scope MemberResource does.
        $members = Member::query()
            ->where('members.office_id', $request->user()->office_id)
            ->filter([
                'search'       => $validated['search'] ?? null,
                'constituency' => $validated['constituency'] ?? null,
            ])
            ->with('office')
            ->withCount('meetings')
            ->when(
                ($validated['sort'] ?? null) === 'attendance',
                fn ($q) => $q->orderByMeetingsCount($validated['direction'] ?? 'asc'),
                fn ($q) => $q->orderBy($validated['sort'] ?? 'first_name', $validated['direction'] ?? 'asc'),
            )
            ->get();

        $rows = $members->map(
            fn (Member $member) => array_map(fn (array $column) => $column[1]($member), array_values($columns))
        );

        $xlsx = new Xlsx(
            headers: array_keys($columns),
            rows: $rows,
            sheetName: 'Members',
            widths: array_map(fn (array $column) => $column[0], array_values($columns)),
        );

        return response($xlsx->toString(), 200, [
            'Content-Type'        => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => 'attachment; filename="'.$this->filename().'"',
        ]);
    }

    /** Multi-select answers are stored as JSON; a spreadsheet wants one cell. */
    private function list(mixed $value): ?string
    {
        return filled($value) && is_array($value) ? implode(', ', $value) : null;
    }

    private function filename(): string
    {
        return 'members-'.now()->format('Y-m-d').'.xlsx';
    }
}
