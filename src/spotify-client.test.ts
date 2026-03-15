import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ServerEnv } from "./env.js";
import { spotifyRequest, withErrorHandling } from "./spotify-client.js";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";
const TOKEN_BUFFER_MS = 60_000;

const mockEnv: ServerEnv = {
  SPOTIFY_CLIENT_ID: "test-client-id",
  SPOTIFY_CLIENT_SECRET: "test-client-secret",
  SPOTIFY_REDIRECT_URI: "http://127.0.0.1:8888/callback",
  SPOTIFY_REFRESH_TOKEN: "test-refresh-token",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;
const originalConsoleError = console.error;
const originalDateNow = Date.now;

function tokenResponse(
  overrides: Partial<{
    access_token: string;
    expires_in: number;
  }> = {},
) {
  return new Response(
    JSON.stringify({
      access_token: "test-token",
      expires_in: 3600,
      ...overrides,
    }),
    {
      status: 200,
    },
  );
}

function apiResponse(data: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(data), {
    headers,
    status,
  });
}

/**
 * Creates a mock fetch that handles both token and API calls.
 * `apiFn` is called for any request that is NOT to the token endpoint.
 */
function mockFetch(
  apiFn: (url: string, init?: RequestInit) => Promise<Response> | Response,
  tokenOverrides?: Partial<{
    access_token: string;
    expires_in: number;
  }>,
) {
  global.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    if (urlStr === TOKEN_URL) {
      return Promise.resolve(tokenResponse(tokenOverrides));
    }
    return Promise.resolve(apiFn(urlStr, init));
  }) as unknown as typeof fetch;
}

/**
 * Force the module-level token cache to expire.
 *
 * The module stores `expiresAt = Date.now() + expires_in * 1000` and checks
 * `Date.now() < expiresAt - 60_000`. To guarantee expiry we jump Date.now
 * far enough ahead to exceed any previously stored expiresAt, do a throwaway
 * refresh with `expires_in: 0`, then advance past that new expiresAt too.
 *
 * Each call increments the epoch so it always exceeds any prior token's expiry.
 */
let _expireEpoch = 0;
async function expireTokenCache() {
  _expireEpoch += 1;
  // Each epoch jumps 10_000_000ms (~2.7 hours) further. This guarantees we
  // exceed any token with expires_in: 3600 (= 3_600_000ms) set at a prior epoch.
  const far = originalDateNow() + _expireEpoch * 10_000_000;
  Date.now = () => far;

  global.fetch = mock((url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    if (urlStr === TOKEN_URL) {
      return Promise.resolve(
        tokenResponse({
          expires_in: 0,
        }),
      );
    }
    return Promise.resolve(
      new Response(null, {
        status: 204,
      }),
    );
  }) as unknown as typeof fetch;
  await spotifyRequest(mockEnv, "/me/_expire");

  // Advance past the new token's expiresAt (which is `far + 0 = far`)
  // Check: Date.now() < expiresAt - 60_000  →  far+60001 < far - 60_000  →  false ✓
  Date.now = () => far + TOKEN_BUFFER_MS + 1;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  console.error = mock(() => {});
});

afterEach(() => {
  global.fetch = originalFetch;
  console.error = originalConsoleError;
  Date.now = originalDateNow;
});

// ==========================================================================
// 1. TOKEN REFRESH FLOW
// ==========================================================================

