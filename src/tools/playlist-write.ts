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
    withErrorHandling(
      async ({ name, description, public: isPublic, collaborative }) => {
        if (isPublic && collaborative) {
          return textResult(
            "Error: a collaborative playlist must be non-public.",
          );
        }

        const body: Record<string, unknown> = {
          collaborative,
          name,
          public: isPublic,
        };
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
      },
    ),
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
      await spotifyRequest(env, "/me/library", "DELETE", undefined, {
        uris: uri,
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
        items: track_uris.map((uri) => ({
          uri,
        })),
      };
      if (snapshot_id !== undefined) {
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
    withErrorHandling(
      async ({ uri, name, description, public: isPublic, collaborative }) => {
        if (isPublic && collaborative) {
          return textResult(
            "Error: a collaborative playlist must be non-public.",
          );
        }

        const id = extractIdFromUri(uri);
        const body: Record<string, unknown> = {};
        if (name !== undefined) body.name = name;
        if (description !== undefined) body.description = description;
        if (isPublic !== undefined) body.public = isPublic;
        if (collaborative !== undefined) body.collaborative = collaborative;

        if (Object.keys(body).length === 0) {
          return textResult(
            "Error: no fields provided to update. Specify at least one of: name, description, public, collaborative.",
          );
        }

        await spotifyRequest(env, `/playlists/${id}`, "PUT", body);
        return textResult(`Updated playlist: ${uri}`);
      },
    ),
  );

  server.tool(
    "spotify_reorder_tracks",
    "Reorder tracks within a playlist",
    reorderPlaylistTracksInput,
    WRITE_ANNOTATIONS,
    withErrorHandling(
      async ({
        uri,
        range_start,
        insert_before,
        range_length,
        snapshot_id,
      }) => {
        const id = extractIdFromUri(uri);
        const body: Record<string, unknown> = {
          insert_before,
          range_length,
          range_start,
        };
        if (snapshot_id !== undefined) {
          body.snapshot_id = snapshot_id;
        }

        await spotifyRequest(env, `/playlists/${id}/items`, "PUT", body);
        return textResult("Reordered tracks in playlist.");
      },
    ),
  );
}
