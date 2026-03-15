# Code Review Report — spotify-mcp-server

**Date**: 2026-03-15
**Scope**: Full review
**Reviewed by**: OpenCode (automated review with manual verification)

---

## Health Assessment

This is a well-structured TypeScript MCP server for Spotify API integration with strong input validation via Zod, comprehensive test coverage on core modules, and clean separation of concerns. The codebase benefits from strict TypeScript configuration, Biome linting enforcement, and a modular tool architecture. The primary concern is a **critical bug in the playlist deletion endpoint** that will cause runtime failures. Secondary concerns include unbounded memory growth in the response cache and missing OAuth flow tests.

## Severity Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 4 |
| MEDIUM | 10 |
| LOW | 3 |
| **Total** | **18** |

## Top 3 Findings

1. **[F1] Wrong API endpoint for playlist deletion** (CRITICAL) — `spotify_delete_playlist` uses `DELETE /me/library` which doesn't exist for playlists. See `src/tools/playlist-write.ts:73`.

2. **[F2] Module-level mutable state prevents test isolation** (HIGH) — Global `tokenCache`, `refreshPromise`, and `responseCache` make testing difficult and prevent multi-instance support. See `src/spotify-client.ts:21-23`.

3. **[F3] Unbounded response cache causes memory leak** (HIGH) — The `responseCache` Map grows without limit; expired entries are never evicted. See `src/spotify-client.ts:23`.

---

## All Confirmed Findings

### F1: Wrong API endpoint for playlist deletion

- **Severity**: CRITICAL
- **Category**: API/Network
- **Location**: `src/tools/playlist-write.ts:73`
- **Issue**: `spotify_delete_playlist` calls `DELETE /me/library` which is not a valid Spotify API endpoint for playlist deletion. The correct endpoint is `DELETE /playlists/{playlist_id}/followers`.
- **Impact**: All playlist deletion calls will fail with 404/405 errors, breaking the delete functionality entirely.
- **Recommendation**: 
  ```typescript
  // Current (WRONG):
  await spotifyRequest(env, "/me/library", "DELETE", { uris: [uri] });
  
  // Correct:
  const id = extractIdFromUri(uri);
  await spotifyRequest(env, `/playlists/${id}/followers`, "DELETE");
  ```
- **Confidence**: HIGH
- **Evidence**: Verified against Spotify Web API documentation: https://developer.spotify.com/documentation/web-api/reference/unfollow-playlist

### F2: Module-level mutable state prevents test isolation

- **Severity**: HIGH
- **Category**: Architecture
- **Location**: `src/spotify-client.ts:21-23`
- **Issue**: The `tokenCache`, `refreshPromise`, and `responseCache` are module-level mutable variables that persist across test runs and prevent proper test isolation. Multiple server instances would share state inappropriately.
- **Impact**: Tests must hack `Date.now` to expire tokens (see `spotify-client.test.ts:80-108`). Production deployments with multiple instances would have unpredictable cache sharing.
- **Recommendation**: Encapsulate state in a `SpotifyClient` class with dependency injection:
  ```typescript
  class SpotifyClient {
    private tokenCache: TokenCache | null = null;
    private responseCache = new Map<string, ResponseCache>();
    // ...
  }
  ```
- **Confidence**: HIGH
- **Evidence**: Code read at lines 21-23; test workaround at `spotify-client.test.ts:80-108`

### F3: Unbounded response cache causes memory leak

- **Severity**: HIGH
- **Category**: Performance/Memory
- **Location**: `src/spotify-client.ts:23`
- **Issue**: The `responseCache` Map grows without any size limit or LRU eviction. Only mutating requests (`PUT`, `POST`, `DELETE`) clear the entire cache, but GET requests accumulate entries indefinitely.
- **Impact**: Long-running sessions with varied API requests will consume unbounded memory. A server handling many different endpoints could exhaust memory.
- **Recommendation**: Implement an LRU cache with max size:
  ```typescript
  import { LRUCache } from 'lru-cache';
  const responseCache = new LRUCache<string, ResponseCache>({ max: 100 });
  ```