describe("token refresh flow", () => {
  test("first call fetches a new token and uses it for the API request", async () => {
    await expireTokenCache();

    // Now Date.now is frozen; the next spotifyRequest will need a token refresh.
    const fetchCalls: string[] = [];
    global.fetch = mock((url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      fetchCalls.push(urlStr);
      if (urlStr === TOKEN_URL) {
        return Promise.resolve(tokenResponse());
      }
      return Promise.resolve(
        apiResponse({
          id: "1",
        }),
      );
    }) as unknown as typeof fetch;

    const result = await spotifyRequest(mockEnv, "/me");

    expect(fetchCalls).toContain(TOKEN_URL);
    expect(fetchCalls).toContain(`${API_BASE}/me`);
    expect(result).toEqual({
      id: "1",
    });
  });

  test("subsequent calls within expiry window use cached token", async () => {
    await expireTokenCache();

    let tokenCallCount = 0;
    global.fetch = mock((url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr === TOKEN_URL) {
        tokenCallCount++;
        return Promise.resolve(tokenResponse());
      }
      return Promise.resolve(
        new Response(null, {
          status: 204,
        }),
      );
    }) as unknown as typeof fetch;

    await spotifyRequest(mockEnv, "/me/cached-a");
    await spotifyRequest(mockEnv, "/me/cached-b");
    await spotifyRequest(mockEnv, "/me/cached-c");

    // Only one token refresh — the rest reuse the cached token
    expect(tokenCallCount).toBe(1);
  });

  test("token refresh after expiry fetches a new token", async () => {
    await expireTokenCache();

    let tokenCallCount = 0;
    global.fetch = mock((url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr === TOKEN_URL) {
        tokenCallCount++;
        // expires_in: 0 → expiresAt = Date.now() + 0 → immediately stale
        return Promise.resolve(
          tokenResponse({
            expires_in: 0,
          }),
        );
      }
      return Promise.resolve(
        new Response(null, {
          status: 204,
        }),
      );
    }) as unknown as typeof fetch;

    await spotifyRequest(mockEnv, "/me/expire-a");
    await spotifyRequest(mockEnv, "/me/expire-b");

    // Each call triggers a refresh because expires_in: 0
    expect(tokenCallCount).toBe(2);
  });

  test("concurrent callers share the same refresh promise", async () => {
    await expireTokenCache();

    let tokenCallCount = 0;
    global.fetch = mock((url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr === TOKEN_URL) {
        tokenCallCount++;
        return new Promise<Response>((resolve) =>
          setTimeout(() => resolve(tokenResponse()), 10),
        );
      }
      return Promise.resolve(
        new Response(null, {
          status: 204,
        }),
      );
    }) as unknown as typeof fetch;

    await Promise.all([
      spotifyRequest(mockEnv, "/me/concurrent-one"),
      spotifyRequest(mockEnv, "/me/concurrent-two"),
    ]);

    expect(tokenCallCount).toBe(1);
  });

  test("token refresh failure (non-ok response) throws", async () => {
    await expireTokenCache();

    global.fetch = mock((url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr === TOKEN_URL) {
        return Promise.resolve(
          new Response("server error", {
            status: 500,
            statusText: "Internal Server Error",
          }),
        );
      }
      return Promise.resolve(
        new Response(null, {
          status: 204,
        }),
      );
    }) as unknown as typeof fetch;

    await expect(spotifyRequest(mockEnv, "/me")).rejects.toThrow(
      "Token refresh failed (500 Internal Server Error)",
    );
  });

  test("invalid_grant error gives specific re-auth message", async () => {
    await expireTokenCache();

    global.fetch = mock((url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr === TOKEN_URL) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: "invalid_grant",
              error_description: "Refresh token revoked",
            }),
            {
              status: 400,
            },
          ),
        );
      }
      return Promise.resolve(
        new Response(null, {
          status: 204,
        }),
      );
    }) as unknown as typeof fetch;

    await expect(spotifyRequest(mockEnv, "/me")).rejects.toThrow(
      "Spotify auth expired. Re-run the auth script.",
    );
  });

  test("invalid token response (missing access_token) throws", async () => {
    await expireTokenCache();

    global.fetch = mock((url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr === TOKEN_URL) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              expires_in: 3600,
            }),
            {
              status: 200,
            },
          ),
        );
      }
      return Promise.resolve(
        new Response(null, {
          status: 204,
        }),
      );
    }) as unknown as typeof fetch;

    await expect(spotifyRequest(mockEnv, "/me")).rejects.toThrow(
      "Invalid token response from Spotify",
    );
  });

  test("invalid token response (missing expires_in) throws", async () => {
    await expireTokenCache();

    global.fetch = mock((url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr === TOKEN_URL) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: "tok",
            }),
            {
              status: 200,
            },
          ),
        );
      }
      return Promise.resolve(
        new Response(null, {
          status: 204,
        }),
      );
    }) as unknown as typeof fetch;

    await expect(spotifyRequest(mockEnv, "/me")).rejects.toThrow(
      "Invalid token response from Spotify",
    );
  });
});

// ==========================================================================
// 2. RESPONSE CACHING (GET only)
// ==========================================================================

