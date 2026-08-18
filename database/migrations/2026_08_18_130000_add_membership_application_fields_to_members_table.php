<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Brings the members table up to the field set collected by the public
 * membership application at https://nouveauxdemocrates.com/join.
 *
 * Every column is nullable or defaulted, so the 508 existing members are
 * untouched and stay valid. Nothing is renamed or dropped: `age` keeps the
 * age-range values 89 members already have, alongside the new date_of_birth.
 *
 * Identity documents are referenced by path only. The files live outside the
 * public directory and are served through an authenticated endpoint, since they
 * are national ID and birth certificate scans.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('members', function (Blueprint $table) {
            $table->date('date_of_birth')->nullable()->after('age');
            $table->string('national_id')->nullable()->after('date_of_birth');
            $table->string('gender', 20)->nullable()->after('national_id');

            $table->string('alternative_contact')->nullable()->after('phone');
            $table->boolean('whatsapp_available')->default(false)->after('alternative_contact');

            $table->string('profession')->nullable()->after('address');
            $table->string('employer_name')->nullable()->after('profession');
            $table->text('skills_expertise')->nullable()->after('employer_name');

            // Multi-select answers, stored as JSON arrays.
            $table->json('communication_preferences')->nullable()->after('skills_expertise');
            $table->json('volunteer_interests')->nullable()->after('communication_preferences');

            $table->string('referrer_name')->nullable()->after('volunteer_interests');
            $table->string('referrer_contact')->nullable()->after('referrer_name');

            $table->string('how_heard_about_us', 50)->nullable()->after('referrer_contact');

            $table->string('cv_path')->nullable()->after('how_heard_about_us');
            $table->string('documents_path')->nullable()->after('cv_path');
            $table->boolean('documents_confirmed')->default(false)->after('documents_path');
        });
    }

    public function down(): void
    {
        Schema::table('members', function (Blueprint $table) {
            $table->dropColumn([
                'date_of_birth',
                'national_id',
                'gender',
                'alternative_contact',
                'whatsapp_available',
                'profession',
                'employer_name',
                'skills_expertise',
                'communication_preferences',
                'volunteer_interests',
                'referrer_name',
                'referrer_contact',
                'how_heard_about_us',
                'cv_path',
                'documents_path',
                'documents_confirmed',
            ]);
        });
    }
};
