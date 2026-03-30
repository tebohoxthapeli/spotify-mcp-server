import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock spotify-client module before importing the module under test
const mockSpotifyRequest = mock(() => Promise.resolve(null as unknown));
const mockWithErrorHandling = mock((handler: Function) => handler);

mock.module("../spotify-client.js", () => ({
	spotifyRequest: mockSpotifyRequest,
	withErrorHandling: mockWithErrorHandling,
}));

const { registerSearchTools } = await import("./search.js");

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

describe("search tools", () => {
	let server: ReturnType<typeof createMockServer>;

	beforeEach(() => {
		mockSpotifyRequest.mockReset();
		server = createMockServer();
		registerSearchTools(server as any, mockEnv);
	});

	test("registers spotify_search tool", () => {
		expect(server.tool).toHaveBeenCalledTimes(1);
		expect(server.getHandler("spotify_search")).toBeDefined();
	});

	describe("spotify_search", () => {
		test("calls /search with correct query params", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				tracks: { items: [], total: 0 },
			});

			const handler = server.getHandler("spotify_search")!;
			await handler({
				query: "amapiano",
				type: ["track"],
				limit: 20,
				offset: 0,
			});

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/search",
				"GET",
				undefined,
				{
					limit: "20",
					offset: "0",
					q: "amapiano",
					type: "track",
				},
			);
		});

		test("joins multiple types with comma", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				tracks: { items: [], total: 0 },
				artists: { items: [], total: 0 },
			});

			const handler = server.getHandler("spotify_search")!;
			await handler({
				query: "queen",
				type: ["track", "artist"],
				limit: 10,
				offset: 0,
			});

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/search",
				"GET",
				undefined,
				expect.objectContaining({ type: "track,artist" }),
			);
		});

		test("formats track results", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				tracks: {
					items: [
						{
							name: "Bohemian Rhapsody",
							artists: [{ name: "Queen" }],
							album: { name: "A Night at the Opera" },
							duration_ms: 354000,
							uri: "spotify:track:abc123",
						},
					],
					total: 1,
				},
			});

			const handler = server.getHandler("spotify_search")!;
			const result = await handler({
				query: "bohemian",
				type: ["track"],
				limit: 20,
				offset: 0,
			});

			expect(result).toEqual(
				textResult(
					"Tracks (1 total):\n  Bohemian Rhapsody — Queen [A Night at the Opera] (5:54) (spotify:track:abc123)",
				),
			);
		});

		test("formats artist results with genres", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				artists: {
					items: [
						{
							name: "Queen",
							genres: ["rock", "classic rock"],
							uri: "spotify:artist:abc",
						},
					],
					total: 1,
				},
			});

			const handler = server.getHandler("spotify_search")!;
			const result = await handler({
				query: "queen",
				type: ["artist"],
				limit: 20,
				offset: 0,
			});

			expect(result).toEqual(
				textResult(
					"Artists (1 total):\n  Queen [rock, classic rock] (spotify:artist:abc)",
				),
			);
		});

		test("formats artist without genres", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				artists: {
					items: [
						{
							name: "New Artist",
							genres: [],
							uri: "spotify:artist:new",
						},
					],
					total: 1,
				},
			});

			const handler = server.getHandler("spotify_search")!;
			const result = await handler({
				query: "new artist",
				type: ["artist"],
				limit: 20,
				offset: 0,
			});

			expect(result).toEqual(
				textResult("Artists (1 total):\n  New Artist (spotify:artist:new)"),
			);
		});

		test("formats album results", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				albums: {
					items: [
						{
							name: "A Night at the Opera",
							uri: "spotify:album:opera",
						},
					],
					total: 1,
				},
			});

			const handler = server.getHandler("spotify_search")!;
			const result = await handler({
				query: "opera",
				type: ["album"],
				limit: 20,
				offset: 0,
			});

			expect(result).toEqual(
				textResult(
					"Albums (1 total):\n  A Night at the Opera (spotify:album:opera)",
				),
			);
		});

		test("formats playlist results", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				playlists: {
					items: [
						{
							name: "Chill Vibes",
							owner: { display_name: "Spotify" },
							uri: "spotify:playlist:chill",
						},
					],
					total: 1,
				},
			});

			const handler = server.getHandler("spotify_search")!;
			const result = await handler({
				query: "chill",
				type: ["playlist"],
				limit: 20,
				offset: 0,
			});

			expect(result).toEqual(
				textResult(
					"Playlists (1 total):\n  Chill Vibes by Spotify (spotify:playlist:chill)",
				),
			);
		});

		test("handles playlist with null display_name", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				playlists: {
					items: [
						{
							name: "Mystery Playlist",
							owner: { display_name: null },
							uri: "spotify:playlist:mystery",
						},
					],
					total: 1,
				},
			});

			const handler = server.getHandler("spotify_search")!;
			const result = await handler({
				query: "mystery",
				type: ["playlist"],
				limit: 20,
				offset: 0,
			});

			expect(result).toEqual(
				textResult(
					"Playlists (1 total):\n  Mystery Playlist by Unknown (spotify:playlist:mystery)",
				),
			);
		});

		test("returns no results when data is null", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_search")!;
			const result = await handler({
				query: "nonexistent",
				type: ["track"],
				limit: 20,
				offset: 0,
			});

			expect(result).toEqual(textResult("No results found."));
		});

		test("returns no results when all item arrays are empty", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				tracks: { items: [], total: 0 },
			});

			const handler = server.getHandler("spotify_search")!;
			const result = await handler({
				query: "nonexistent",
				type: ["track"],
				limit: 20,
				offset: 0,
			});

			expect(result).toEqual(textResult("No results found."));
		});

		test("combines multiple result types", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				tracks: {
					items: [
						{
							name: "Song",
							artists: [{ name: "Artist" }],
							album: { name: "Album" },
							uri: "spotify:track:t1",
						},
					],
					total: 1,
				},
				artists: {
					items: [
						{
							name: "Artist",
							genres: ["pop"],
							uri: "spotify:artist:a1",
						},
					],
					total: 1,
				},
			});

			const handler = server.getHandler("spotify_search")!;
			const result = await handler({
				query: "test",
				type: ["track", "artist"],
				limit: 20,
				offset: 0,
			});

			const text = result.content[0].text;
			expect(text).toContain("Tracks (1 total):");
			expect(text).toContain("Artists (1 total):");
		});

		test("formats multiple artists on a track", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				tracks: {
					items: [
						{
							name: "Under Pressure",
							artists: [{ name: "Queen" }, { name: "David Bowie" }],
							album: { name: "Hot Space" },
							duration_ms: 248000,
							uri: "spotify:track:up",
						},
					],
					total: 1,
				},
			});

			const handler = server.getHandler("spotify_search")!;
			const result = await handler({
				query: "under pressure",
				type: ["track"],
				limit: 20,
				offset: 0,
			});

			expect(result).toEqual(
				textResult(
					"Tracks (1 total):\n  Under Pressure — Queen, David Bowie [Hot Space] (4:08) (spotify:track:up)",
				),
			);
		});
	});
});
