import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock spotify-client module before importing the module under test
const mockSpotifyRequest = mock(() => Promise.resolve(null as unknown));
const mockWithErrorHandling = mock((handler: Function) => handler);

mock.module("../spotify-client.js", () => ({
  spotifyRequest: mockSpotifyRequest,
  withErrorHandling: mockWithErrorHandling,
}));

const { registerReadTools } = await import("./playback-read.js");

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

describe("playback-read tools", () => {
  let server: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    mockSpotifyRequest.mockReset();
    server = createMockServer();
    registerReadTools(server as any, mockEnv);
  });

  test("registers all 6 read tools", () => {
    expect(server.tool).toHaveBeenCalledTimes(6);
    expect(server.getHandler("spotify_get_current_track")).toBeDefined();
    expect(server.getHandler("spotify_get_player_state")).toBeDefined();
    expect(server.getHandler("spotify_get_position")).toBeDefined();
    expect(server.getHandler("spotify_get_volume")).toBeDefined();
    expect(server.getHandler("spotify_get_shuffle")).toBeDefined();
    expect(server.getHandler("spotify_get_repeat")).toBeDefined();
  });

  // -- spotify_get_current_track --

  describe("spotify_get_current_track", () => {
    test("returns track info when a track is playing", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        item: {
          album: {
            name: "A Night at the Opera",
          },
          artists: [
            {
              name: "Queen",
            },
          ],
          duration_ms: 354000,
          external_urls: {
            spotify: "https://open.spotify.com/track/abc123",
          },
          name: "Bohemian Rhapsody",
          uri: "spotify:track:abc123",
        },
      });

      const handler = server.getHandler("spotify_get_current_track")!;
      const result = await handler({});

      expect(result).toEqual(
        textResult(
          [
            "Name: Bohemian Rhapsody",
            "Artist: Queen",
            "Album: A Night at the Opera",
            "Duration: 354s",
            "URI: spotify:track:abc123",
            "URL: https://open.spotify.com/track/abc123",
          ].join("\n"),
        ),
      );
    });

    test("returns multiple artists joined by comma", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        item: {
          album: {
            name: "Hot Space",
          },
          artists: [
            {
              name: "Queen",
            },
            {
              name: "David Bowie",
            },
          ],
          duration_ms: 248000,
          external_urls: {
            spotify: "https://open.spotify.com/track/def456",
          },
          name: "Under Pressure",
          uri: "spotify:track:def456",
        },
      });

      const handler = server.getHandler("spotify_get_current_track")!;
      const result = await handler({});

      expect(result).toEqual(
        textResult(
          expect.stringContaining("Artist: Queen, David Bowie") as any,
        ),
      );
    });

    test("returns nothing playing when data is null", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_get_current_track")!;
      const result = await handler({});

      expect(result).toEqual(textResult("Nothing is currently playing."));
    });

    test("returns nothing playing when item is null", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        item: null,
      });

      const handler = server.getHandler("spotify_get_current_track")!;
      const result = await handler({});

      expect(result).toEqual(textResult("Nothing is currently playing."));
    });

    test("rounds duration to nearest second", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        item: {
          album: {
            name: "Album",
          },
          artists: [
            {
              name: "Artist",
            },
          ],
          duration_ms: 61499,
          external_urls: {
            spotify: "https://open.spotify.com/track/x",
          },
          name: "Short Song",
          uri: "spotify:track:x",
        },
      });

      const handler = server.getHandler("spotify_get_current_track")!;
      const result = await handler({});

      expect(result).toEqual(
        textResult(expect.stringContaining("Duration: 61s") as any),
      );
    });

    test("calls spotifyRequest with correct endpoint", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_get_current_track")!;
      await handler({});

      expect(mockSpotifyRequest).toHaveBeenCalledWith(
        mockEnv,
        "/me/player/currently-playing",
      );
    });
  });

  // -- spotify_get_player_state --

  describe("spotify_get_player_state", () => {
    test("returns 'playing' when is_playing is true", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        is_playing: true,
      });

      const handler = server.getHandler("spotify_get_player_state")!;
      const result = await handler({});

      expect(result).toEqual(textResult("playing"));
    });

    test("returns 'paused' when is_playing is false", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        is_playing: false,
      });

      const handler = server.getHandler("spotify_get_player_state")!;
      const result = await handler({});

      expect(result).toEqual(textResult("paused"));
    });

    test("returns 'stopped' when data is null", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_get_player_state")!;
      const result = await handler({});

      expect(result).toEqual(textResult("stopped"));
    });

    test("calls spotifyRequest with correct endpoint", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_get_player_state")!;
      await handler({});

      expect(mockSpotifyRequest).toHaveBeenCalledWith(mockEnv, "/me/player");
    });
  });

  // -- spotify_get_position --

  describe("spotify_get_position", () => {
    test("returns position in seconds", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        progress_ms: 45000,
      });

      const handler = server.getHandler("spotify_get_position")!;
      const result = await handler({});

      expect(result).toEqual(textResult("45"));
    });

    test("rounds fractional seconds", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        progress_ms: 45678,
      });

      const handler = server.getHandler("spotify_get_position")!;
      const result = await handler({});

      expect(result).toEqual(textResult("46"));
    });

    test("returns '0' when progress_ms is null", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        progress_ms: null,
      });

      const handler = server.getHandler("spotify_get_position")!;
      const result = await handler({});

      expect(result).toEqual(textResult("0"));
    });

    test("returns '0' when data is null", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_get_position")!;
      const result = await handler({});

      expect(result).toEqual(textResult("0"));
    });

    test("returns '0' for zero progress", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        progress_ms: 0,
      });

      const handler = server.getHandler("spotify_get_position")!;
      const result = await handler({});

      expect(result).toEqual(textResult("0"));
    });
  });

  // -- spotify_get_volume --

  describe("spotify_get_volume", () => {
    test("returns volume as string", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        device: {
          volume_percent: 75,
        },
      });

      const handler = server.getHandler("spotify_get_volume")!;
      const result = await handler({});

      expect(result).toEqual(textResult("75"));
    });

    test("returns '0' for zero volume", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        device: {
          volume_percent: 0,
        },
      });

      const handler = server.getHandler("spotify_get_volume")!;
      const result = await handler({});

      expect(result).toEqual(textResult("0"));
    });

    test("returns '100' for max volume", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        device: {
          volume_percent: 100,
        },
      });

      const handler = server.getHandler("spotify_get_volume")!;
      const result = await handler({});

      expect(result).toEqual(textResult("100"));
    });

    test("returns unavailable when volume_percent is null", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        device: {
          volume_percent: null,
        },
      });

      const handler = server.getHandler("spotify_get_volume")!;
      const result = await handler({});

      expect(result).toEqual(textResult("Volume unavailable"));
    });

    test("returns unavailable when data is null", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_get_volume")!;
      const result = await handler({});

      expect(result).toEqual(textResult("Volume unavailable"));
    });
  });

  // -- spotify_get_shuffle --

  describe("spotify_get_shuffle", () => {
    test("returns 'true' when shuffle is on", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        shuffle_state: true,
      });

      const handler = server.getHandler("spotify_get_shuffle")!;
      const result = await handler({});

      expect(result).toEqual(textResult("true"));
    });

    test("returns 'false' when shuffle is off", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        shuffle_state: false,
      });

      const handler = server.getHandler("spotify_get_shuffle")!;
      const result = await handler({});

      expect(result).toEqual(textResult("false"));
    });

    test("returns 'false' when data is null", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_get_shuffle")!;
      const result = await handler({});

      expect(result).toEqual(textResult("false"));
    });
  });

  // -- spotify_get_repeat --

  describe("spotify_get_repeat", () => {
    test("returns 'off' when repeat is off", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        repeat_state: "off",
      });

      const handler = server.getHandler("spotify_get_repeat")!;
      const result = await handler({});

      expect(result).toEqual(textResult("off"));
    });

    test("returns 'track' when repeat is track", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        repeat_state: "track",
      });

      const handler = server.getHandler("spotify_get_repeat")!;
      const result = await handler({});

      expect(result).toEqual(textResult("track"));
    });

    test("returns 'context' when repeat is context", async () => {
      mockSpotifyRequest.mockResolvedValueOnce({
        repeat_state: "context",
      });

      const handler = server.getHandler("spotify_get_repeat")!;
      const result = await handler({});

      expect(result).toEqual(textResult("context"));
    });

    test("returns 'off' when data is null", async () => {
      mockSpotifyRequest.mockResolvedValueOnce(null);

      const handler = server.getHandler("spotify_get_repeat")!;
      const result = await handler({});

      expect(result).toEqual(textResult("off"));
    });
  });
});
