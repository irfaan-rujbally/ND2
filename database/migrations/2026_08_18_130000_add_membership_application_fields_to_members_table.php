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
        $columns = [
            'date_of_birth'             => fn (Blueprint $t) => $t->date('date_of_birth')->nullable()->after('age'),
            'national_id'               => fn (Blueprint $t) => $t->string('national_id')->nullable()->after('date_of_birth'),
            'gender'                    => fn (Blueprint $t) => $t->string('gender', 20)->nullable()->after('national_id'),
            'alternative_contact'       => fn (Blueprint $t) => $t->string('alternative_contact')->nullable()->after('phone'),
            'whatsapp_available'        => fn (Blueprint $t) => $t->boolean('whatsapp_available')->default(false)->after('alternative_contact'),
            'profession'                => fn (Blueprint $t) => $t->string('profession')->nullable()->after('address'),
            'employer_name'             => fn (Blueprint $t) => $t->string('employer_name')->nullable()->after('profession'),
            'skills_expertise'          => fn (Blueprint $t) => $t->text('skills_expertise')->nullable()->after('employer_name'),
            // Multi-select answers, stored as JSON arrays.
            'communication_preferences' => fn (Blueprint $t) => $t->json('communication_preferences')->nullable()->after('skills_expertise'),
            'volunteer_interests'       => fn (Blueprint $t) => $t->json('volunteer_interests')->nullable()->after('communication_preferences'),
            'referrer_name'             => fn (Blueprint $t) => $t->string('referrer_name')->nullable()->after('volunteer_interests'),
            'referrer_contact'          => fn (Blueprint $t) => $t->string('referrer_contact')->nullable()->after('referrer_name'),
            'how_heard_about_us'        => fn (Blueprint $t) => $t->string('how_heard_about_us', 50)->nullable()->after('referrer_contact'),
            'cv_path'                   => fn (Blueprint $t) => $t->string('cv_path')->nullable()->after('how_heard_about_us'),
            'documents_path'            => fn (Blueprint $t) => $t->string('documents_path')->nullable()->after('cv_path'),
            'documents_confirmed'       => fn (Blueprint $t) => $t->boolean('documents_confirmed')->default(false)->after('documents_path'),
        ];

        // Only add what is missing, so a re-run or a partially applied migration
        // cannot fail on "column already exists".
        $missing = array_filter(
            $columns,
            fn ($_, $name) => ! Schema::hasColumn('members', $name),
            ARRAY_FILTER_USE_BOTH
        );

        if ($missing === []) {
            return;
        }

        Schema::table('members', function (Blueprint $table) use ($missing) {
            foreach ($missing as $define) {
                $define($table);
            }
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
