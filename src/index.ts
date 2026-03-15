import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseServerEnv } from "./env.js";
import { registerReadTools } from "./tools/playback-read.js";
import { registerWriteTools } from "./tools/playback-write.js";
import { registerPlaylistReadTools } from "./tools/playlist-read.js";
import { registerPlaylistWriteTools } from "./tools/playlist-write.js";

const env = parseServerEnv();

const server = new McpServer({
  name: "spotify-mcp-server",
  version: "1.0.0",
});

registerReadTools(server, env);
registerWriteTools(server, env);
registerPlaylistReadTools(server, env);
registerPlaylistWriteTools(server, env);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Spotify MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
