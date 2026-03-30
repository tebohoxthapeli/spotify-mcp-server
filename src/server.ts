import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerEnv } from "./env.js";
import { registerArtistTools } from "./tools/artist.js";
import { registerHistoryTools } from "./tools/history.js";
import { registerReadTools } from "./tools/playback-read.js";
import { registerWriteTools } from "./tools/playback-write.js";
import { registerPlaylistReadTools } from "./tools/playlist-read.js";
import { registerPlaylistWriteTools } from "./tools/playlist-write.js";
import { registerQueueTools } from "./tools/queue.js";
import { registerRecommendationTools } from "./tools/recommendations.js";
import { registerSearchTools } from "./tools/search.js";
import { registerUserTools } from "./tools/user.js";

export function createServer(env: ServerEnv): McpServer {
  const server = new McpServer({
    name: "spotify-mcp-server",
    version: "1.0.0",
  });

  registerReadTools(server, env);
  registerWriteTools(server, env);
  registerPlaylistReadTools(server, env);
  registerPlaylistWriteTools(server, env);
  registerSearchTools(server, env);
  registerArtistTools(server, env);
  registerHistoryTools(server, env);
  registerQueueTools(server, env);
  registerRecommendationTools(server, env);
  registerUserTools(server, env);

  return server;
}
