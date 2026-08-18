<?php

namespace App\Rest\Resources;

use Lomkit\Rest\Http\Requests\RestRequest;

class OfficeResource extends Resource
{
    public static $model = \App\Models\Office::class;

    public function fields(RestRequest $request): array
    {
        return [
            'id',
            'name',
        ];
    }

    public function relations(RestRequest $request): array
    {
        return [];
    }

    public function scopes(RestRequest $request): array
    {
        return [];
    }

    public function limits(RestRequest $request): array
    {
        return [10, 25, 50, 100];
    }

    public function defaultOrderBy(RestRequest $request): array
    {
        return ['name' => 'asc'];
    }
}
