# Playlist Tools Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 8 playlist management tools (2 read, 6 write) to the Spotify MCP server.

**Architecture:** Two new tool modules (`playlist-read.ts`, `playlist-write.ts`) following the existing playback tool pattern. Types, schemas, and a URI utility are added to existing shared files. A cache key bug in `spotify-client.ts` is fixed to support paginated queries.

**Tech Stack:** TypeScript, Zod, MCP SDK, Spotify Web API (post-Feb 2026)

**Spec:** `docs/superpowers/specs/2026-03-15-playlist-tools-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types.ts` | Modify | Add 6 playlist interfaces |
| `src/schemas.ts` | Modify | Add 8 input schemas + playlist URI regex |
| `src/utils.ts` | Modify | Add `extractIdFromUri()` |
| `src/spotify-client.ts` | Modify | Fix cache key to include query params |
| `src/auth.ts` | Modify | Add 4 playlist scopes |
| `src/tools/playlist-read.ts` | Create | 2 read tools |
| `src/tools/playlist-write.ts` | Create | 6 write tools |
| `src/index.ts` | Modify | Register playlist tools |

---

## Chunk 1: Foundation (types, schemas, utils, cache fix)

### Task 1: Add playlist types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add 6 interfaces to `src/types.ts`**

Append after `SpotifyTokenResponse` (after line 55):

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
  readonly tracks: { readonly total: number };
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
  readonly track: SpotifyTrack | null;
}

export interface SpotifyPlaylistTracksPage {
  readonly items: readonly SpotifyPlaylistTrackItem[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly next: string | null;
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: PASS, no errors

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add playlist type interfaces"
```

---

### Task 2: Add playlist schemas

**Files:**
- Modify: `src/schemas.ts`

- [ ] **Step 1: Add playlist URI regex and 8 input schemas to `src/schemas.ts`**

After the existing `spotifyUriRegex` (line 3), add:

```typescript
const spotifyPlaylistUriRegex = /^spotify:playlist:[a-zA-Z0-9]+$/;
```

After the existing `setRepeatInput` (after line 34), add all 8 schemas:

```typescript
export const getPlaylistsInput = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Max playlists to return (1-50)"),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Index of first playlist to return"),
};

