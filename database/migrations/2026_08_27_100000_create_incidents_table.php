<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('incidents', function (Blueprint $table) {
            $table->id();
            // The legacy tables use signed INT primary keys, so these foreign
            // keys must use the same type rather than Laravel's BIGINT default.
            $table->integer('office_id');
            $table->integer('member_id')->nullable();
            // users.id is an unsigned INT (`increments`) while the older office
            // and member ids are signed INTs.
            $table->unsignedInteger('created_by')->nullable();
            $table->string('title', 150);
            $table->text('description');
            $table->string('status', 30)->default('open')->index();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['office_id', 'created_at']);
            $table->index(['member_id', 'created_at']);
            $table->foreign('office_id')->references('id')->on('offices')->cascadeOnUpdate()->restrictOnDelete();
            $table->foreign('member_id')->references('id')->on('members')->nullOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('incidents');
    }
};
