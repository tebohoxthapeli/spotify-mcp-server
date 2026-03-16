import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerEnv } from "../env.js";
import { searchInput } from "../schemas.js";
import { spotifyRequest, withErrorHandling } from "../spotify-client.js";
import type { SpotifySearchResult } from "../types.js";
import { textResult } from "../utils.js";

export function registerSearchTools(server: McpServer, env: ServerEnv): void {
  server.tool(
    "spotify_search",
    "Search Spotify for tracks, artists, albums, or playlists",
    searchInput,
    {
      destructiveHint: false,
      readOnlyHint: true,
    },
    withErrorHandling(async ({ query, type, limit, offset }) => {
      const data = await spotifyRequest<SpotifySearchResult>(
        env,
        "/search",
        "GET",
        undefined,
        {
          limit: String(limit),
          offset: String(offset),
          q: query,
          type: type.join(","),
        },
      );

      if (!data) {
        return textResult("No results found.");
      }

      const sections: string[] = [];

      if (data.tracks?.items.length) {
        const lines = data.tracks.items.map(
          (t) =>
            `  ${t.name} — ${t.artists.map((a) => a.name).join(", ")} [${t.album.name}] (${t.uri})`,
        );
        sections.push(
          `Tracks (${data.tracks.total} total):\n${lines.join("\n")}`,
        );
      }

      if (data.artists?.items.length) {
        const lines = data.artists.items.map(
          (a) =>
            `  ${a.name}${a.genres?.length ? ` [${a.genres.join(", ")}]` : ""} (${a.uri})`,
        );
        sections.push(
          `Artists (${data.artists.total} total):\n${lines.join("\n")}`,
        );
      }

      if (data.albums?.items.length) {
        const lines = data.albums.items.map((a) => `  ${a.name} (${a.uri})`);
        sections.push(
          `Albums (${data.albums.total} total):\n${lines.join("\n")}`,
        );
      }

      if (data.playlists?.items.length) {
        const lines = data.playlists.items.map(
          (p) =>
            `  ${p.name} by ${p.owner.display_name ?? "Unknown"} (${p.uri})`,
        );
        sections.push(
          `Playlists (${data.playlists.total} total):\n${lines.join("\n")}`,
        );
      }

      if (sections.length === 0) {
        return textResult("No results found.");
      }

      return textResult(sections.join("\n\n"));
    }),
  );
}