export const getPlaylistTracksInput = {
  uri: z
    .string()
    .regex(spotifyPlaylistUriRegex, "Must be a playlist URI")
    .describe("Playlist URI"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe("Max tracks to return (1-100)"),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Index of first track to return"),
};

export const createPlaylistInput = {
  name: z.string().min(1).describe("Playlist name"),
  description: z.string().optional().describe("Playlist description"),
  public: z.boolean().default(true).describe("Whether playlist is public"),
  collaborative: z
    .boolean()
    .default(false)
    .describe("Whether playlist is collaborative"),
};

export const deletePlaylistInput = {
  uri: z
    .string()
    .regex(spotifyPlaylistUriRegex, "Must be a playlist URI")
    .describe("Playlist URI to delete"),
};

export const addTracksInput = {
  playlist_uri: z
    .string()
    .regex(spotifyPlaylistUriRegex, "Must be a playlist URI")
    .describe("Target playlist URI"),
  track_uris: z
    .array(z.string().regex(spotifyUriRegex, "Invalid Spotify URI"))
    .min(1)
    .max(100)
    .describe("Track URIs to add"),
};

export const removeTracksInput = {
  playlist_uri: z
    .string()
    .regex(spotifyPlaylistUriRegex, "Must be a playlist URI")
    .describe("Target playlist URI"),
  track_uris: z
    .array(z.string().regex(spotifyUriRegex, "Invalid Spotify URI"))
    .min(1)
    .max(100)
    .describe("Track URIs to remove"),
  snapshot_id: z
    .string()
    .optional()
    .describe("Playlist snapshot ID for concurrency safety"),
};

export const updatePlaylistInput = {
  uri: z
    .string()
    .regex(spotifyPlaylistUriRegex, "Must be a playlist URI")
    .describe("Playlist URI to update"),
  name: z.string().min(1).optional().describe("New name"),
  description: z.string().optional().describe("New description"),
  public: z.boolean().optional().describe("Set public/private"),
  collaborative: z.boolean().optional().describe("Set collaborative"),
};

export const reorderPlaylistTracksInput = {
  uri: z
    .string()
    .regex(spotifyPlaylistUriRegex, "Must be a playlist URI")
    .describe("Playlist URI"),
  range_start: z
    .number()
    .int()
    .min(0)
    .describe("Position of first track to move"),
  insert_before: z
    .number()
    .int()
    .min(0)
    .describe("Position to insert before"),
  range_length: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe("Number of tracks to move"),
  snapshot_id: z
    .string()
    .optional()
    .describe("Playlist snapshot ID for concurrency safety"),
};
```

**Note on `.refine()` for `public + collaborative`:** The spec mentioned cross-field validation, but MCP SDK's `server.tool()` expects a plain object of Zod schemas (not `z.object().refine()`). Validate inside the handler instead — check `if (public && collaborative)` and return an error result.

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/schemas.ts
git commit -m "feat: add playlist input schemas"
```

---

### Task 3: Add `extractIdFromUri` utility

**Files:**
- Modify: `src/utils.ts`

- [ ] **Step 1: Add `extractIdFromUri` to `src/utils.ts`**

After the `textResult` function, add:

```typescript
export function extractIdFromUri(uri: string): string {
  const id = uri.split(":")[2];
  if (!id) {
    throw new Error(`Cannot extract ID from URI: ${uri}`);
  }
  return id;
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/utils.ts
git commit -m "feat: add extractIdFromUri utility"
```

---

### Task 4: Fix response cache key bug

**Files:**
- Modify: `src/spotify-client.ts`

The existing cache keys on `endpoint` path only. Paginated requests with different `offset`/`limit` would return stale cached data because the query params are ignored.

- [ ] **Step 1: Fix cache key in `spotifyRequest`**

In `src/spotify-client.ts`, find the cache check block (around lines 105-111) and the cache set block (around lines 167-173). Both need to use a key that includes query params.

Add a `cacheKey` variable after the `url` construction (after line 98):

```typescript
const cacheKey = queryParams
  ? `${endpoint}?${new URLSearchParams(queryParams).toString()}`
  : endpoint;
```

Replace `responseCache.get(endpoint)` with `responseCache.get(cacheKey)` (cache check).
Replace `responseCache.set(endpoint, ...)` with `responseCache.set(cacheKey, ...)` (cache set).

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/spotify-client.ts
git commit -m "fix: include query params in response cache key"
```

---

## Chunk 2: Read Tools

### Task 5: Implement playlist read tools

**Files:**
- Create: `src/tools/playlist-read.ts`

- [ ] **Step 1: Create `src/tools/playlist-read.ts`**

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerEnv } from "../env.js";
import { getPlaylistsInput, getPlaylistTracksInput } from "../schemas.js";
import { spotifyRequest, withErrorHandling } from "../spotify-client.js";
import type {
  SpotifyPlaylistPage,
  SpotifyPlaylistTracksPage,
} from "../types.js";
import { extractIdFromUri, textResult } from "../utils.js";

const READ_ANNOTATIONS = {
  destructiveHint: false,
  readOnlyHint: true,
} as const;

export function registerPlaylistReadTools(
  server: McpServer,
  env: ServerEnv,
): void {
  server.tool(
    "spotify_get_playlists",
    "Get the current user's playlists",
    getPlaylistsInput,
    READ_ANNOTATIONS,
    withErrorHandling(async ({ limit, offset }) => {
      const data = await spotifyRequest<SpotifyPlaylistPage>(
        env,
        "/me/playlists",
        "GET",
        undefined,
        {
          limit: String(limit),
          offset: String(offset),
        },
      );

      if (!data || data.items.length === 0) {
        return textResult("No playlists found.");
      }

      const end = Math.min(offset + data.items.length, data.total);
      const header = `Playlists (showing ${offset + 1}-${end} of ${data.total}):`;
      const lines = data.items.map((p, i) => {
        const num = offset + i + 1;
        return `${num}. ${p.name} (${p.tracks.total} tracks) — ${p.uri}`;
      });

      return textResult([header, "", ...lines].join("\n"));
    }),
  );

  server.tool(
    "spotify_get_playlist_tracks",
    "Get tracks from a specific playlist",
    getPlaylistTracksInput,
    READ_ANNOTATIONS,
    withErrorHandling(async ({ uri, limit, offset }) => {
      const id = extractIdFromUri(uri);
      const data = await spotifyRequest<SpotifyPlaylistTracksPage>(
        env,
        `/playlists/${id}/items`,
        "GET",
        undefined,
        {
          limit: String(limit),
          offset: String(offset),
        },
      );

      if (!data || data.items.length === 0) {
        return textResult("No tracks found in this playlist.");
      }

      const end = Math.min(offset + data.items.length, data.total);
      const header = `Tracks (showing ${offset + 1}-${end} of ${data.total}):`;
      const lines = data.items
        .filter((item) => item.track !== null)
        .map((item, i) => {
          const t = item.track!;
          const artists = t.artists.map((a) => a.name).join(", ");
          const mins = Math.floor(t.duration_ms / 60_000);
          const secs = Math.floor((t.duration_ms % 60_000) / 1000)
            .toString()
            .padStart(2, "0");
          const num = offset + i + 1;
          return `${num}. ${t.name} — ${artists} (${mins}:${secs}) — ${t.uri}`;
        });

      return textResult([header, "", ...lines].join("\n"));
    }),
  );
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/tools/playlist-read.ts
git commit -m "feat: add playlist read tools"
```

---

## Chunk 3: Write Tools

### Task 6: Implement playlist write tools

**Files:**
- Create: `src/tools/playlist-write.ts`

- [ ] **Step 1: Create `src/tools/playlist-write.ts`**

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerEnv } from "../env.js";
import {
  addTracksInput,
  createPlaylistInput,
  deletePlaylistInput,
  removeTracksInput,
  reorderPlaylistTracksInput,
  updatePlaylistInput,
} from "../schemas.js";
import { spotifyRequest, withErrorHandling } from "../spotify-client.js";
import type { SpotifyPlaylist } from "../types.js";
import { extractIdFromUri, textResult } from "../utils.js";

