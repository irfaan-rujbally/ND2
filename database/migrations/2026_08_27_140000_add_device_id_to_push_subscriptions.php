<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Identifies the installation a subscription came from, so a device that
 * re-subscribes replaces its own row instead of adding another.
 *
 * Every call to pushManager.subscribe() mints a brand new endpoint URL, so an
 * endpoint is not an identity -- it is one registration's address. Keying only
 * on it meant a re-granted permission, a replaced service worker, or a toggle
 * whose delete never reached the server each left a live row behind, and the
 * member collected one copy of every banner per leftover.
 *
 * Nullable because the browser cannot always give us one (blocked storage, a
 * private window), and because rows written before this migration have none.
 * MySQL permits repeated NULLs in a unique index, so those rows neither collide
 * with each other nor block the constraint below.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('push_subscriptions', function (Blueprint $table) {
            $table->string('device_id', 64)->nullable()->after('recipient_id');
            $table->unique(['recipient_type', 'recipient_id', 'device_id'], 'push_subscriptions_device_unique');
        });
    }

    public function down(): void
    {
        Schema::table('push_subscriptions', function (Blueprint $table) {
            $table->dropUnique('push_subscriptions_device_unique');
            $table->dropColumn('device_id');
        });
    }
};