describe("response caching", () => {
  test("GET requests are cached — second call does not hit fetch again", async () => {
    let apiCallCount = 0;
    mockFetch(() => {
      apiCallCount++;
      return apiResponse({
        name: "playlist",
      });
    });

    const a = await spotifyRequest(mockEnv, "/playlists/abc");
    const b = await spotifyRequest(mockEnv, "/playlists/abc");

    expect(a).toEqual({
      name: "playlist",
    });
    expect(b).toEqual({
      name: "playlist",
    });
    expect(apiCallCount).toBe(1);
  });

  test("different query params are cached separately", async () => {
    let apiCallCount = 0;
    mockFetch(() => {
      apiCallCount++;
      return apiResponse({
        n: apiCallCount,
      });
    });

    await spotifyRequest(mockEnv, "/search", "GET", undefined, {
      q: "a",
    });
    await spotifyRequest(mockEnv, "/search", "GET", undefined, {
      q: "b",
    });

    expect(apiCallCount).toBe(2);
  });

  test("same endpoint+query returns cached data", async () => {
    let apiCallCount = 0;
    mockFetch(() => {
      apiCallCount++;
      return apiResponse({
        cached: true,
      });
    });

    const a = await spotifyRequest(mockEnv, "/tracks", "GET", undefined, {
      ids: "1,2",
    });
    const b = await spotifyRequest(mockEnv, "/tracks", "GET", undefined, {
      ids: "1,2",
    });

    expect(a).toEqual(b);
    expect(apiCallCount).toBe(1);
  });

  test("mutating requests (PUT) clear the cache", async () => {
    let apiCallCount = 0;
    mockFetch(() => {
      apiCallCount++;
      return apiResponse({
        v: apiCallCount,
      });
    });

    // Populate cache
    await spotifyRequest(mockEnv, "/me/player");
    expect(apiCallCount).toBe(1);

    // Mutating request clears cache
    mockFetch(() => {
      apiCallCount++;
      return new Response(null, {
        status: 204,
      });
    });
    await spotifyRequest(mockEnv, "/me/player/play", "PUT");

    // Re-fetch — cache was cleared, should hit API again
    mockFetch(() => {
      apiCallCount++;
      return apiResponse({
        v: apiCallCount,
      });
    });
    await spotifyRequest(mockEnv, "/me/player");
    expect(apiCallCount).toBe(3);
  });

  test("mutating requests (POST) clear the cache", async () => {
    let apiCallCount = 0;
    mockFetch(() => {
      apiCallCount++;
      return apiResponse({
        v: apiCallCount,
      });
    });

    await spotifyRequest(mockEnv, "/me/player-post-test");
    expect(apiCallCount).toBe(1);

    mockFetch(() => {
      apiCallCount++;
      return apiResponse({
        snapshot_id: "snap",
      });
    });
    await spotifyRequest(mockEnv, "/playlists/x/tracks", "POST", {
      uris: [
        "a",
      ],
    });

    mockFetch(() => {
      apiCallCount++;
      return apiResponse({
        v: apiCallCount,
      });
    });
    await spotifyRequest(mockEnv, "/me/player-post-test");
    expect(apiCallCount).toBe(3);
  });

  test("mutating requests (DELETE) clear the cache", async () => {
    let apiCallCount = 0;
    mockFetch(() => {
      apiCallCount++;
      return apiResponse({
        v: apiCallCount,
      });
    });

    await spotifyRequest(mockEnv, "/me/player-delete-test");
    expect(apiCallCount).toBe(1);

    mockFetch(() => {
      apiCallCount++;
      return apiResponse({
        snapshot_id: "snap",
      });
    });
    await spotifyRequest(mockEnv, "/playlists/x/tracks", "DELETE", {
      uris: [
        "a",
      ],
    });

    mockFetch(() => {
      apiCallCount++;
      return apiResponse({
        v: apiCallCount,
      });
    });
    await spotifyRequest(mockEnv, "/me/player-delete-test");
    expect(apiCallCount).toBe(3);
  });

  test("cache entries expire after 2 seconds", async () => {
    let apiCallCount = 0;
    mockFetch(() => {
      apiCallCount++;
      return apiResponse({
        v: apiCallCount,
      });
    });

    await spotifyRequest(mockEnv, "/me/cache-expire-test");
    expect(apiCallCount).toBe(1);

    // Wait just over the 2s TTL
    await new Promise((resolve) => setTimeout(resolve, 2100));

    mockFetch(() => {
      apiCallCount++;
      return apiResponse({
        v: apiCallCount,
      });
    });
    await spotifyRequest(mockEnv, "/me/cache-expire-test");
    expect(apiCallCount).toBe(2);
  });
});

