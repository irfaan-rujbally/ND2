<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('departments', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->unsignedSmallInteger('sort_order')->unique();
        });

        $departments = [
            'Prime Minister’s Office',
            'Ministry of Defence, Home Affairs and External Communications',
            'Ministry of Finance',
            'Ministry of Rodrigues and Outer Islands',
            'Ministry of Housing and Lands',
            'Ministry of Environment, Solid Waste Management and Climate Change',
            'Ministry of Agro-Industry, Food Security, Blue Economy and Fisheries',
            'Ministry of National Infrastructure',
            'Ministry of Health and Wellness',
            'Ministry of Tourism',
            'Ministry of Social Integration, Social Security and National Solidarity',
            'Ministry of Financial Services and Economic Planning',
            'Ministry of Energy and Public Utilities',
            'Ministry of Foreign Affairs, Regional Integration and International Trade',
            'Ministry of Youth and Sports',
            'Ministry of Labour and Industrial Relations',
            'Ministry of Land Transport',
            'Ministry of Gender Equality and Family Welfare',
            'Ministry of Commerce and Consumer Protection',
            'Ministry of Tertiary Education, Science and Research',
            'Ministry of Industry, SME and Cooperatives',
            'Ministry of Education and Human Resource',
            'Ministry of Information Technology, Communication and Innovation',
            'Ministry of Public Service and Administrative Reforms',
            'Ministry of Local Government',
            'Ministry of Arts and Culture',
        ];

        DB::table('departments')->insert(array_map(
            fn (string $name, int $index) => ['name' => $name, 'sort_order' => $index + 1],
            $departments,
            array_keys($departments)
        ));

        Schema::table('incidents', function (Blueprint $table) {
            // Nullable only for incidents that existed before departments were introduced.
            $table->foreignId('department_id')->nullable()->after('created_by')
                ->constrained('departments')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->dropConstrainedForeignId('department_id');
        });

        Schema::dropIfExists('departments');
    }
};
