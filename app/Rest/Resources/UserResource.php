<?php

namespace App\Rest\Resources;

use Illuminate\Contracts\Database\Eloquent\Builder;
use Lomkit\Rest\Http\Requests\RestRequest;
use Lomkit\Rest\Relations\BelongsTo;

class UserResource extends Resource
{
    public static $model = \App\Models\User::class;

    public function fields(RestRequest $request): array
    {
        return [
            'id',
            'first_name',
            'last_name',
            'email',
            'office_id',
            // Writable so admins can set a password on create/update. Reads are
            // masked by the User model's $hidden, verified against the live API.
            'password',
            'created_at',
            'updated_at',
            'deleted_at',
        ];
    }

    public function relations(RestRequest $request): array
    {
        return [
            BelongsTo::make('office', OfficeResource::class),
        ];
    }

    public function scopes(RestRequest $request): array
    {
        return ['withTrashed', 'onlyTrashed'];
    }

    public function limits(RestRequest $request): array
    {
        return [10, 25, 50, 100];
    }

    public function defaultOrderBy(RestRequest $request): array
    {
        return ['last_name' => 'asc'];
    }

    public function rules(RestRequest $request): array
    {
        return [
            'first_name' => ['required', 'max:25'],
            'last_name'  => ['required', 'max:25'],
            'office_id'  => ['required', 'exists:offices,id'],
        ];
    }

    public function createRules(RestRequest $request): array
    {
        return [
            'email'    => ['required', 'max:50', 'email', 'unique:users,email'],
            'password' => ['required', 'min:8'],
        ];
    }

    public function updateRules(RestRequest $request): array
    {
        return [
            'email'    => ['required', 'max:50', 'email'],
            'password' => ['nullable', 'min:8'],
        ];
    }

    public function searchQuery(RestRequest $request, Builder $query): Builder
    {
        return $query->where('users.office_id', $request->user()->office_id);
    }

    public function mutateQuery(RestRequest $request, Builder $query): Builder
    {
        return $query->where('users.office_id', $request->user()->office_id);
    }

    public function destroyQuery(RestRequest $request, Builder $query): Builder
    {
        return $query->where('users.office_id', $request->user()->office_id);
    }

    public function restoreQuery(RestRequest $request, Builder $query): Builder
    {
        return $query->where('users.office_id', $request->user()->office_id);
    }
}
