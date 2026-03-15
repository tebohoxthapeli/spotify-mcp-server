import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock spotify-client module before importing the module under test
const mockSpotifyRequest = mock(() => Promise.resolve(null as unknown));
const mockWithErrorHandling = mock((handler: Function) => handler);

mock.module("../spotify-client.js", () => ({
  spotifyRequest: mockSpotifyRequest,
  withErrorHandling: mockWithErrorHandling,
}));

const { registerWriteTools } = await import("./playback-write.js");

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

describe("playback-write tools", () => {
  let server: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    mockSpotifyRequest.mockReset();
    server = createMockServer();
    registerWriteTools(server as any, mockEnv);
  });

  test("registers all 10 write tools", () => {
    expect(server.tool).toHaveBeenCalledTimes(10);
    expect(server.getHandler("spotify_play")).toBeDefined();
    expect(server.getHandler("spotify_pause")).toBeDefined();
    expect(server.getHandler("spotify_playpause")).toBeDefined();
    expect(server.getHandler("spotify_next_track")).toBeDefined();
    expect(server.getHandler("spotify_previous_track")).toBeDefined();
    expect(server.getHandler("spotify_play_track")).toBeDefined();
    expect(server.getHandler("spotify_set_position")).toBeDefined();
    expect(server.getHandler("spotify_set_volume")).toBeDefined();
    expect(server.getHandler("spotify_set_shuffle")).toBeDefined();
    expect(server.getHandler("spotify_set_repeat")).toBeDefined();
  });

  // -- spotify_play --

  describe("spotify_play", () => {
    test("calls PUT /me/player/play and returns confirmation", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_play")!;
      const result = await handler({});

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/player/play",
        "PUT",
      );
      expect(result).toEqual(textResult("Playback resumed."));
    });
  });

  // -- spotify_pause --

  describe("spotify_pause", () => {
    test("calls PUT /me/player/pause and returns confirmation", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_pause")!;
      const result = await handler({});

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/player/pause",
        "PUT",
      );
      expect(result).toEqual(textResult("Playback paused."));
    });
  });

  // -- spotify_playpause --

  describe("spotify_playpause", () => {
    test("resumes playback when data is null (no active session)", async () => {
      // First call: GET /me/player returns null
      mockSpotifyRequest.mockResolvedValueOnce(null);
      // Second call: PUT /me/player/play
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_playpause")!;
      const result = await handler({});

      expect(mockSpotifyRequest).toHaveBeenCalledTimes(2);
      expect(mockSpotifyRequest).toHaveBeenNthCalledWith(
        1,
        mockEnv,
        "/me/player",
      );
      expect(mockSpotifyRequest).toHaveBeenNthCalledWith(
        2,
        mockEnv,
        "/me/player/play",
        "PUT",
      );
      expect(result).toEqual(textResult("Playback resumed."));
    });

    test("pauses when currently playing", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        is_playing: true,
      });
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_playpause")!;
      const result = await handler({});

      expect(mockSpotifyRequest).toHaveBeenNthCalledWith(
        2,
        mockEnv,
        "/me/player/pause",
        "PUT",
      );
      expect(result).toEqual(textResult("Playback paused."));
    });

    test("resumes when currently paused", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        is_playing: false,
      });
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_playpause")!;
      const result = await handler({});

      expect(mockSpotifyRequest).toHaveBeenNthCalledWith(
        2,
        mockEnv,
        "/me/player/play",
        "PUT",
      );
      expect(result).toEqual(textResult("Playback resumed."));
    });
  });

  // -- spotify_next_track --

  describe("spotify_next_track", () => {
    test("calls POST /me/player/next and returns confirmation", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_next_track")!;
      const result = await handler({});

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/player/next",
        "POST",
      );
      expect(result).toEqual(textResult("Skipped to next track."));
    });
  });

  // -- spotify_previous_track --

  describe("spotify_previous_track", () => {
    test("calls POST /me/player/previous and returns confirmation", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_previous_track")!;
      const result = await handler({});

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/player/previous",
        "POST",
      );
      expect(result).toEqual(textResult("Skipped to previous track."));
    });
  });

  // -- spotify_play_track --

  describe("spotify_play_track", () => {
    test("plays a track by URI without context", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_play_track")!;
      const result = await handler({
        uri: "spotify:track:abc123",
      });

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/player/play",
        "PUT",
        {
          uris: [
            "spotify:track:abc123",
          ],
        },
      );
      expect(result).toEqual(textResult("Now playing: spotify:track:abc123"));
    });

    test("plays a track within a context URI", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_play_track")!;
      const result = await handler({
        context: "spotify:album:xyz789",
        uri: "spotify:track:abc123",
      });

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/player/play",
        "PUT",
        {
          context_uri: "spotify:album:xyz789",
          offset: {
            uri: "spotify:track:abc123",
          },
        },
      );
      expect(result).toEqual(textResult("Now playing: spotify:track:abc123"));
    });

    test("plays without context when context is undefined", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_play_track")!;
      await handler({
        context: undefined,
        uri: "spotify:track:test",
      });

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/player/play",
        "PUT",
        {
          uris: [
            "spotify:track:test",
          ],
        },
      );
    });
  });

  // -- spotify_set_position --

  describe("spotify_set_position", () => {
    test("converts seconds to milliseconds", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_set_position")!;
      const result = await handler({
        position: 30,
      });

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/player/seek",
        "PUT",
        undefined,
        {
          position_ms: "30000",
        },
      );
      expect(result).toEqual(textResult("Position set to 30s."));
    });

    test("handles fractional seconds", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_set_position")!;
      const result = await handler({
        position: 1.5,
      });

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/player/seek",
        "PUT",
        undefined,
        {
          position_ms: "1500",
        },
      );
      expect(result).toEqual(textResult("Position set to 1.5s."));
    });

    test("handles zero position", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_set_position")!;
      const result = await handler({
        position: 0,
      });

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/player/seek",
        "PUT",
        undefined,
        {
          position_ms: "0",
        },
      );
      expect(result).toEqual(textResult("Position set to 0s."));
    });
  });

  // -- spotify_set_volume --

  describe("spotify_set_volume", () => {
    test("passes volume_percent as query param", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_set_volume")!;
      const result = await handler({
        volume: 50,
      });

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/player/volume",
        "PUT",
        undefined,
        {
          volume_percent: "50",
        },
      );
      expect(result).toEqual(textResult("Volume set to 50."));
    });

    test("handles zero volume", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_set_volume")!;
      const result = await handler({
        volume: 0,
      });

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/player/volume",
        "PUT",
        undefined,
        {
          volume_percent: "0",
        },
      );
      expect(result).toEqual(textResult("Volume set to 0."));
    });

    test("handles max volume", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_set_volume")!;
      const result = await handler({
        volume: 100,
      });

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/player/volume",
        "PUT",
        undefined,
        {
          volume_percent: "100",
        },
      );
      expect(result).toEqual(textResult("Volume set to 100."));
    });
  });

  // -- spotify_set_shuffle --

  describe("spotify_set_shuffle", () => {
    test("enables shuffle", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_set_shuffle")!;
      const result = await handler({
        enabled: true,
      });

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/player/shuffle",
        "PUT",
        undefined,
        {
          state: "true",
        },
      );
      expect(result).toEqual(textResult("Shuffle enabled."));
    });

    test("disables shuffle", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_set_shuffle")!;
      const result = await handler({
        enabled: false,
      });

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/player/shuffle",
        "PUT",
        undefined,
        {
          state: "false",
        },
      );
      expect(result).toEqual(textResult("Shuffle disabled."));
    });
  });

  // -- spotify_set_repeat --

  describe("spotify_set_repeat", () => {
    test("sets repeat to 'track' when enabled", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_set_repeat")!;
      const result = await handler({
        enabled: true,
      });

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/player/repeat",
        "PUT",
        undefined,
        {
          state: "track",
        },
      );
      expect(result).toEqual(textResult("Repeat set to track."));
    });

    test("sets repeat to 'off' when disabled", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_set_repeat")!;
      const result = await handler({
        enabled: false,
      });

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/player/repeat",
        "PUT",
        undefined,
        {
          state: "off",
        },
      );
      expect(result).toEqual(textResult("Repeat set to off."));
    });
  });
});
