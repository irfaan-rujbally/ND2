<?php

namespace App\Rest\Actions;

use App\Support\ActivityNotifier;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Gate;
use Lomkit\Rest\Actions\Action as RestAction;
use Lomkit\Rest\Http\Requests\RestRequest;

/**
 * Accepts membership applications that arrived through the public form.
 *
 * Approval is the only thing standing between a public sign-up and an office's
 * internal forum, so it is an action rather than a writable field: it cannot be
 * reached by a mutate, it authorises per member, and it records who decided.
 *
 * Already-approved members are skipped rather than refused. Approving a
 * selection from a grid will often include one, and re-stamping approved_at
 * would rewrite a decision somebody else made, on a date they did not choose.
 *
 * Rejection is deliberately not here: it is the existing delete, which soft
 * deletes and can be undone. A second, permanent kind of "no" would be a way to
 * lose an application by mis-clicking.
 */
class ApproveMembersAction extends RestAction
{
    public function fields(RestRequest $request): array
    {
        return [];
    }

    public function handle(array $fields, Collection $models)
    {
        $approvedBy = request()->user()?->id;
        $approved = 0;

        foreach ($models as $member) {
            // The same gate that guards editing the member: someone who may not
            // change a record must not be able to admit it either.
            Gate::authorize('update', $member);

            if ($member->isApproved()) {
                continue;
            }

            /*
             * saveQuietly, because Member::updated fires a "Member edited"
             * notification to every member of staff at the office and an
             * approval is not an edit to the record's contents. The applicant is
             * told instead, which is who this concerns.
             */
            $member->forceFill([
                'approved_at' => now(),
                'approved_by' => $approvedBy,
            ])->saveQuietly();

            $approved++;

            ActivityNotifier::member(
                $member->id,
                'membership_approved',
                'Your membership has been approved',
                'You can now sign in to the member portal.',
                '/my',
            );
        }

        return ['approved' => $approved];
    }
}