- **Confidence**: HIGH
- **Evidence**: Code read at lines 23, 182-187; no size limits or eviction logic found

### F4: No tests for OAuth authentication flow

- **Severity**: HIGH
- **Category**: Testing
- **Location**: `src/auth.ts`
- **Issue**: The entire OAuth flow (state validation, token exchange, .env file writing) has no test coverage. This is a critical authentication path with no regression protection.
- **Impact**: Changes to auth logic could break the authentication flow without detection. Security issues like CSRF protection could be accidentally removed.
- **Recommendation**: Create `src/auth.test.ts` covering:
  - OAuth state generation and validation
  - Token exchange success/error scenarios
  - .env file writing with error handling
- **Confidence**: HIGH
- **Evidence**: Glob search found no `*auth*.test.ts` file; auth.ts has no corresponding test file

### F5: JSON parse failures silently return null

- **Severity**: HIGH
- **Category**: Error Handling
- **Location**: `src/spotify-client.ts:164-170`
- **Issue**: When `JSON.parse(text)` throws (malformed JSON), the code catches and returns `null`. This conflates legitimate empty responses (204) with actual parse failures.
- **Impact**: Malformed API responses are silently treated as empty, potentially hiding serious issues. Debugging becomes difficult when responses are unexpectedly empty.
- **Recommendation**: Distinguish parse failures:
  ```typescript
  } catch {
    // If we expected JSON but couldn't parse, log and throw
    console.error("Failed to parse JSON response:", text.substring(0, 200));
    throw new Error("Invalid JSON response from Spotify API");
  }
  ```
- **Confidence**: HIGH
- **Evidence**: Code read at lines 164-170

### F6: Type assertions bypass runtime validation

- **Severity**: MEDIUM
- **Category**: Types
- **Location**: `src/spotify-client.ts:83, 166, 189`
- **Issue**: External Spotify API responses are cast with `as Record<string, unknown>` and `as T` without runtime validation. If Spotify returns unexpected shapes, runtime errors occur downstream.
- **Impact**: API contract changes or malformed responses cause cryptic runtime errors rather than clear validation failures.
- **Recommendation**: Use Zod schemas to validate API responses for critical endpoints, or create typed parse functions.
- **Confidence**: HIGH
- **Evidence**: Code read at lines 83, 166, 189

### F7: Multiple tools call `/me/player` independently

- **Severity**: MEDIUM
- **Category**: Performance
- **Location**: `src/tools/playback-read.ts:49, 65, 81, 97, 113`
- **Issue**: Five separate tools (`get_player_state`, `get_position`, `get_volume`, `get_shuffle`, `get_repeat`) each call `/me/player` independently when a user might want multiple pieces of information.
- **Impact**: Wasted API calls if users chain operations. Each tool call is a separate HTTP request when one would suffice.
- **Recommendation**: Create a `getPlayerState()` helper that returns cached state within a single tool invocation, or expose a combined `get_full_state` tool.
- **Confidence**: MEDIUM
- **Evidence**: Code read at playback-read.ts lines 49, 65, 81, 97, 113

### F8: withErrorHandling wrapper bypassed in tool tests

- **Severity**: MEDIUM
- **Category**: Testing
- **Location**: `src/tools/playback-*.test.ts`, `src/tools/playlist-*.test.ts`
- **Issue**: Tool tests mock `spotifyRequest` directly, bypassing the `withErrorHandling` wrapper. Error propagation through the wrapper is untested.
- **Impact**: Error handling bugs in `withErrorHandling` would not be caught by tests. Network errors, timeouts, and API errors might not propagate correctly.
- **Recommendation**: At least one test per tool should exercise the error handling path without mocking `spotifyRequest`.
- **Confidence**: MEDIUM
- **Evidence**: Test files mock spotifyRequest import; withErrorHandling never tested as wrapper

### F9: No timeout tests for AbortSignal.timeout

