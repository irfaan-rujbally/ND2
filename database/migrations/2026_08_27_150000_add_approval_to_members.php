<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Marks which members the office has vetted, so that public sign-ups can exist
 * in the register without being able to sign in.
 *
 * `approved_at` null means "applied, not yet accepted". Such a member is a real
 * row -- the office needs to see and act on the application -- but the portal
 * refuses their sign-in, which is what stops a stranger reaching an office's
 * internal forum simply by filling in a form.
 *
 * `self_registered_at` records that the row arrived through the public form
 * rather than from an administrator. Kept separate from approval because the two
 * facts answer different questions: one is "did we accept them", the other is
 * "where did this record come from", and the second stays true after approval.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('members', function (Blueprint $table) {
            $table->timestamp('approved_at')->nullable()->after('password_set_at');
            $table->unsignedBigInteger('approved_by')->nullable()->after('approved_at');
            $table->timestamp('self_registered_at')->nullable()->after('approved_by');

            $table->index('approved_at', 'members_approved_at_index');
        });

        /*
         * Every member already in the register was entered by an administrator,
         * which is the approval. Without this back-fill the new sign-in guard
         * would lock out the entire existing membership on deploy -- the whole
         * register at once -- which is the one way this migration could do real
         * damage.
         *
         * created_at in preference to now(), because the approval happened when
         * the office entered them and dating it to the deploy would make the
         * column lie. But it is COALESCEd, and that is not defensive
         * boilerplate: 64 of the members imported before this application
         * existed have a null created_at, and `approved_at = created_at` alone
         * left every one of them null -- which is to say locked out.
         *
         * Soft-deleted rows are included on purpose. DB::table bypasses the
         * model scope, and a member the office removed should still work if they
         * are ever restored.
         */
        DB::table('members')->whereNull('approved_at')->update([
            'approved_at' => DB::raw('COALESCE(created_at, updated_at, CURRENT_TIMESTAMP)'),
        ]);
    }

    public function down(): void
    {
        Schema::table('members', function (Blueprint $table) {
            $table->dropIndex('members_approved_at_index');
            $table->dropColumn(['approved_at', 'approved_by', 'self_registered_at']);
        });
    }
};
