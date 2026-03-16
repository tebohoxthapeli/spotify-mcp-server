import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerEnv } from "../env.js";
import { queueTrackInput } from "../schemas.js";
import { spotifyRequest, withErrorHandling } from "../spotify-client.js";
import { textResult } from "../utils.js";

export function registerQueueTools(server: McpServer, env: ServerEnv): void {
  server.tool(
    "spotify_queue_track",
    "Add a track or episode to the playback queue",
    queueTrackInput,
    {
      destructiveHint: false,
      idempotentHint: false,
      readOnlyHint: false,
    },
    withErrorHandling(async ({ uri }) => {
      await spotifyRequest(env, "/me/player/queue", "POST", undefined, {
        uri,
      });

      return textResult(`Added to queue: ${uri}`);
    }),
  );
}
