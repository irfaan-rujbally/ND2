<?php

namespace App\Rest\Resources;

use App\Models\Incident;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Validation\Rule;
use Lomkit\Rest\Http\Requests\RestRequest;
use Lomkit\Rest\Relations\BelongsTo;

class IncidentResource extends Resource
{
    public static $model = Incident::class;

    public function fields(RestRequest $request): array
    {
        return ['id', 'office_id', 'member_id', 'created_by', 'title', 'description', 'status', 'created_at', 'updated_at', 'deleted_at'];
    }

    public function relations(RestRequest $request): array
    {
        return [
            BelongsTo::make('office', OfficeResource::class),
            BelongsTo::make('member', MemberResource::class),
            BelongsTo::make('author', UserResource::class),
        ];
    }

    public function scopes(RestRequest $request): array { return ['withTrashed', 'onlyTrashed']; }
    public function limits(RestRequest $request): array { return [10, 25, 50, 100]; }
    public function defaultOrderBy(RestRequest $request): array { return ['created_at' => 'desc']; }

    public function rules(RestRequest $request): array
    {
        return [
            'office_id' => ['required', 'exists:offices,id'],
            'member_id' => ['nullable', Rule::exists('members', 'id')->where(fn ($query) => $query->where('office_id', $request->user()->office_id))],
            'title' => ['required', 'string', 'max:150'],
            'description' => ['required', 'string', 'max:10000'],
            'status' => ['required', Rule::in(Incident::STATUSES)],
        ];
    }

    public function searchQuery(RestRequest $request, Builder $query): Builder { return $this->officeQuery($request, $query); }
    public function mutateQuery(RestRequest $request, Builder $query): Builder { return $this->officeQuery($request, $query); }
    public function destroyQuery(RestRequest $request, Builder $query): Builder { return $this->officeQuery($request, $query); }
    public function restoreQuery(RestRequest $request, Builder $query): Builder { return $this->officeQuery($request, $query); }
    public function forceDeleteQuery(RestRequest $request, Builder $query): Builder { return $this->officeQuery($request, $query); }

    private function officeQuery(RestRequest $request, Builder $query): Builder
    {
        return $query->where('incidents.office_id', $request->user()->office_id);
    }
}
