<?php

namespace App\Rest\Resources;

use App\Models\Department;
use Lomkit\Rest\Http\Requests\RestRequest;

class DepartmentResource extends Resource
{
    public static $model = Department::class;

    public function fields(RestRequest $request): array
    {
        return ['id', 'name'];
    }
}
