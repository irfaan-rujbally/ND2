<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use Illuminate\Http\JsonResponse;

class DepartmentsController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'data' => Department::query()->orderBy('sort_order')->get(['id', 'name']),
        ]);
    }
}
