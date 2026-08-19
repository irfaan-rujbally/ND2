<?php

namespace App\Rest\Resources;

use Illuminate\Contracts\Database\Eloquent\Builder;
use Lomkit\Rest\Http\Requests\RestRequest;
use Lomkit\Rest\Relations\BelongsTo;
use Lomkit\Rest\Relations\BelongsToMany;

class MemberResource extends Resource
{
    public static $model = \App\Models\Member::class;

    public function fields(RestRequest $request): array
    {
        return [
            'id',
            // Needed by the admin UI to render each member's QR badge.
            'qr_token',
            'first_name',
            'last_name',
            'phone',
            'alternative_contact',
            'whatsapp_available',
            'age',
            'date_of_birth',
            'national_id',
            'gender',
            'constituency',
            'email',
            'address',
            'profession',
            'employer_name',
            'skills_expertise',
            'communication_preferences',
            'volunteer_interests',
            'referrer_name',
            'referrer_contact',
            'how_heard_about_us',
            'cv_path',
            'documents_path',
            'documents_confirmed',
            'office_id',
            'created_at',
            'updated_at',
            'deleted_at',
        ];
    }

    public function relations(RestRequest $request): array
    {
        return [
            BelongsTo::make('office', OfficeResource::class),
            BelongsToMany::make('meetings', MeetingResource::class),
        ];
    }

    public function scopes(RestRequest $request): array
    {
        return ['withTrashed', 'onlyTrashed', 'orderByAttendanceAddedAt'];
    }

    public function limits(RestRequest $request): array
    {
        return [10, 25, 50, 100];
    }

    public function defaultOrderBy(RestRequest $request): array
    {
        return ['first_name' => 'asc'];
    }

    /**
     * Constituencies are the 21 Mauritian electoral constituencies. Rodrigues is
     * No. 21, which is why the numeric column still fits every option offered by
     * the public application form.
     */
    public const CONSTITUENCY_MIN = 1;
    public const CONSTITUENCY_MAX = 21;

    public const GENDERS = ['Male', 'Female'];

    public const COMMUNICATION_METHODS = ['Email', 'SMS', 'WhatsApp'];

    public const VOLUNTEER_INTERESTS = [
        'Community Outreach',
        'Event Organisation',
        'Public Speaking',
        'Administrative Support',
        'Fundraising',
        'Digital Campaigns (Social Media/Website Management)',
    ];

    public const HEARD_ABOUT_US = ['Social Media', 'Word of Mouth', 'Website', 'News Media'];

    /**
     * Rules common to create and update.
     */
    public function rules(RestRequest $request): array
    {
        return [
            'office_id'                   => ['required', 'exists:offices,id'],
            'phone'                       => ['nullable', 'max:50'],
            'alternative_contact'         => ['nullable', 'max:50'],
            'whatsapp_available'          => ['nullable', 'boolean'],
            'age'                         => ['nullable', 'max:50'],
            'date_of_birth'               => ['nullable', 'date', 'before:today'],
            'national_id'                 => ['nullable', 'max:50'],
            'gender'                      => ['nullable', 'in:'.implode(',', self::GENDERS)],
            'address'                     => ['nullable', 'max:250'],
            'employer_name'               => ['nullable', 'max:255'],
            'skills_expertise'            => ['nullable', 'max:2000'],
            'communication_preferences'   => ['nullable', 'array'],
            'communication_preferences.*' => ['in:'.implode(',', self::COMMUNICATION_METHODS)],
            'volunteer_interests'         => ['nullable', 'array'],
            'volunteer_interests.*'       => ['in:'.implode(',', self::VOLUNTEER_INTERESTS)],
            'referrer_name'               => ['nullable', 'max:255'],
            'referrer_contact'            => ['nullable', 'max:50'],
            'how_heard_about_us'          => ['nullable', 'in:'.implode(',', self::HEARD_ABOUT_US)],
            'cv_path'                     => ['nullable', 'string', 'max:255'],
            'documents_path'              => ['nullable', 'string', 'max:255'],
            'documents_confirmed'         => ['nullable', 'boolean'],
        ];
    }

    /**
     * Creating a member mirrors what the public application form demands, so a
     * record captured by an administrator carries the same information as one
     * submitted online.
     */
    public function createRules(RestRequest $request): array
    {
        return [
            'first_name'          => ['required', 'max:50'],
            'last_name'           => ['required', 'max:50'],
            'email'               => ['required', 'max:50', 'email'],
            'phone'               => ['required', 'max:50'],
            'address'             => ['required', 'max:250'],
            'date_of_birth'       => ['required', 'date', 'before:today'],
            'national_id'         => ['required', 'max:50'],
            'gender'              => ['required', 'in:'.implode(',', self::GENDERS)],
            'profession'          => ['required', 'max:255'],
            'constituency'        => [
                'required', 'integer',
                'between:'.self::CONSTITUENCY_MIN.','.self::CONSTITUENCY_MAX,
            ],
            'documents_path'      => ['required', 'string', 'max:255'],
            'documents_confirmed' => ['accepted'],
        ];
    }

    /**
     * Updating stays lenient: the 508 members imported before these fields
     * existed would otherwise be impossible to edit until every one of them was
     * back-filled.
     */
    public function updateRules(RestRequest $request): array
    {
        return [
            'first_name'   => ['required', 'max:50'],
            'last_name'    => ['required', 'max:50'],
            'email'        => ['nullable', 'max:50', 'email'],
            'profession'   => ['nullable', 'max:255'],
            'constituency' => [
                'required', 'integer',
                'between:'.self::CONSTITUENCY_MIN.','.self::CONSTITUENCY_MAX,
            ],
        ];
    }

    /**
     * Tenant scoping: a user only ever reads members of their own office.
     */
    public function searchQuery(RestRequest $request, Builder $query): Builder
    {
        return $query->where('members.office_id', $request->user()->office_id);
    }

    public function mutateQuery(RestRequest $request, Builder $query): Builder
    {
        return $query->where('members.office_id', $request->user()->office_id);
    }

    public function destroyQuery(RestRequest $request, Builder $query): Builder
    {
        return $query->where('members.office_id', $request->user()->office_id);
    }

    public function restoreQuery(RestRequest $request, Builder $query): Builder
    {
        return $query->where('members.office_id', $request->user()->office_id);
    }

    public function forceDeleteQuery(RestRequest $request, Builder $query): Builder
    {
        return $query->where('members.office_id', $request->user()->office_id);
    }
}
