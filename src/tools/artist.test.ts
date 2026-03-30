import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock spotify-client module before importing the module under test
const mockWithErrorHandling = mock((handler: Function) => handler);

mock.module("../spotify-client.js", () => ({
	withErrorHandling: mockWithErrorHandling,
}));

// Mock utils module — provide real implementations for pure functions,
// mock the async ones that hit the Spotify API
const mockGetArtistName = mock(() => Promise.resolve("Test Artist" as string | null));
const mockSearchTracksByArtist = mock(() => Promise.resolve(null as unknown));

mock.module("../utils.js", () => ({
	extractIdFromUri: (uri: string) => {
		const id = uri.split(":")[2];
		if (!id) throw new Error(`Cannot extract ID from URI: ${uri}`);
		return id;
	},
	formatDuration: (ms: number) => {
		const totalSeconds = Math.round(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${String(seconds).padStart(2, "0")}`;
	},
	getArtistName: mockGetArtistName,
	READ_ANNOTATIONS: { destructiveHint: false, readOnlyHint: true },
	searchTracksByArtist: mockSearchTracksByArtist,
	textResult: (text: string) => ({ content: [{ text, type: "text" }] }),
}));

const { registerArtistTools } = await import("./artist.js");

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
	MCP_TRANSPORT: "stdio" as const,
	MCP_HTTP_PORT: 3001,
	MCP_HTTP_SECRET: undefined,
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

describe("artist tools", () => {
	let server: ReturnType<typeof createMockServer>;

	beforeEach(() => {
		mockGetArtistName.mockReset();
		mockSearchTracksByArtist.mockReset();
		server = createMockServer();
		registerArtistTools(server as any, mockEnv);
	});

	test("registers spotify_get_artist_top_tracks tool", () => {
		expect(server.tool).toHaveBeenCalledTimes(1);
		expect(server.getHandler("spotify_get_artist_top_tracks")).toBeDefined();
	});

	describe("spotify_get_artist_top_tracks", () => {
		test("returns 'Artist not found.' when getArtistName returns null", async () => {
			mockGetArtistName.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_get_artist_top_tracks")!;
			const result = await handler({ uri: "spotify:artist:abc123" });

			expect(result).toEqual(textResult("Artist not found."));
		});

		test("returns 'No top tracks found' when search returns no tracks", async () => {
			mockGetArtistName.mockResolvedValueOnce("Test Artist");
			mockSearchTracksByArtist.mockResolvedValueOnce({ tracks: { items: [] } });

			const handler = server.getHandler("spotify_get_artist_top_tracks")!;
			const result = await handler({ uri: "spotify:artist:abc123" });

			expect(result).toEqual(textResult("No top tracks found for this artist."));
		});

		test("returns 'No top tracks found' when search returns null", async () => {
			mockGetArtistName.mockResolvedValueOnce("Test Artist");
			mockSearchTracksByArtist.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_get_artist_top_tracks")!;
			const result = await handler({ uri: "spotify:artist:abc123" });

			expect(result).toEqual(textResult("No top tracks found for this artist."));
		});

		test("returns formatted track list when tracks are found", async () => {
			mockGetArtistName.mockResolvedValueOnce("Test Artist");
			mockSearchTracksByArtist.mockResolvedValueOnce({
				tracks: {
					items: [
						{
							name: "Song One",
							artists: [{ name: "Test Artist", id: "a1", uri: "spotify:artist:a1" }],
							album: { name: "Album A", id: "al1", uri: "spotify:album:al1" },
							duration_ms: 210000,
							uri: "spotify:track:t1",
							id: "t1",
							external_urls: { spotify: "https://open.spotify.com/track/t1" },
						},
						{
							name: "Song Two",
							artists: [
								{ name: "Test Artist", id: "a1", uri: "spotify:artist:a1" },
								{ name: "Other Artist", id: "a2", uri: "spotify:artist:a2" },
							],
							album: { name: "Album B", id: "al2", uri: "spotify:album:al2" },
							duration_ms: 185000,
							uri: "spotify:track:t2",
							id: "t2",
							external_urls: { spotify: "https://open.spotify.com/track/t2" },
						},
					],
				},
			});

			const handler = server.getHandler("spotify_get_artist_top_tracks")!;
			const result = await handler({ uri: "spotify:artist:abc123" });

			const expected = textResult(
				"Top tracks for Test Artist:\n" +
					"  1. Song One — Test Artist [Album A] (3:30) (spotify:track:t1)\n" +
					"  2. Song Two — Test Artist, Other Artist [Album B] (3:05) (spotify:track:t2)",
			);
			expect(result).toEqual(expected);
		});

		test("passes correct artist ID extracted from URI", async () => {
			mockGetArtistName.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_get_artist_top_tracks")!;
			await handler({ uri: "spotify:artist:4Z8W4fKeB5YxbusRsdQVPb" });

			expect(mockGetArtistName).toHaveBeenCalledWith(mockEnv, "4Z8W4fKeB5YxbusRsdQVPb");
		});

		test("passes artist name and limit 10 to searchTracksByArtist", async () => {
			mockGetArtistName.mockResolvedValueOnce("Radiohead");
			mockSearchTracksByArtist.mockResolvedValueOnce({ tracks: { items: [] } });

			const handler = server.getHandler("spotify_get_artist_top_tracks")!;
			await handler({ uri: "spotify:artist:abc123" });

			expect(mockSearchTracksByArtist).toHaveBeenCalledWith(mockEnv, "Radiohead", 10);
		});
	});
});
