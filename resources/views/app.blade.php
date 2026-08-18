<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="h-full">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#1b2a8f" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">

    <title>Nouveaux Démocrates</title>

    <link rel="preconnect" href="https://fonts.bunny.net">
    <link href="https://fonts.bunny.net/css?family=inter:400,500,600,700&display=swap" rel="stylesheet" />

    @vite(['resources/css/app.css', 'resources/js/app.jsx'])
</head>
<body class="h-full">
    <div id="app" class="h-full"></div>
</body>
</html>
