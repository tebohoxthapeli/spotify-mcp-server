import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerEnv } from "../env.js";
import { getPlaylistsInput, getPlaylistTracksInput } from "../schemas.js";
import { spotifyRequest, withErrorHandling } from "../spotify-client.js";
import type {
  SpotifyPlaylistPage,
  SpotifyPlaylistTrackItem,
  SpotifyPlaylistTracksPage,
  SpotifyTrack,
} from "../types.js";
import { extractIdFromUri, READ_ANNOTATIONS, textResult } from "../utils.js";

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
        const trackCount = p.tracks?.total ?? "?";
        return `${num}. ${p.name} (${trackCount} tracks) — ${p.uri}`;
      });

      return textResult(
        [
          header,
          "",
          ...lines,
        ].join("\n"),
      );
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

      const tracks = data.items
        .map((entry, i) => ({
          entry,
          originalIndex: i,
        }))
        .filter(
          (
            row,
          ): row is {
            entry: SpotifyPlaylistTrackItem & {
              item: SpotifyTrack;
            };
            originalIndex: number;
          } => row.entry.item != null && Array.isArray(row.entry.item.artists),
        );
      const end = Math.min(offset + tracks.length, data.total);
      const header = `Tracks (showing ${offset + 1}-${end} of ${data.total}):`;
      const lines = tracks.map(({ entry, originalIndex }) => {
        const t = entry.item;
        const artists = t.artists.map((a) => a.name).join(", ");
        const mins = Math.floor(t.duration_ms / 60_000);
        const secs = Math.floor((t.duration_ms % 60_000) / 1000)
          .toString()
          .padStart(2, "0");
        const num = offset + originalIndex + 1;
        return `${num}. ${t.name} — ${artists} (${mins}:${secs}) — ${t.uri}`;
      });

      return textResult(
        [
          header,
          "",
          ...lines,
        ].join("\n"),
      );
    }),
  );
}