- **Severity**: MEDIUM
- **Category**: Testing
- **Location**: `src/spotify-client.ts:52, 132`
- **Issue**: `AbortSignal.timeout(FETCH_TIMEOUT_MS)` (10s timeout) behaviour is untested. Slow or hanging requests could cause production issues.
- **Impact**: Timeout edge cases (network hangs, slow Spotify responses) have no regression protection.
- **Recommendation**: Add tests that simulate timeout scenarios by mocking fetch with delayed responses.
- **Confidence**: MEDIUM
- **Evidence**: No timeout tests found in `spotify-client.test.ts`

### F10: Expired cache entries never removed from Map

- **Severity**: MEDIUM
- **Category**: Performance/Memory
- **Location**: `src/spotify-client.ts:182-187`
- **Issue**: Expired entries remain in the Map even after `expiresAt` passes. The cache only grows until cleared by mutations.
- **Impact**: Memory leak over time for long-running servers with limited mutation operations.
- **Recommendation**: Add cleanup on cache access:
  ```typescript
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data as T;
  }
  if (cached) responseCache.delete(cacheKey); // Clean expired
  ```
- **Confidence**: HIGH
- **Evidence**: Code read at lines 109-114, 182-187

### F11: Track formatting logic duplicated

- **Severity**: MEDIUM
- **Category**: Code Duplication
- **Location**: `src/tools/playback-read.ts:29-37`, `src/tools/playlist-read.ts:109-118`
- **Issue**: Track formatting (artists join, duration formatting) is duplicated across files with slight variations.
- **Impact**: Maintenance burden; inconsistent formatting if one is updated without the other.
- **Recommendation**: Extract to `src/utils.ts`:
  ```typescript
  export function formatTrack(track: SpotifyTrack): string {
    const artists = track.artists.map(a => a.name).join(", ");
    const mins = Math.floor(track.duration_ms / 60_000);
    const secs = Math.floor((track.duration_ms % 60_000) / 1000).toString().padStart(2, "0");
    return `${track.name} — ${artists} (${mins}:${secs})`;
  }
  ```
- **Confidence**: HIGH
- **Evidence**: Code comparison between playback-read.ts and playlist-read.ts

### F12: Refresh token written to .env without restrictive permissions

- **Severity**: MEDIUM
- **Category**: Security
- **Location**: `src/auth.ts:109`
- **Issue**: `writeFileSync(envPath, envContent)` creates/writes the .env file with default permissions. On multi-user systems, other users could read credentials.
- **Impact**: Credential exposure on shared systems or compromised environments.
- **Recommendation**: Set restrictive permissions:
  ```typescript
  writeFileSync(envPath, envContent, { mode: 0o600 });
  ```
- **Confidence**: MEDIUM
- **Evidence**: Code read at line 109; no mode parameter passed

### F13: Token refresh failure logs full response body

- **Severity**: MEDIUM
- **Category**: Security/Logging
- **Location**: `src/spotify-client.ts:62`
- **Issue**: `console.error("Token refresh failed:", body)` logs the complete response body which may contain sensitive OAuth error details.
- **Impact**: Logs could contain sensitive information about auth flow failures.
- **Recommendation**: Log only status code:
  ```typescript
  console.error("Token refresh failed:", response.status);
  ```
- **Confidence**: MEDIUM
- **Evidence**: Code read at line 62

### F14: API errors logged with full response body

- **Severity**: MEDIUM
- **Category**: Security/Logging
- **Location**: `src/spotify-client.ts:193`
- **Issue**: `console.error("Spotify API error ${status}:", body)` logs complete error responses.
- **Impact**: Logs may contain sensitive Spotify error details or user-specific information.
- **Recommendation**: Log only status code and error type:
  ```typescript
  console.error(`Spotify API error ${status}:`, status);
  ```
- **Confidence**: MEDIUM
- **Evidence**: Code read at line 193

### F15: Auth error handling closes server without exiting process

- **Severity**: MEDIUM
- **Category**: Error Handling
- **Location**: `src/auth.ts:39-58`
- **Issue**: Error conditions call `server.close()` but don't call `process.exit(1)`. The process may hang instead of terminating.
- **Impact**: Auth script could hang indefinitely on errors rather than exiting cleanly.
- **Recommendation**: Add `process.exit(1)` after each `server.close()`:
  ```typescript
  if (returnedState !== oauthState) {
    res.writeHead(400);
    res.end("Invalid OAuth state — possible CSRF attack.");
    server.close();
    process.exit(1); // Add this
  }
  ```