// ==========================================================================
// 3. EMPTY BODY HANDLING
// ==========================================================================

describe("empty body handling", () => {
  test("204 returns null", async () => {
    mockFetch(
      () =>
        new Response(null, {
          status: 204,
        }),
    );

    const result = await spotifyRequest(mockEnv, "/me/player/play", "PUT");
    expect(result).toBeNull();
  });

  test("200 with empty text body returns null", async () => {
    mockFetch(
      () =>
        new Response("", {
          status: 200,
        }),
    );

    const result = await spotifyRequest(mockEnv, "/me/empty-body");
    expect(result).toBeNull();
  });

  test("200 with non-JSON body throws", async () => {
    mockFetch(
      () =>
        new Response("WKnfnRC4wAbGxM3srAyTvLbDodE", {
          status: 200,
        }),
    );

    await expect(
      spotifyRequest(mockEnv, "/me/player/pause", "PUT"),
    ).rejects.toThrow("Invalid JSON response from Spotify");
  });

  test("200 with valid JSON parses correctly", async () => {
    mockFetch(() =>
      apiResponse({
        id: "123",
        name: "track",
      }),
    );

    const result = await spotifyRequest<{
      name: string;
      id: string;
    }>(mockEnv, "/tracks/123");
    expect(result).toEqual({
      id: "123",
      name: "track",
    });
  });
});

// ==========================================================================
// 4. RETRY ON 429/5xx
// ==========================================================================

describe("retry on 429/5xx", () => {
  test("429 retries after Retry-After header delay and succeeds", async () => {
    let callCount = 0;
    mockFetch(() => {
      callCount++;
      if (callCount === 1) {
        return new Response("rate limited", {
          headers: {
            "Retry-After": "1",
          },
          status: 429,
        });
      }
      return apiResponse({
        retried: true,
      });
    });

    const result = await spotifyRequest(mockEnv, "/me/retry-429");
    expect(result).toEqual({
      retried: true,
    });
    expect(callCount).toBe(2);
  });

  test("429 caps wait at MAX_RETRY_WAIT_MS (10s)", async () => {
    let callCount = 0;
    const startTime = originalDateNow();

    mockFetch(() => {
      callCount++;
      if (callCount === 1) {
        return new Response("rate limited", {
          headers: {
            "Retry-After": "600",
          },
          status: 429,
        });
      }
      return apiResponse({
        ok: true,
      });
    });

    await spotifyRequest(mockEnv, "/me/retry-cap");
    const elapsed = originalDateNow() - startTime;

    // Should have waited ~10s, not 600s.
    expect(elapsed).toBeLessThan(15_000);
    expect(elapsed).toBeGreaterThanOrEqual(9_000);
    expect(callCount).toBe(2);
  }, 15_000);

  test("5xx retries after 1s and succeeds", async () => {
    let callCount = 0;
    mockFetch(() => {
      callCount++;
      if (callCount === 1) {
        return new Response("server error", {
          status: 502,
        });
      }
      return apiResponse({
        ok: true,
      });
    });

    const result = await spotifyRequest(mockEnv, "/me/retry-5xx");
    expect(result).toEqual({
      ok: true,
    });
    expect(callCount).toBe(2);
  });

  test("retry fails on second attempt too — should throw", async () => {
    mockFetch(
      () =>
        new Response("still broken", {
          status: 500,
        }),
    );

    await expect(
      spotifyRequest(mockEnv, "/me/retry-double-fail"),
    ).rejects.toThrow("Spotify API error (500).");
  });
});

// ==========================================================================
// 5. ERROR MAPPING (mapSpotifyError)
// ==========================================================================

