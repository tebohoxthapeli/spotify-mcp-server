import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerEnv } from "./env.js";
import { registerReadTools } from "./tools/playback-read.js";
import { registerWriteTools } from "./tools/playback-write.js";
import { registerPlaylistReadTools } from "./tools/playlist-read.js";
import { registerPlaylistWriteTools } from "./tools/playlist-write.js";

export function createServer(env: ServerEnv): McpServer {
  const server = new McpServer({
    name: "spotify-mcp-server",
    version: "1.0.0",
  });

  registerReadTools(server, env);
  registerWriteTools(server, env);
  registerPlaylistReadTools(server, env);
  registerPlaylistWriteTools(server, env);

  return server;
}
