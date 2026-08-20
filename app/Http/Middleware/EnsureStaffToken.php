<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Keeps the staff API to members of staff.
 *
 * Members authenticate through the same Sanctum guard as users, so `auth:sanctum`
 * alone is satisfied by a member portal token. This is what makes the staff
 * routes refuse it.
 *
 * Written as "must be a User" rather than "must hold the staff ability" on
 * purpose. Requiring an ability would have meant every staff token needed one,
 * including the ones already issued and the ones Sanctum::actingAs fabricates in
 * the existing test suites -- so the gate would have depended on how each caller
 * happened to mint its token. Identity is not negotiable in that way: a Member is
 * never staff, whatever abilities its token claims.
 *
 * Roles and permissions are still the policies' business; this only settles which
 * table the caller came from.
 */
class EnsureStaffToken
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user() instanceof User) {
            return response()->json([
                'message' => 'This endpoint is for party administrators. Members should use the member portal.',
            ], 403);
        }

        return $next($request);
    }
}