describe("error mapping (mapSpotifyError)", () => {
  test("401 returns auth expired message", async () => {
    mockFetch(
      () =>
        new Response("unauthorized", {
          status: 401,
        }),
    );

    await expect(spotifyRequest(mockEnv, "/me/err-401")).rejects.toThrow(
      "Spotify auth expired. Re-run the auth script.",
    );
  });

  test("403 with PREMIUM_REQUIRED", async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({
            error: {
              message: "PREMIUM_REQUIRED",
              status: 403,
            },
          }),
          {
            status: 403,
          },
        ),
    );

    await expect(
      spotifyRequest(mockEnv, "/me/err-403-premium"),
    ).rejects.toThrow("This feature requires Spotify Premium.");
  });

  test("403 with volume", async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({
            error: {
              message: "Cannot control volume on this device",
              status: 403,
            },
          }),
          {
            status: 403,
          },
        ),
    );

    await expect(spotifyRequest(mockEnv, "/me/err-403-volume")).rejects.toThrow(
      "Volume control is not available on this device.",
    );
  });

  test("403 generic", async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({
            error: {
              message: "Forbidden",
              status: 403,
            },
          }),
          {
            status: 403,
          },
        ),
    );

    await expect(spotifyRequest(mockEnv, "/me/err-403-gen")).rejects.toThrow(
      "Spotify rejected the request (403).",
    );
  });

  test("404 with NO_ACTIVE_DEVICE", async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({
            error: {
              message: "NO_ACTIVE_DEVICE",
              status: 404,
            },
          }),
          {
            status: 404,
          },
        ),
    );

    await expect(spotifyRequest(mockEnv, "/me/err-404-device")).rejects.toThrow(
      "No active Spotify device found. Open Spotify on a device first.",
    );
  });

  test("404 with 'not found' in body", async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({
            error: {
              message: "resource not found",
              status: 404,
            },
          }),
          {
            status: 404,
          },
        ),
    );

    await expect(
      spotifyRequest(mockEnv, "/me/err-404-notfound"),
    ).rejects.toThrow(
      "No active Spotify device found. Open Spotify on a device first.",
    );
  });

  test("404 generic", async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({
            error: {
              message: "Something else entirely",
              status: 404,
            },
          }),
          {
            status: 404,
          },
        ),
    );

    await expect(spotifyRequest(mockEnv, "/me/err-404-gen")).rejects.toThrow(
      "Spotify resource not found.",
    );
  });

  test("429 returns rate limit message", async () => {
    mockFetch(
      () =>
        new Response("rate limited", {
          headers: {
            "Retry-After": "0",
          },
          status: 429,
        }),
    );

    await expect(spotifyRequest(mockEnv, "/me/err-429")).rejects.toThrow(
      "Rate limited by Spotify. Try again in a few seconds.",
    );
  });

  test("other status codes return generic message", async () => {
    mockFetch(
      () =>
        new Response("teapot", {
          status: 418,
        }),
    );

    await expect(spotifyRequest(mockEnv, "/me/err-other")).rejects.toThrow(
      "Spotify API error (418).",
    );
  });
});

// ==========================================================================
// 6. SPOTIFY ERROR IN RESPONSE BODY
// ==========================================================================

describe("spotify error in response body", () => {
  test("JSON response with error object containing message throws that message", async () => {
    mockFetch(() =>
      apiResponse({
        error: {
          message: "Bad search query",
          status: 400,
        },
      }),
    );

    await expect(spotifyRequest(mockEnv, "/me/err-body-obj")).rejects.toThrow(
      "Bad search query",
    );
  });

  test("JSON response with error object missing message throws unknown error", async () => {
    mockFetch(() =>
      apiResponse({
        error: {
          status: 400,
        },
      }),
    );

    await expect(
      spotifyRequest(mockEnv, "/me/err-body-no-msg"),
    ).rejects.toThrow("Unknown Spotify error");
  });

  test("JSON response with error that is not an object throws unknown error", async () => {
    mockFetch(() =>
      apiResponse({
        error: "something went wrong",
      }),
    );

    await expect(spotifyRequest(mockEnv, "/me/err-body-str")).rejects.toThrow(
      "Unknown Spotify error",
    );
  });
});

// ==========================================================================
// 7. withErrorHandling WRAPPER
// ==========================================================================