- **Confidence**: HIGH
- **Evidence**: Code read at lines 39-58; no process.exit calls after server.close()

### F16: Retry logic uses same delay for rate limits and server errors

- **Severity**: LOW
- **Category**: Performance
- **Location**: `src/spotify-client.ts:137-147`
- **Issue**: Rate limit (429) errors use `Retry-After` header or default 1s; server errors (5xx) use fixed 1s. Optimal strategy differs.
- **Impact**: Suboptimal retry behaviour for transient server errors; potential API quota waste.
- **Recommendation**: Consider exponential backoff for 5xx errors while respecting Retry-After for 429.
- **Confidence**: LOW
- **Evidence**: Code read at lines 137-147

### F17: Error messages hardcode auth script command

- **Severity**: LOW
- **Category**: Quality
- **Location**: `src/spotify-client.ts:59, 197`
- **Issue**: Error messages reference `` `bun run auth` `` specifically. Users running via npm or other methods get misleading instructions.
- **Impact**: Minor user confusion about how to re-authenticate.
- **Recommendation**: Use generic message or accept command as config:
  ```typescript
  throw new Error("Spotify auth expired. Re-run the authentication script.");
  ```
- **Confidence**: LOW
- **Evidence**: Code read at lines 59, 197

### F18: Fatal error logs raw error object

- **Severity**: LOW
- **Category**: Security/Logging
- **Location**: `src/index.ts:28`
- **Issue**: `console.error("Fatal:", error)` logs the full error object with stack trace.
- **Impact**: Stack traces in logs could expose internal structure in production.
- **Recommendation**: Log only `error.message` in production:
  ```typescript
  console.error("Fatal:", error instanceof Error ? error.message : String(error));
  ```
- **Confidence**: LOW
- **Evidence**: Code read at line 28

---

## Rejected & Inconclusive Findings

<details>
<summary>2 findings rejected, 0 inconclusive (click to expand)</summary>

| ID | Original Claim | Verdict | Reason |
|----|---------------|---------|--------|
| R1 | Null pointer in playback-read.ts data.device.volume_percent | REJECTED | TypeScript types show `device` as non-nullable (`SpotifyDevice`, not `SpotifyDevice \| null`). Spotify API returns `null` for the entire response when no device is active, which is handled by `if (!data \|\| ...)`. Code is correct. |
| R2 | AbortSignal.timeout not polyfilled for older Node | REJECTED | Project uses Bun runtime with modern JS. AbortSignal.timeout is supported. No need for polyfill or Node version concerns. |

</details>

---

## What's Done Well

1. **Strong input validation** — Zod schemas validate all tool inputs with strict regex patterns for Spotify URIs, preventing injection attacks and malformed data.

2. **Comprehensive test coverage on core modules** — `spotify-client.test.ts` has 1137 lines covering token refresh, caching, retries, error mapping, and edge cases with excellent mock patterns.

3. **Clean separation of concerns** — Tools are organised by domain (playback-read, playback-write, playlist-read, playlist-write) with shared client and utility modules.

4. **Proper OAuth state validation** — CSRF protection implemented correctly with `randomUUID()` state parameter verification.

5. **Immutable types** — All TypeScript interfaces use `readonly` modifiers, preventing accidental mutation of API response shapes.

---

## Recommended Next Steps

1. **Fix the playlist deletion endpoint** (CRITICAL) — Change `DELETE /me/library` to `DELETE /playlists/{id}/followers`. This is blocking current functionality.

2. **Add auth.ts tests** — Create `src/auth.test.ts` covering OAuth flow, state validation, token exchange, and .env writing.

3. **Implement bounded cache** — Replace the unbounded `Map` with an LRU cache or add TTL-based eviction to prevent memory growth.

4. **Encapsulate module state** — Refactor `spotify-client.ts` to use a class with instance state for better testability and multi-instance support.

5. **Fix JSON parse error handling** — Distinguish between legitimate empty responses and parse failures rather than silently returning null.