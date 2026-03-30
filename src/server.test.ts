import { describe, expect, mock, test } from "bun:test";

const registeredTools: string[] = [];

mock.module("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class MockMcpServer {
    constructor() {
      registeredTools.length = 0;
    }
    tool(...args: unknown[]) {
      registeredTools.push(args[0] as string);
    }
  },
}));

mock.module("./spotify-client.js", () => ({
  spotifyRequest: mock(() => Promise.resolve(null)),
  withErrorHandling: mock((handler: Function) => handler),
}));

const { createServer } = await import("./server.js");

const mockEnv = {
  SPOTIFY_CLIENT_ID: "test-client-id",
  SPOTIFY_CLIENT_SECRET: "test-client-secret",
  SPOTIFY_REDIRECT_URI: "http://127.0.0.1:8888/callback",
  SPOTIFY_REFRESH_TOKEN: "test-refresh-token",
  MCP_TRANSPORT: "stdio" as const,
  MCP_HTTP_PORT: 3001,
  MCP_HTTP_SECRET: undefined,
};

const EXPECTED_TOOLS = [
  // playback-read
  "spotify_get_current_track",
  "spotify_get_player_state",
  "spotify_get_position",
  "spotify_get_volume",
  "spotify_get_shuffle",
  "spotify_get_repeat",
  // playback-write
  "spotify_play",
  "spotify_pause",
  "spotify_playpause",
  "spotify_next_track",
  "spotify_previous_track",
  "spotify_play_track",
  "spotify_set_position",
  "spotify_set_volume",
  "spotify_set_shuffle",
  "spotify_set_repeat",
  // playlist-read
  "spotify_get_playlists",
  "spotify_get_playlist_tracks",
  // playlist-write
  "spotify_create_playlist",
  "spotify_delete_playlist",
  "spotify_add_tracks",
  "spotify_remove_tracks",
  "spotify_update_playlist",
  "spotify_reorder_tracks",
  // search
  "spotify_search",
  // artist
  "spotify_get_artist_top_tracks",
  // history
  "spotify_get_recently_played",
  // queue
  "spotify_queue_track",
  // recommendations
  "spotify_get_recommendations",
  // user
  "spotify_get_profile",
  "spotify_get_top_items",
  "spotify_get_followed_artists",
] as const;

describe("createServer", () => {
  test("registers all expected MCP tools", () => {
    createServer(mockEnv as never);

    for (const name of EXPECTED_TOOLS) {
      expect(registeredTools).toContain(name);
    }
  });

  test("does not register unexpected tools", () => {
    createServer(mockEnv as never);

    for (const name of registeredTools) {
      expect(EXPECTED_TOOLS).toContain(name as typeof EXPECTED_TOOLS[number]);
    }
  });

  test(`registers exactly ${EXPECTED_TOOLS.length} tools`, () => {
    createServer(mockEnv as never);
    expect(registeredTools).toHaveLength(EXPECTED_TOOLS.length);
  });
});
