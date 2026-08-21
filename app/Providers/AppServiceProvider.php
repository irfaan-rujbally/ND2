<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * The path to the "home" route for your application.
     *
     * This is used by Laravel authentication to redirect users after login.
     *
     * @var string
     */
    public const HOME = '/';

    /**
     * Register any application services.
     */
    public function register(): void
    {
        Model::unguard();
    }

    /**
     * Bootstrap any application services.
     */
    /*
     * No morph map here, deliberately.
     *
     * A map of short aliases ('member', 'user') for the forum's polymorphic
     * author would be tidier in the database, but Relation::morphMap changes
     * getMorphClass() for those models *everywhere* -- and two packages already
     * store their morph type as a class name against them:
     *
     *   - spatie/laravel-permission's model_has_roles.model_type
     *   - laravel/sanctum's personal_access_tokens.tokenable_type
     *
     * Adding the map made both start writing 'user' while every existing row
     * still said 'App\Models\User', so every administrator silently lost their
     * role and every issued token stopped resolving. Introducing one would now
     * require migrating those columns too, which is a much larger change than
     * the forum needs.
     */
    public function boot(): void
    {
        $this->bootRoute();
    }

    public function bootRoute(): void
    {
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(60)->by($request->user()?->id ?: $request->ip());
        });

    }
}
