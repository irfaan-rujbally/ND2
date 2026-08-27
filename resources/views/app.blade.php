<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="h-full">
<head>
    <meta charset="UTF-8" />
    {{--
        No `viewport-fit=cover` here on purpose. It makes the layout viewport
        cover the notch and home indicator, and none of this app's CSS uses
        `env(safe-area-inset-*)` — so once installed to the home screen the
        `sticky top-0` header in AppLayout.jsx would sit underneath the status
        bar clock. Without it iOS insets the viewport for us.
    --}}
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#1b2a8f" />
    <link rel="icon" type="image/x-icon" href="/images/icon.ico">

    {{--
        Applies the saved theme before the first paint.

        ThemeToggle sets this same class, but not until the JS bundle has parsed —
        long enough that a dark-mode member saw a white flash on every load, which
        is most obvious on a phone. Deliberately inline and synchronous: an
        external or deferred script would paint first and defeat the point.

        The key and the fallback must match resources/js/components/theme-toggle.jsx.
        Wrapped in try/catch because localStorage throws outright in a privacy mode
        rather than returning null, and a theme is not worth a blank page.
    --}}
    <script>
        try {
            var stored = localStorage.getItem('nd.theme');
            var dark = stored
                ? stored === 'dark'
                : window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (dark) document.documentElement.classList.add('dark');
        } catch (e) {}
    </script>

    <title>Nouveaux Démocrates</title>

    {{-- Installable-app metadata. See public/manifest.json and public/sw.js. --}}
    <link rel="manifest" href="/manifest.json" />

    {{--
        iOS ignores the manifest's `icons` array, so the home screen icon has to
        be declared here as well. All of public/icons is generated from
        public/images/icon.ico by `php artisan pwa:icons`.
    --}}
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180.png" />
    <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon-167.png" />
    <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152.png" />

    {{--
        `apple-mobile-web-app-capable` is what drops the Safari address bar once
        the app is launched from the home screen. It is nominally superseded by
        `mobile-web-app-capable`, but iOS still only honours the prefixed one, so
        both are needed.
    --}}
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    {{-- `default` keeps dark status bar text, which suits the light app header. --}}
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Nouveaux Démocrates" />

    <link rel="preconnect" href="https://fonts.bunny.net">
    <link href="https://fonts.bunny.net/css?family=inter:400,500,600,700&display=swap" rel="stylesheet" />

    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/app.jsx'])
</head>
<body class="h-full">
    <div id="app" class="h-full"></div>
    {{-- The Facebook SDK renders its plugin dialogs into this element. --}}
    <div id="fb-root"></div>

    {{-- Web Push requires an active service worker. Its cache allow-list only
         includes hashed build assets, so registering locally is safe as well. --}}
    <script>
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
                navigator.serviceWorker.register('/sw.js').catch(function (error) {
                    // A failed registration costs the install prompt and the asset
                    // cache; the app itself keeps working, so this is not fatal.
                    console.error('Service worker registration failed:', error)
                })
            })
        }
    </script>
</body>
</html>