describe("withErrorHandling", () => {
  test("passes through successful results", async () => {
    const handler = async () => ({
      content: [
        {
          text: "ok",
          type: "text" as const,
        },
      ],
    });

    const wrapped = withErrorHandling(handler);
    const result = await wrapped({});

    expect(result).toEqual({
      content: [
        {
          text: "ok",
          type: "text",
        },
      ],
    });
  });

  test("catches 'fetch failed' errors and returns network error message", async () => {
    const handler = async () => {
      throw new Error("fetch failed");
    };

    const wrapped = withErrorHandling(handler);
    const result = await wrapped({});

    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({
      text: "Could not reach Spotify API. Check your internet connection.",
      type: "text",
    });
  });

  test("catches 'ENOTFOUND' errors and returns network error message", async () => {
    const handler = async () => {
      throw new Error("getaddrinfo ENOTFOUND accounts.spotify.com");
    };

    const wrapped = withErrorHandling(handler);
    const result = await wrapped({});

    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({
      text: "Could not reach Spotify API. Check your internet connection.",
      type: "text",
    });
  });

  test("catches generic errors and returns error message", async () => {
    const handler = async () => {
      throw new Error("Something broke");
    };

    const wrapped = withErrorHandling(handler);
    const result = await wrapped({});

    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({
      text: "Something broke",
      type: "text",
    });
  });

  test("handles non-Error throws", async () => {
    const handler = async (): Promise<CallToolResult> => {
      throw "plain string error";
    };

    const wrapped = withErrorHandling(handler);
    const result = await wrapped({});

    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({
      text: "plain string error",
      type: "text",
    });
  });
});

// ==========================================================================
// 8. QUERY PARAMS HANDLING
// ==========================================================================

describe("query params handling", () => {
  test("URL is constructed with query params appended", async () => {
    let capturedUrl = "";
    mockFetch((url) => {
      capturedUrl = url;
      return apiResponse({
        items: [],
      });
    });

    await spotifyRequest(mockEnv, "/search", "GET", undefined, {
      q: "test",
      type: "track",
    });

    expect(capturedUrl).toBe(`${API_BASE}/search?q=test&type=track`);
  });

  test("URL has no query string when queryParams is undefined", async () => {
    let capturedUrl = "";
    mockFetch((url) => {
      capturedUrl = url;
      return apiResponse({
        id: "1",
      });
    });

    await spotifyRequest(mockEnv, "/tracks/1");

    expect(capturedUrl).toBe(`${API_BASE}/tracks/1`);
  });

  test("cache key includes query params — different params hit API separately", async () => {
    let apiCallCount = 0;
    mockFetch(() => {
      apiCallCount++;
      return apiResponse({
        n: apiCallCount,
      });
    });

    await spotifyRequest(mockEnv, "/browse/categories", "GET", undefined, {
      limit: "10",
    });
    await spotifyRequest(mockEnv, "/browse/categories", "GET", undefined, {
      limit: "20",
    });

    expect(apiCallCount).toBe(2);
  });
});

// ==========================================================================
// 9. REQUEST BODY HANDLING
// ==========================================================================

describe("request body handling", () => {
  test("Content-Type header set when body provided", async () => {
    let capturedHeaders: Record<string, string> = {};
    mockFetch((_url, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      if (headers) {
        capturedHeaders = headers;
      }
      return new Response(null, {
        status: 204,
      });
    });

    await spotifyRequest(mockEnv, "/me/player/play", "PUT", {
      context_uri: "spotify:album:123",
    });

    expect(capturedHeaders["Content-Type"]).toBe("application/json");
  });

  test("no Content-Type when no body", async () => {
    let capturedHeaders: Record<string, string> = {};
    mockFetch((_url, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      if (headers) {
        capturedHeaders = headers;
      }
      return new Response(null, {
        status: 204,
      });
    });

    await spotifyRequest(mockEnv, "/me/player/pause", "PUT");

    expect(capturedHeaders["Content-Type"]).toBeUndefined();
  });

  test("body is JSON stringified", async () => {
    let capturedBody: string | undefined;
    mockFetch((_url, init) => {
      capturedBody = init?.body as string | undefined;
      return new Response(null, {
        status: 204,
      });
    });

    const body = {
      uris: [
        "spotify:track:1",
        "spotify:track:2",
      ],
    };
    await spotifyRequest(mockEnv, "/playlists/x/tracks", "POST", body);

    expect(capturedBody).toBe(JSON.stringify(body));
  });

  test("no body field on request when body is undefined", async () => {
    let initHadBody = false;
    mockFetch((_url, init) => {
      initHadBody = "body" in (init ?? {});
      return new Response(null, {
        status: 204,
      });
    });

    await spotifyRequest(mockEnv, "/me/player/next", "POST");

    expect(initHadBody).toBe(false);
  });
});
