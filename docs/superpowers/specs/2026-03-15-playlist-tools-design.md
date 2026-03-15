# Playlist Tools — Design Spec

## Context

The MCP server currently only supports playback control (play, pause, skip, volume, etc.). The user wants full playlist management: listing, creating, deleting, and modifying playlists and their tracks. This requires new OAuth scopes, new types, new schemas, and two new tool registration modules.

## Decisions

- **Playlist identification:** Spotify URIs (e.g. `spotify:playlist:37i9dQZF1DXcBWIGoYBM5M`), consistent with existing track/album URI patterns
- **Delete semantics:** Tool named `spotify_delete_playlist` — calls `DELETE /me/library` under the hood (Feb 2026 API)
- **Pagination:** Both list tools accept `limit`/`offset` params
- **Architecture:** Two new files (`playlist-read.ts`, `playlist-write.ts`) mirroring existing `playback-read.ts`/`playback-write.ts`
- **API version:** All endpoints target the post-February 2026 Spotify API (`/items` not `/tracks`, `DELETE /me/library` not `/followers`)

## OAuth Scopes

Add to `SCOPES` in `src/auth.ts`:

```
playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private
```

User must re-run `bun run auth` after this change.

## Types (`src/types.ts`)

```typescript
export interface SpotifyPlaylistOwner {
  readonly display_name: string | null;
  readonly id: string;
}

export interface SpotifyImage {
  readonly url: string;
  readonly height: number | null;
  readonly width: number | null;
}

export interface SpotifyPlaylist {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly uri: string;
  readonly external_urls: { readonly spotify: string };
  readonly owner: SpotifyPlaylistOwner;
  readonly images: readonly SpotifyImage[];
  readonly tracks: { readonly total: number }; // intentionally partial — only total needed for list display
  readonly public: boolean | null;
  readonly collaborative: boolean;
  readonly snapshot_id: string;
}

export interface SpotifyPlaylistPage {
  readonly items: readonly SpotifyPlaylist[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly next: string | null;
}

export interface SpotifyPlaylistTrackItem {
  readonly added_at: string;
  readonly track: SpotifyTrack | null; // null for local files or removed tracks
}

export interface SpotifyPlaylistTracksPage {
  readonly items: readonly SpotifyPlaylistTrackItem[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly next: string | null;
}
```

6 new interfaces total. `SpotifyUserProfile` is not needed — `POST /me/playlists` works directly.

## Schemas (`src/schemas.ts`)

```typescript
// New playlist-specific URI regex
const spotifyPlaylistUriRegex = /^spotify:playlist:[a-zA-Z0-9]+$/;

// Reuses existing spotifyUriRegex for track URIs

export const getPlaylistsInput = {
  limit: z.number().int().min(1).max(50).default(20).describe("Max playlists to return (1-50)"),
  offset: z.number().int().min(0).default(0).describe("Index of first playlist to return"),
};

export const getPlaylistTracksInput = {
  uri: z.string().regex(spotifyPlaylistUriRegex, "Must be a playlist URI").describe("Playlist URI"),
  limit: z.number().int().min(1).max(100).default(50).describe("Max tracks to return (1-100)"),
  offset: z.number().int().min(0).default(0).describe("Index of first track to return"),
};

export const createPlaylistInput = z.object({
  name: z.string().min(1).describe("Playlist name"),
  description: z.string().optional().describe("Playlist description"),
  public: z.boolean().default(true).describe("Whether playlist is public"),
  collaborative: z.boolean().default(false).describe("Whether playlist is collaborative"),
}).refine(
  (data) => !(data.public && data.collaborative),
  { message: "A collaborative playlist must be non-public" }
);

export const deletePlaylistInput = {
  uri: z.string().regex(spotifyPlaylistUriRegex, "Must be a playlist URI").describe("Playlist URI to delete"),
};

export const addTracksInput = {
  playlist_uri: z.string().regex(spotifyPlaylistUriRegex, "Must be a playlist URI").describe("Target playlist URI"),
  track_uris: z.array(z.string().regex(spotifyUriRegex, "Invalid Spotify URI")).min(1).max(100).describe("Track URIs to add"),
};

export const removeTracksInput = {
  playlist_uri: z.string().regex(spotifyPlaylistUriRegex, "Must be a playlist URI").describe("Target playlist URI"),
  track_uris: z.array(z.string().regex(spotifyUriRegex, "Invalid Spotify URI")).min(1).max(100).describe("Track URIs to remove"),
  snapshot_id: z.string().optional().describe("Playlist snapshot ID for concurrency safety"),
};

export const updatePlaylistInput = z.object({
  uri: z.string().regex(spotifyPlaylistUriRegex, "Must be a playlist URI").describe("Playlist URI to update"),
  name: z.string().min(1).optional().describe("New name"),
  description: z.string().optional().describe("New description"),
  public: z.boolean().optional().describe("Set public/private"),
  collaborative: z.boolean().optional().describe("Set collaborative"),
}).refine(
  (data) => !(data.public && data.collaborative),
  { message: "A collaborative playlist must be non-public" }
);

export const reorderPlaylistTracksInput = {
  uri: z.string().regex(spotifyPlaylistUriRegex, "Must be a playlist URI").describe("Playlist URI"),
  range_start: z.number().int().min(0).describe("Position of first track to move"),
  insert_before: z.number().int().min(0).describe("Position to insert before"),
  range_length: z.number().int().min(1).default(1).describe("Number of tracks to move"),
  snapshot_id: z.string().optional().describe("Playlist snapshot ID for concurrency safety"),
};
```

