<?php

namespace App\Http\Controllers\Api\Member;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class NewsController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $pageId = config('services.facebook.page_id');
        $accessToken = config('services.facebook.page_access_token');

        if (! $pageId || ! $accessToken) {
            return response()->json([
                'message' => 'The news feed has not been configured yet.',
            ], 503);
        }

        $limit = max(1, min((int) config('services.facebook.news_limit', 10), 25));
        $version = config('services.facebook.graph_version', 'v26.0');
        $cacheSeconds = max(0, (int) config('services.facebook.cache_seconds', 300));

        try {
            $posts = Cache::remember(
                "facebook-news:{$pageId}:{$limit}",
                now()->addSeconds($cacheSeconds),
                fn () => $this->fetchPosts($version, $pageId, $accessToken, $limit),
            );
        } catch (Throwable $exception) {
            Log::warning('Unable to load the Facebook news feed.', [
                'page_id' => $pageId,
                'exception' => $exception::class,
            ]);

            return response()->json([
                'message' => 'News is temporarily unavailable. Please try again later.',
            ], 503);
        }

        return response()->json(['data' => $posts]);
    }

    private function fetchPosts(string $version, string $pageId, string $accessToken, int $limit): array
    {
        $response = Http::baseUrl("https://graph.facebook.com/{$version}")
            ->acceptJson()
            // Keep credentials out of the URL, proxy logs and exception messages.
            ->withToken($accessToken)
            ->timeout(10)
            ->retry(2, 250)
            ->get("/{$pageId}/posts", [
                'fields' => 'id,message,created_time,permalink_url,full_picture',
                'limit' => $limit,
            ])
            ->throw();

        return collect($response->json('data', []))
            ->map(fn (array $post) => [
                'id' => $post['id'],
                'message' => $post['message'] ?? null,
                'created_time' => $post['created_time'] ?? null,
                'permalink_url' => $post['permalink_url'] ?? null,
                'image_url' => $post['full_picture'] ?? null,
            ])
            ->values()
            ->all();
    }
}
