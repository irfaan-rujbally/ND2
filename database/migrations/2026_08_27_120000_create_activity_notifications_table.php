<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activity_notifications', function (Blueprint $table) {
            $table->id();
            $table->string('recipient_type', 20);
            $table->unsignedBigInteger('recipient_id');
            $table->string('type', 60);
            $table->string('title', 150);
            $table->string('message', 500)->nullable();
            $table->string('url', 255)->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->index(['recipient_type', 'recipient_id', 'read_at'], 'activity_notifications_recipient_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_notifications');
    }
};