const WRITE_ANNOTATIONS = {
  destructiveHint: false,
  idempotentHint: false,
  readOnlyHint: false,
} as const;

export function registerPlaylistWriteTools(
  server: McpServer,
  env: ServerEnv,
): void {
  server.tool(
    "spotify_create_playlist",
    "Create a new playlist",
    createPlaylistInput,
    WRITE_ANNOTATIONS,
    withErrorHandling(async ({ name, description, public: isPublic, collaborative }) => {
      if (isPublic && collaborative) {
        return textResult("Error: a collaborative playlist must be non-public.");
      }

      const body: Record<string, unknown> = { name, public: isPublic, collaborative };
      if (description !== undefined) {
        body.description = description;
      }

      const data = await spotifyRequest<SpotifyPlaylist>(
        env,
        "/me/playlists",
        "POST",
        body,
      );

      if (!data) {
        return textResult("Failed to create playlist.");
      }

      return textResult(`Created playlist "${data.name}" — ${data.uri}`);
    }),
  );

  server.tool(
    "spotify_delete_playlist",
    "Delete (unfollow) a playlist",
    deletePlaylistInput,
    {
      destructiveHint: true,
      idempotentHint: true,
      readOnlyHint: false,
    },
    withErrorHandling(async ({ uri }) => {
      await spotifyRequest(env, "/me/library", "DELETE", {
        uris: [uri],
      });
      return textResult(`Playlist removed: ${uri}`);
    }),
  );

  server.tool(
    "spotify_add_tracks",
    "Add tracks to a playlist",
    addTracksInput,
    WRITE_ANNOTATIONS,
    withErrorHandling(async ({ playlist_uri, track_uris }) => {
      const id = extractIdFromUri(playlist_uri);
      await spotifyRequest(env, `/playlists/${id}/items`, "POST", {
        uris: track_uris,
      });
      return textResult(`Added ${track_uris.length} track(s) to playlist.`);
    }),
  );

  server.tool(
    "spotify_remove_tracks",
    "Remove tracks from a playlist",
    removeTracksInput,
    {
      destructiveHint: true,
      idempotentHint: false,
      readOnlyHint: false,
    },
    withErrorHandling(async ({ playlist_uri, track_uris, snapshot_id }) => {
      const id = extractIdFromUri(playlist_uri);
      const body: Record<string, unknown> = {
        tracks: track_uris.map((uri) => ({ uri })),
      };
      if (snapshot_id) {
        body.snapshot_id = snapshot_id;
      }

      await spotifyRequest(env, `/playlists/${id}/items`, "DELETE", body);
      return textResult(`Removed ${track_uris.length} track(s) from playlist.`);
    }),
  );

  server.tool(
    "spotify_update_playlist",
    "Update a playlist's name, description, or visibility",
    updatePlaylistInput,
    {
      destructiveHint: false,
      idempotentHint: true,
      readOnlyHint: false,
    },
    withErrorHandling(async ({ uri, name, description, public: isPublic, collaborative }) => {
      if (isPublic && collaborative) {
        return textResult("Error: a collaborative playlist must be non-public.");
      }

      const id = extractIdFromUri(uri);
      const body: Record<string, unknown> = {};
      if (name !== undefined) body.name = name;
      if (description !== undefined) body.description = description;
      if (isPublic !== undefined) body.public = isPublic;
      if (collaborative !== undefined) body.collaborative = collaborative;

      await spotifyRequest(env, `/playlists/${id}`, "PUT", body);
      return textResult(`Updated playlist: ${uri}`);
    }),
  );

  server.tool(
    "spotify_reorder_tracks",
    "Reorder tracks within a playlist",
    reorderPlaylistTracksInput,
    WRITE_ANNOTATIONS,
    withErrorHandling(async ({ uri, range_start, insert_before, range_length, snapshot_id }) => {
      const id = extractIdFromUri(uri);
      const body: Record<string, unknown> = {
        range_start,
        insert_before,
        range_length,
      };
      if (snapshot_id) {
        body.snapshot_id = snapshot_id;
      }

      await spotifyRequest(env, `/playlists/${id}/items`, "PUT", body);
      return textResult("Reordered tracks in playlist.");
    }),
  );
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/tools/playlist-write.ts
git commit -m "feat: add playlist write tools"
```

---

## Chunk 4: Registration and Scopes

### Task 7: Register playlist tools in index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add imports and registration calls**

After the existing imports (lines 4-5), add:

```typescript
import { registerPlaylistReadTools } from "./tools/playlist-read.js";
import { registerPlaylistWriteTools } from "./tools/playlist-write.js";
```

After the existing `registerWriteTools(server, env);` (line 15), add:

```typescript
registerPlaylistReadTools(server, env);
registerPlaylistWriteTools(server, env);
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: register playlist tools in server"
```

---

### Task 8: Add playlist OAuth scopes

**Files:**
- Modify: `src/auth.ts`

- [ ] **Step 1: Update `SCOPES` constant**

In `src/auth.ts`, find the `SCOPES` constant (lines 8-9) and append the 4 playlist scopes:

```typescript
const SCOPES =
  "user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private";
```

- [ ] **Step 2: Commit**

```bash
git add src/auth.ts
git commit -m "feat: add playlist OAuth scopes"
```

---

## Chunk 5: Verification

### Task 9: Final checks

- [ ] **Step 1: Lint and type-check**

Run: `bun run check`
Expected: PASS, no errors

- [ ] **Step 2: Build/start test**

Run: `bun run start` (Ctrl+C after startup message)
Expected: "Spotify MCP Server running on stdio"

- [ ] **Step 3: Remind user to re-auth**

After all changes, the user must run `bun run auth` to re-authorise with the new playlist scopes. Existing refresh token won't have playlist permissions.
