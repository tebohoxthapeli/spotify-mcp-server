# Code Review Report: Playlist Management Tools

**Date:** 2026-03-15
**Scope:** Uncommitted changes adding 8 playlist management tools (2 read, 6 write), supporting types, schemas, utilities, a cache bug fix, and OAuth scope additions
**Reviewer:** Automated code review

---

## Executive Summary

The changeset adds playlist management capabilities to the Spotify MCP server across 8 new files and 6 modified files. The new code follows established architectural patterns well -- file structure, schema-per-tool approach, annotations, and error handling are all consistent with the existing codebase. The cache key bug fix is a genuine catch that would have caused real issues with pagination.

However, the review identified **3 critical/high-severity issues** that are likely to cause runtime failures or data corruption, most notably a `spotify_delete_playlist` tool that almost certainly calls the wrong API endpoint with the wrong payload shape. Two additional tools have unverified endpoint paths. **No tests accompany any of the changes.**

**Verdict: Do not ship.** The critical findings must be resolved and manually verified against the Spotify API before merging. See [Prioritised Recommendations](#prioritised-recommendations) below.

---

## Findings Summary

| # | Severity | File | Description |
|---|----------|------|-------------|
| 1 | HIGH | `src/schemas.ts` | `updatePlaylistInput` partial update gap -- cross-field validation misses pre-existing playlist state |
| 2 | MEDIUM | `src/schemas.ts` | `track_uris` accepts any Spotify URI type, not just tracks |
| 3 | LOW | `src/schemas.ts` | `createPlaylistInput.public` defaults to `true` -- privacy footgun for LLM-driven creation |
| 4 | HIGH | `src/spotify-client.ts` | Pre-existing: `doFetch` captures stale token; no re-acquisition on 401 retry |
| 5 | MEDIUM | `src/spotify-client.ts` | `URLSearchParams` ordering not guaranteed -- cache key non-determinism |
| 6 | LOW | `src/spotify-client.ts` | `responseCache.clear()` on mutation wipes entire cache including unrelated state |
| 7 | MEDIUM | `src/tools/playlist-read.ts` | Track numbering uses filtered-array index; null-gap positions cause wrong references |
| 8 | LOW | `src/tools/playlist-read.ts` | Header count calculated from unfiltered length; may overstate visible items |
| 9 | **CRITICAL** | `src/tools/playlist-write.ts` | `spotify_delete_playlist` calls `DELETE /me/library` with `{ uris: [...] }` -- Spotify API expects `ids`, not `uris`. Tool is likely completely broken |
| 10 | MEDIUM | `src/tools/playlist-write.ts` | `spotify_update_playlist` sends empty `{}` body when all optional fields are undefined; no guard |
| 11 | MEDIUM | `src/tools/playlist-write.ts` | `POST /me/playlists` may require `POST /users/{user_id}/playlists` -- unverified endpoint |
| 12 | LOW | `src/tools/playlist-write.ts` | `snapshot_id` checked with `if (snapshot_id)` -- treats empty string as falsy; `!== undefined` is safer |

---

## File-by-File Breakdown

### `src/auth.ts`

Added 4 OAuth scopes for playlist access. **No issues.**

### `src/index.ts`

Imports and registers `playlist-read` and `playlist-write` modules. **No issues.**

### `src/types.ts`

Added 6 readonly interfaces for playlist data. **No issues.**

### `src/schemas.ts`

Added playlist URI regex and 8 input schemas.

- **[#1] HIGH -- Partial update gap in `updatePlaylistInput`.** The cross-field check `if (isPublic && collaborative)` only catches when both are explicitly `true`. If the playlist is already public and the user only passes `collaborative: true` without `public: false`, validation passes but creates an invalid state. The handler has no knowledge of current playlist state, so it cannot compensate.
- **[#2] MEDIUM -- Overly permissive URI validation.** `addTracksInput.track_uris` and `removeTracksInput.track_uris` use the general `spotifyUriRegex` which permits album, artist, and playlist URIs -- not just tracks. A track-specific regex is needed.
- **[#3] LOW -- Default public visibility.** `createPlaylistInput.public` defaults to `true`, matching Spotify's own default but acting as a privacy footgun when an LLM agent creates playlists on the user's behalf.

### `src/spotify-client.ts`

Fixed cache key bug (now includes query params).

- **[#4] HIGH -- Stale token on retry (pre-existing).** `doFetch` captures `token` from outer scope. On a 401 (expired token), the retry reuses the same stale token. Token expiry mid-request window causes permanent failure until the next full auth cycle.
- **[#5] MEDIUM -- Non-deterministic cache keys.** `URLSearchParams` does not guarantee parameter ordering. Two calls with identical parameters in different order could produce different cache keys, leading to cache misses.
- **[#6] LOW -- Nuclear cache invalidation.** `responseCache.clear()` on any mutation wipes the entire cache, including unrelated playback state. This will scale poorly as tool count grows.

### `src/utils.ts`

Added `extractIdFromUri`. **No issues.**

### `src/tools/playlist-read.ts`

Two read tools: get playlists (paginated) and get playlist tracks (paginated).

- **[#7] MEDIUM -- Track numbering mismatch.** Track numbering uses the filtered array index after removing null tracks. If tracks 3 and 5 are null, the output shows positions `1, 2, 3, 4...` instead of `1, 2, 4, 5...`. An LLM using these numbers for subsequent reorder operations would reference the wrong positions -- potential data corruption.
- **[#8] LOW -- Misleading header count.** The header claims `showing ${offset + 1}-${end}` but `end` is calculated from the unfiltered length. The displayed count may exceed the number of actually visible lines.

### `src/tools/playlist-write.ts`

Six write tools: create, delete, add tracks, remove tracks, update, reorder.

- **[#9] CRITICAL -- Broken delete endpoint.** `spotify_delete_playlist` calls `DELETE /me/library` with `{ uris: [...] }`. The Spotify API expects `ids` (an array of playlist IDs), not `uris`. This tool is almost certainly completely non-functional. As a destructive operation, this is the highest-risk finding.
- **[#10] MEDIUM -- Empty update body sent silently.** `spotify_update_playlist` sends an empty `{}` body if all optional fields are undefined. There is no guard -- the user receives a misleading "Updated playlist" success message despite nothing changing.
- **[#11] MEDIUM -- Unverified create endpoint.** `POST /me/playlists` is used for playlist creation. The Spotify API has historically required `POST /users/{user_id}/playlists`. If the newer shorthand is not supported, playlist creation is broken.
- **[#12] LOW -- Falsy check on `snapshot_id`.** `snapshot_id` is checked with `if (snapshot_id)` which treats an empty string as falsy. Using `!== undefined` would be more precise and intentional.

### `docs/BUILD_GUIDE.md`

Deleted. It is unclear whether its content has been migrated elsewhere.

---

## Cross-Cutting Concerns

### 1. No Tests

Eight new tools, a utility function, a cache fix, and zero test files. For tools that modify user data (delete, reorder, remove tracks), the absence of tests is a significant risk. At minimum, unit tests for `extractIdFromUri`, schema validation edge cases, and tool handlers with mocked `spotifyRequest` are expected.

### 2. No Rate-Limit Awareness

Retry-once logic exists but there is no client-side throttling. An LLM agent could fire 20 operations in rapid succession, exceeding Spotify's rate limits and causing cascading 429 errors.

### 3. Untyped Request Bodies

`Record<string, unknown>` is used for request bodies everywhere instead of typed interfaces. This sacrifices compile-time safety -- malformed payloads will only surface at runtime.

---

## Prioritised Recommendations

| Priority | Action | Findings |
|----------|--------|----------|
| 1. CRITICAL | **Verify and fix `spotify_delete_playlist` endpoint.** `DELETE /me/library` with a `uris` field is almost certainly wrong. Test manually against the Spotify API. This is a broken destructive operation. | #9 |
| 2. CRITICAL | **Verify `POST /me/playlists` endpoint.** May need `POST /users/{user_id}/playlists`. If wrong, playlist creation is broken. | #11 |
| 3. HIGH | **Fix track numbering in `spotify_get_playlist_tracks`.** The filtered-array index mismatch causes wrong position references, leading to incorrect reorder operations downstream. | #7 |
| 4. HIGH | **Add guard for empty update body** in `spotify_update_playlist`. Return an error or no-op message instead of a false success. | #10 |
| 5. MEDIUM | **Tighten `track_uris` validation** with a track-specific regex (e.g. `spotify:track:[a-zA-Z0-9]+`). | #2 |
| 6. MEDIUM | **Add tests.** Unit tests for `extractIdFromUri`, schema validation (especially the cross-field check in #1), and tool handlers with mocked `spotifyRequest`. | Cross-cutting |
| 7. LOW | **Sort cache key params** for deterministic keys. | #5 |
| 8. LOW | **Default playlist visibility to private** for safety in LLM-driven contexts. | #3 |

---

## Architecture Assessment

The new code follows established patterns excellently. File structure, registration pattern, schema-per-tool approach, annotation usage, and the error handling wrapper are all consistent with the existing codebase. The cache key bug fix is a genuine improvement that would have caused real issues with paginated requests.

The concerns are concentrated in API contract correctness (findings #9, #11) and edge-case handling (#1, #7, #10), not in architectural choices.

---

## Verdict

**Do not ship.**

Findings #9 and #11 represent potentially broken tools -- one of which is a destructive operation. These must be verified against the Spotify API and fixed before merging. Finding #7 creates a data corruption pathway when read tools feed position data to write tools.

Once the critical and high-severity items are resolved and basic test coverage is in place, this changeset is in good shape to merge.
