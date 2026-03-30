import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerEnv } from "../env.js";
import { getArtistTopTracksInput } from "../schemas.js";
import { withErrorHandling } from "../spotify-client.js";
import {
  extractIdFromUri,
  formatDuration,
  getArtistName,
  READ_ANNOTATIONS,
  searchTracksByArtist,
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

      const artistName = await getArtistName(env, artistId);
      if (!artistName) {
        return textResult("Artist not found.");
      }

      const data = await searchTracksByArtist(env, artistName, 10);
      const tracks = data?.tracks?.items ?? [];

      if (tracks.length === 0) {
        return textResult("No top tracks found for this artist.");
      }

      const lines = tracks.map(
        (t, i) =>
          `  ${i + 1}. ${t.name} — ${t.artists.map((a) => a.name).join(", ")} [${t.album.name}] (${formatDuration(t.duration_ms)}) (${t.uri})`,
      );

      return textResult(`Top tracks for ${artistName}:\n${lines.join("\n")}`);
    }),
  );
}
