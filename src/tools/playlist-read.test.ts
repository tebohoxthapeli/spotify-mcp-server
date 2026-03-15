import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock spotify-client module before importing the module under test
const mockSpotifyRequest = mock(() => Promise.resolve(null as unknown));
const mockWithErrorHandling = mock((handler: Function) => handler);

mock.module("../spotify-client.js", () => ({
  spotifyRequest: mockSpotifyRequest,
  withErrorHandling: mockWithErrorHandling,
}));

const { registerPlaylistReadTools } = await import("./playlist-read.js");

// -- helpers --

function createMockServer() {
  const tools = new Map<string, Function>();
  return {
    getHandler: (name: string) => tools.get(name),
    tool: mock((...args: unknown[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as Function;
      tools.set(name, handler);
    }),
  };
}

const mockEnv = {
  SPOTIFY_CLIENT_ID: "test-client-id",
  SPOTIFY_CLIENT_SECRET: "test-client-secret",
  SPOTIFY_REDIRECT_URI: "http://127.0.0.1:8888/callback",
  SPOTIFY_REFRESH_TOKEN: "test-refresh-token",
};

function textResult(text: string) {
  return {
    content: [
      {
        text,
        type: "text",
      },
    ],
  };
}

// -- tests --

describe("playlist-read tools", () => {
  let server: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    mockSpotifyRequest.mockReset();
    server = createMockServer();
    registerPlaylistReadTools(server as any, mockEnv);
  });

  test("registers both playlist read tools", () => {
    expect(server.tool).toHaveBeenCalledTimes(2);
    expect(server.getHandler("spotify_get_playlists")).toBeDefined();
    expect(server.getHandler("spotify_get_playlist_tracks")).toBeDefined();
  });

  // -- spotify_get_playlists --

  describe("spotify_get_playlists", () => {
    test("returns formatted playlist list", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        items: [
          {
            name: "Chill Vibes",
            tracks: {
              total: 42,
            },
            uri: "spotify:playlist:aaa111",
          },
          {
            name: "Workout Mix",
            tracks: {
              total: 18,
            },
            uri: "spotify:playlist:bbb222",
          },
        ],
        total: 5,
      });

      const handler = server.getHandler("spotify_get_playlists")!;
      const result = await handler({
        limit: 20,
        offset: 0,
      });

      expect(result).toEqual(
        textResult(
          [
            "Playlists (showing 1-2 of 5):",
            "",
            "1. Chill Vibes (42 tracks) — spotify:playlist:aaa111",
            "2. Workout Mix (18 tracks) — spotify:playlist:bbb222",
          ].join("\n"),
        ),
      );
    });

    test("handles offset correctly in numbering", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        items: [
          {
            name: "Third Playlist",
            tracks: {
              total: 10,
            },
            uri: "spotify:playlist:ccc333",
          },
        ],
        total: 10,
      });

      const handler = server.getHandler("spotify_get_playlists")!;
      const result = await handler({
        limit: 1,
        offset: 2,
      });

      expect(result).toEqual(
        textResult(
          [
            "Playlists (showing 3-3 of 10):",
            "",
            "3. Third Playlist (10 tracks) — spotify:playlist:ccc333",
          ].join("\n"),
        ),
      );
    });

    test("shows '?' when tracks is null", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        items: [
          {
            name: "No Track Count",
            tracks: null,
            uri: "spotify:playlist:ddd444",
          },
        ],
        total: 1,
      });

      const handler = server.getHandler("spotify_get_playlists")!;
      const result = await handler({
        limit: 20,
        offset: 0,
      });

      expect(result).toEqual(
        textResult(expect.stringContaining("(? tracks)") as any),
      );
    });

    test("returns no playlists message when data is null", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_get_playlists")!;
      const result = await handler({
        limit: 20,
        offset: 0,
      });

      expect(result).toEqual(textResult("No playlists found."));
    });

    test("returns no playlists message when items array is empty", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        items: [],
        total: 0,
      });

      const handler = server.getHandler("spotify_get_playlists")!;
      const result = await handler({
        limit: 20,
        offset: 0,
      });

      expect(result).toEqual(textResult("No playlists found."));
    });

    test("passes limit and offset as query params", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_get_playlists")!;
      await handler({
        limit: 10,
        offset: 5,
      });

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/playlists",
        "GET",
        undefined,
        {
          limit: "10",
          offset: "5",
        },
      );
    });

    test("caps 'end' display at total", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        items: [
          {
            name: "Last One",
            tracks: {
              total: 3,
            },
            uri: "spotify:playlist:eee555",
          },
        ],
        total: 3,
      });

      const handler = server.getHandler("spotify_get_playlists")!;
      const result = await handler({
        limit: 20,
        offset: 2,
      });

      // offset=2, 1 item returned, total=3 → showing 3-3 of 3
      expect(result).toEqual(
        textResult(expect.stringContaining("showing 3-3 of 3") as any),
      );
    });
  });

  // -- spotify_get_playlist_tracks --

  describe("spotify_get_playlist_tracks", () => {
    test("returns formatted track list", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        items: [
          {
            added_at: "2024-01-01T00:00:00Z",
            item: {
              artists: [
                {
                  name: "Artist A",
                },
              ],
              duration_ms: 210000, // 3:30
              name: "Song One",
              uri: "spotify:track:t1",
            },
          },
          {
            added_at: "2024-01-02T00:00:00Z",
            item: {
              artists: [
                {
                  name: "Artist B",
                },
                {
                  name: "Artist C",
                },
              ],
              duration_ms: 185000, // 3:05
              name: "Song Two",
              uri: "spotify:track:t2",
            },
          },
        ],
        total: 50,
      });

      const handler = server.getHandler("spotify_get_playlist_tracks")!;
      const result = await handler({
        limit: 50,
        offset: 0,
        uri: "spotify:playlist:xyz",
      });

      expect(result).toEqual(
        textResult(
          [
            "Tracks (showing 1-2 of 50):",
            "",
            "1. Song One — Artist A (3:30) — spotify:track:t1",
            "2. Song Two — Artist B, Artist C (3:05) — spotify:track:t2",
          ].join("\n"),
        ),
      );
    });

    test("extracts playlist ID from URI", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_get_playlist_tracks")!;
      await handler({
        limit: 50,
        offset: 0,
        uri: "spotify:playlist:abc123",
      });

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/playlists/abc123/items",
        "GET",
        undefined,
        {
          limit: "50",
          offset: "0",
        },
      );
    });

    test("returns no tracks message when data is null", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_get_playlist_tracks")!;
      const result = await handler({
        limit: 50,
        offset: 0,
        uri: "spotify:playlist:empty",
      });

      expect(result).toEqual(textResult("No tracks found in this playlist."));
    });

    test("returns no tracks message when items array is empty", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        items: [],
        total: 0,
      });

      const handler = server.getHandler("spotify_get_playlist_tracks")!;
      const result = await handler({
        limit: 50,
        offset: 0,
        uri: "spotify:playlist:empty2",
      });

      expect(result).toEqual(textResult("No tracks found in this playlist."));
    });

    test("filters out items with null item", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        items: [
          {
            added_at: "2024-01-01T00:00:00Z",
            item: null,
          },
          {
            added_at: "2024-01-02T00:00:00Z",
            item: {
              artists: [
                {
                  name: "Artist",
                },
              ],
              duration_ms: 120000,
              name: "Valid Track",
              uri: "spotify:track:valid",
            },
          },
        ],
        total: 2,
      });

      const handler = server.getHandler("spotify_get_playlist_tracks")!;
      const result = await handler({
        limit: 50,
        offset: 0,
        uri: "spotify:playlist:mixed",
      });

      // The null track is at index 0, valid track at index 1
      // originalIndex for valid track = 1, so number = offset(0) + 1 + 1 = 2
      expect(result).toEqual(
        textResult(
          [
            "Tracks (showing 1-1 of 2):",
            "",
            "2. Valid Track — Artist (2:00) — spotify:track:valid",
          ].join("\n"),
        ),
      );
    });

    test("filters out items where item has no artists array", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        items: [
          {
            added_at: "2024-01-01T00:00:00Z",
            item: {
              artists: "not-an-array",
              duration_ms: 100000,
              name: "Bad Track",
              uri: "spotify:track:bad",
            },
          },
          {
            added_at: "2024-01-02T00:00:00Z",
            item: {
              artists: [
                {
                  name: "Good Artist",
                },
              ],
              duration_ms: 180000,
              name: "Good Track",
              uri: "spotify:track:good",
            },
          },
        ],
        total: 2,
      });

      const handler = server.getHandler("spotify_get_playlist_tracks")!;
      const result = await handler({
        limit: 50,
        offset: 0,
        uri: "spotify:playlist:test",
      });

      // Only good track passes filter (index 1) → numbered as offset(0)+1+1 = 2
      expect(result).toEqual(
        textResult(expect.stringContaining("Good Track") as any),
      );
      expect(result).toEqual(
        textResult(expect.not.stringContaining("Bad Track") as any),
      );
    });

    test("formats duration with padded seconds", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        items: [
          {
            added_at: "2024-01-01T00:00:00Z",
            item: {
              artists: [
                {
                  name: "A",
                },
              ],
              duration_ms: 303000, // 5:03
              name: "Short Seconds",
              uri: "spotify:track:pad",
            },
          },
        ],
        total: 1,
      });

      const handler = server.getHandler("spotify_get_playlist_tracks")!;
      const result = await handler({
        limit: 50,
        offset: 0,
        uri: "spotify:playlist:pad",
      });

      expect(result).toEqual(
        textResult(expect.stringContaining("(5:03)") as any),
      );
    });

    test("handles offset in track numbering", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        items: [
          {
            added_at: "2024-01-01T00:00:00Z",
            item: {
              artists: [
                {
                  name: "X",
                },
              ],
              duration_ms: 60000,
              name: "Offset Track",
              uri: "spotify:track:off",
            },
          },
        ],
        total: 20,
      });

      const handler = server.getHandler("spotify_get_playlist_tracks")!;
      const result = await handler({
        limit: 1,
        offset: 9,
        uri: "spotify:playlist:off",
      });

      // originalIndex=0, offset=9 → numbered 10
      expect(result).toEqual(
        textResult(expect.stringContaining("10. Offset Track") as any),
      );
      expect(result).toEqual(
        textResult(expect.stringContaining("showing 10-10 of 20") as any),
      );
    });
  });
});
