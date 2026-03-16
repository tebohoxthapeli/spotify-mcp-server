import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerEnv } from "../env.js";
import { recentlyPlayedInput } from "../schemas.js";
import { spotifyRequest, withErrorHandling } from "../spotify-client.js";
import type { SpotifyCursorPage, SpotifyPlayHistoryItem } from "../types.js";
import { textResult } from "../utils.js";

export function registerHistoryTools(server: McpServer, env: ServerEnv): void {
  server.tool(
    "spotify_get_recently_played",
    "Get recently played tracks (requires user-read-recently-played scope)",
    recentlyPlayedInput,
    {
      destructiveHint: false,
      readOnlyHint: true,
    },
    withErrorHandling(async ({ limit, after, before }) => {
      const params: Record<string, string> = {
        limit: String(limit),
      };
      if (after !== undefined) {
        params.after = String(after);
      } else if (before !== undefined) {
        params.before = String(before);
      }

      const data = await spotifyRequest<
        SpotifyCursorPage<SpotifyPlayHistoryItem>
      >(env, "/me/player/recently-played", "GET", undefined, params);

      if (!data || data.items.length === 0) {
        return textResult("No recently played tracks.");
      }

      const lines = data.items.map((item) => {
        const artists = item.track.artists.map((a) => a.name).join(", ");
        return `${item.track.name} — ${artists} (played ${item.played_at}) [${item.track.uri}]`;
      });

      let text = `Recently played (${data.items.length} tracks):\n${lines.join("\n")}`;

      if (data.cursors) {
        text += `\n\nNext cursor (after): ${data.cursors.after}`;
      }

      return textResult(text);
    }),
  );
}
