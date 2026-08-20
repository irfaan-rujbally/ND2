<?php

namespace App\Http\Middleware;

use App\Models\Member;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Guarantees a member portal route is answering an actual Member.
 *
 * The ability gate on the route already turns away member tokens at staff
 * endpoints. This closes the other direction: a staff token is minted with '*',
 * which satisfies every ability check including the member one, so without this
 * a staff token would reach these controllers and they would treat a User as the
 * signed-in member -- reading $member->qr_token off the wrong table.
 *
 * Failing closed with 403 rather than adapting: staff already have the full API,
 * and the portal is not another way in.
 */
class EnsureMemberPortalToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user instanceof Member) {
            return response()->json([
                'message' => 'This endpoint serves the member portal and requires a member sign-in.',
            ], 403);
        }

        if (! $user->tokenCan(Member::PORTAL_ABILITY)) {
            return response()->json([
                'message' => 'This token is not valid for the member portal.',
            ], 403);
        }

        return $next($request);
    }
}
