<?php

use App\Providers\AppServiceProvider;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withProviders()
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        // channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Login lives in the React router now, so there is no server side
        // login route to name; guests are sent to the SPA path instead.
        $middleware->redirectGuestsTo('/login');
        $middleware->redirectUsersTo(AppServiceProvider::HOME);

        // Inertia is gone: the frontend is a React SPA talking to routes/api.php,
        // so the middleware that shared Inertia props no longer has a job.

        $middleware->throttleApi();

        /*
         * Members and staff share the Sanctum guard, so `auth:sanctum` on its own
         * does not say which of the two is calling. These two decide that, one
         * for each direction, by the model behind the token rather than by the
         * abilities it claims:
         *
         *   staff.only    -- the staff API; refuses a Member
         *   member.portal -- the member portal; refuses a User
         */
        $middleware->alias([
            'abilities'     => \Laravel\Sanctum\Http\Middleware\CheckAbilities::class,
            'ability'       => \Laravel\Sanctum\Http\Middleware\CheckForAnyAbility::class,
            'member.portal' => \App\Http\Middleware\EnsureMemberPortalToken::class,
            'staff.only'    => \App\Http\Middleware\EnsureStaffToken::class,
        ]);

        $middleware->replace(\Illuminate\Http\Middleware\TrustProxies::class, \App\Http\Middleware\TrustProxies::class);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
