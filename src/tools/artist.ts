import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerEnv } from "../env.js";
import { getArtistTopTracksInput } from "../schemas.js";
import { spotifyRequest, withErrorHandling } from "../spotify-client.js";
import type { SpotifyTopTracksResponse } from "../types.js";
import {
  extractIdFromUri,
  formatDuration,
  READ_ANNOTATIONS,
  textResult,
} from "../utils.js";

export function registerArtistTools(server: McpServer, env: ServerEnv): void {
  server.tool(
    "spotify_get_artist_top_tracks",
    "Get an artist's top tracks by artist URI. Use this after finding an artist via search to browse their catalogue.",
    getArtistTopTracksInput,
    READ_ANNOTATIONS,
    withErrorHandling(async ({ uri }) => {
      const artistId = extractIdFromUri(uri);

      const data = await spotifyRequest<SpotifyTopTracksResponse>(
        env,
        `/artists/${artistId}/top-tracks`,
      );

      if (!data || !data.tracks.length) {
        return textResult("No top tracks found for this artist.");
      }

      const lines = data.tracks.map(
        (t, i) =>
          `  ${i + 1}. ${t.name} — ${t.artists.map((a) => a.name).join(", ")} [${t.album.name}] (${formatDuration(t.duration_ms)}) (${t.uri})`,
      );

      return textResult(`Top tracks:\n${lines.join("\n")}`);
    }),
  );
}