**Note:** `createPlaylistInput` and `updatePlaylistInput` use `z.object().refine()` instead of plain objects for cross-field validation. Need to verify MCP SDK accepts refined schemas — if not, validate inside the handler instead.

## Utility (`src/utils.ts`)

```typescript
export function extractIdFromUri(uri: string): string {
  const id = uri.split(":")[2];
  if (!id) throw new Error(`Cannot extract ID from URI: ${uri}`);
  return id;
}
```

## Bug Fix: Response Cache Key (`src/spotify-client.ts`)

The existing cache keys on `endpoint` path only, ignoring query params. Paginated playlist requests with different `offset`/`limit` values would return stale cached data. Fix: include query params in the cache key.

```typescript
// Before (line 108):
const cached = responseCache.get(endpoint);

// After:
const cacheKey = queryParams
  ? `${endpoint}?${new URLSearchParams(queryParams).toString()}`
  : endpoint;
const cached = responseCache.get(cacheKey);
```

Apply same fix to the cache set (line 169).

## Tools

### Read Tools (`src/tools/playlist-read.ts`)

#### `spotify_get_playlists`
- **Endpoint:** `GET /me/playlists?limit={limit}&offset={offset}`
- **Response type:** `SpotifyPlaylistPage`
- **Output format:**
  ```
  Playlists (showing 1-20 of 45):

  1. My Playlist (12 tracks) — spotify:playlist:abc123
  2. Chill Vibes (34 tracks) — spotify:playlist:def456
  ```
- **Annotations:** `readOnlyHint: true, destructiveHint: false`

#### `spotify_get_playlist_tracks`
- **Endpoint:** `GET /playlists/{id}/items?limit={limit}&offset={offset}`
- **Response type:** `SpotifyPlaylistTracksPage`
- **Output:** Lists tracks with name, artists, duration, URI. Skips null tracks (local files / removed).
- **Annotations:** `readOnlyHint: true, destructiveHint: false`

### Write Tools (`src/tools/playlist-write.ts`)

#### `spotify_create_playlist`
- **Endpoint:** `POST /me/playlists`
- **Body:** `{ name, description, public, collaborative }`
- **Output:** `Created playlist "Name" — spotify:playlist:xyz`
- **Annotations:** `destructiveHint: false, idempotentHint: false, readOnlyHint: false`

#### `spotify_delete_playlist`
- **Endpoint:** `DELETE /me/library`
- **Body:** `{ uris: ["spotify:playlist:xyz"] }`
- **Output:** `Playlist removed: spotify:playlist:xyz`
- **Annotations:** `destructiveHint: true, idempotentHint: true, readOnlyHint: false`

#### `spotify_add_tracks`
- **Endpoint:** `POST /playlists/{id}/items`
- **Body:** `{ uris: [...track_uris] }`
- **Output:** `Added {n} track(s) to playlist.`
- **Annotations:** `destructiveHint: false, idempotentHint: false, readOnlyHint: false`

#### `spotify_remove_tracks`
- **Endpoint:** `DELETE /playlists/{id}/items`
- **Body:** `{ tracks: [{ uri: "..." }, ...], snapshot_id? }`
- **Output:** `Removed {n} track(s) from playlist.`
- **Annotations:** `destructiveHint: true, idempotentHint: false, readOnlyHint: false`

#### `spotify_update_playlist`
- **Endpoint:** `PUT /playlists/{id}`
- **Body:** Only includes fields that were provided (partial update)
- **Output:** `Updated playlist: spotify:playlist:xyz`
- **Annotations:** `destructiveHint: false, idempotentHint: true, readOnlyHint: false`

#### `spotify_reorder_tracks`
- **Endpoint:** `PUT /playlists/{id}/items`
- **Body:** `{ range_start, insert_before, range_length, snapshot_id? }`
- **Output:** `Reordered tracks in playlist.`
- **Annotations:** `destructiveHint: false, idempotentHint: false, readOnlyHint: false`

## Registration (`src/index.ts`)

```typescript
import { registerPlaylistReadTools } from "./tools/playlist-read.js";
import { registerPlaylistWriteTools } from "./tools/playlist-write.js";

registerPlaylistReadTools(server, env);
registerPlaylistWriteTools(server, env);
```

## Files Modified

| File | Change |
|------|--------|
| `src/auth.ts` | Add 4 playlist scopes to `SCOPES` |
| `src/types.ts` | Add 6 new interfaces |
| `src/schemas.ts` | Add 8 new input schemas + `spotifyPlaylistUriRegex` |
| `src/utils.ts` | Add `extractIdFromUri()` |
| `src/index.ts` | Import and register playlist tools |
| `src/spotify-client.ts` | Fix cache key to include query params |

## Files Created

| File | Purpose |
|------|---------|
| `src/tools/playlist-read.ts` | 2 read tools |
| `src/tools/playlist-write.ts` | 6 write tools |

## Verification

1. `bun run check` — type-check and lint pass
2. `bun run auth` — re-auth with new scopes
3. `bun run start` — server starts without errors
4. Test each tool via MCP inspector or Claude Desktop:
   - List playlists, verify pagination works (different offsets return different results)
   - Get tracks from a known playlist
   - Create a test playlist, verify it appears in Spotify
   - Add/remove tracks from the test playlist
   - Rename the test playlist
   - Reorder tracks
   - Delete the test playlist

## Unresolved

- **z.object().refine() + MCP SDK:** Need to verify the MCP SDK's `server.tool()` accepts refined Zod schemas for the `createPlaylistInput` and `updatePlaylistInput`. If not, move validation into the handler.
