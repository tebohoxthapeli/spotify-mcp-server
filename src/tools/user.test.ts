import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock spotify-client module before importing the module under test
const mockSpotifyRequest = mock(() => Promise.resolve(null as unknown));
const mockWithErrorHandling = mock((handler: Function) => handler);

mock.module("../spotify-client.js", () => ({
	spotifyRequest: mockSpotifyRequest,
	withErrorHandling: mockWithErrorHandling,
}));

const { registerUserTools } = await import("./user.js");

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

describe("user tools", () => {
	let server: ReturnType<typeof createMockServer>;

	beforeEach(() => {
		mockSpotifyRequest.mockReset();
		server = createMockServer();
		registerUserTools(server as any, mockEnv);
	});

	test("registers all 3 user tools", () => {
		expect(server.tool).toHaveBeenCalledTimes(3);
		expect(server.getHandler("spotify_get_profile")).toBeDefined();
		expect(server.getHandler("spotify_get_top_items")).toBeDefined();
		expect(server.getHandler("spotify_get_followed_artists")).toBeDefined();
	});

	describe("spotify_get_profile", () => {
		test("returns formatted profile with all fields", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				display_name: "Test User",
				id: "user123",
				uri: "spotify:user:user123",
				external_urls: { spotify: "https://open.spotify.com/user/user123" },
				email: "test@example.com",
				country: "ZA",
				product: "premium",
				followers: { total: 42 },
				images: [{ url: "https://example.com/avatar.jpg", height: 300, width: 300 }],
			});

			const handler = server.getHandler("spotify_get_profile")!;
			const result = await handler({});

			const expected = textResult(
				[
					"Display name: Test User",
					"User ID: user123",
					"URI: spotify:user:user123",
					"Profile: https://open.spotify.com/user/user123",
					"Email: test@example.com",
					"Country: ZA",
					"Subscription: premium",
					"Followers: 42",
					"Avatar: https://example.com/avatar.jpg",
				].join("\n"),
			);
			expect(result).toEqual(expected);
		});

		test("returns profile with only required fields", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				display_name: null,
				id: "user456",
				uri: "spotify:user:user456",
				external_urls: { spotify: "https://open.spotify.com/user/user456" },
				images: [],
			});

			const handler = server.getHandler("spotify_get_profile")!;
			const result = await handler({});

			const expected = textResult(
				[
					"Display name: N/A",
					"User ID: user456",
					"URI: spotify:user:user456",
					"Profile: https://open.spotify.com/user/user456",
				].join("\n"),
			);
			expect(result).toEqual(expected);
		});

		test("returns error message when profile is null", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_get_profile")!;
			const result = await handler({});

			expect(result).toEqual(textResult("Could not retrieve profile."));
		});

		test("calls GET /me", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_get_profile")!;
			await handler({});

			expect(mockSpotifyRequest).toHaveBeenCalledWith(mockEnv, "/me");
		});
	});

	describe("spotify_get_top_items", () => {
		const defaultArgs = {
			type: "tracks" as const,
			time_range: "medium_term" as const,
			limit: 20,
			offset: 0,
		};

		test("returns formatted track list for type=tracks", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				items: [
					{
						name: "Track One",
						artists: [{ name: "Artist A", id: "a1", uri: "spotify:artist:a1" }],
						duration_ms: 240000,
						uri: "spotify:track:t1",
						id: "t1",
						album: { name: "Album", id: "al1", uri: "spotify:album:al1" },
						external_urls: { spotify: "https://open.spotify.com/track/t1" },
					},
				],
				total: 1,
				next: null,
				limit: 20,
				offset: 0,
			});

			const handler = server.getHandler("spotify_get_top_items")!;
			const result = await handler(defaultArgs);

			const expected = textResult(
				"Top tracks (~6 months, 1 total):\n  1. Track One — Artist A [4:00] (spotify:track:t1)",
			);
			expect(result).toEqual(expected);
		});

		test("returns formatted artist list for type=artists", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				items: [
					{
						name: "Artist X",
						id: "ax",
						uri: "spotify:artist:ax",
						genres: ["rock", "indie", "alternative", "shoegaze"],
					},
				],
				total: 1,
				next: null,
				limit: 20,
				offset: 0,
			});

			const handler = server.getHandler("spotify_get_top_items")!;
			const result = await handler({ ...defaultArgs, type: "artists" });

			const expected = textResult(
				"Top artists (~6 months, 1 total):\n  1. Artist X [rock, indie, alternative] (spotify:artist:ax)",
			);
			expect(result).toEqual(expected);
		});

		test("returns artist without genres when genres are empty", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				items: [
					{
						name: "Unknown Genre Artist",
						id: "ug",
						uri: "spotify:artist:ug",
						genres: [],
					},
				],
				total: 1,
				next: null,
				limit: 20,
				offset: 0,
			});

			const handler = server.getHandler("spotify_get_top_items")!;
			const result = await handler({ ...defaultArgs, type: "artists" });

			const expected = textResult(
				"Top artists (~6 months, 1 total):\n  1. Unknown Genre Artist (spotify:artist:ug)",
			);
			expect(result).toEqual(expected);
		});

		test("returns 'No top tracks found' when empty for tracks", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({ items: [], total: 0, next: null, limit: 20, offset: 0 });

			const handler = server.getHandler("spotify_get_top_items")!;
			const result = await handler(defaultArgs);

			expect(result).toEqual(textResult("No top tracks found for medium_term."));
		});

		test("returns 'No top artists found' when empty for artists", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({ items: [], total: 0, next: null, limit: 20, offset: 0 });

			const handler = server.getHandler("spotify_get_top_items")!;
			const result = await handler({ ...defaultArgs, type: "artists" });

			expect(result).toEqual(textResult("No top artists found for medium_term."));
		});

		test("returns 'No top tracks found' when data is null", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_get_top_items")!;
			const result = await handler(defaultArgs);

			expect(result).toEqual(textResult("No top tracks found for medium_term."));
		});

		test("includes pagination hint when more results available", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				items: [
					{
						name: "Track One",
						artists: [{ name: "Artist A", id: "a1", uri: "spotify:artist:a1" }],
						duration_ms: 180000,
						uri: "spotify:track:t1",
						id: "t1",
						album: { name: "Album", id: "al1", uri: "spotify:album:al1" },
						external_urls: { spotify: "https://open.spotify.com/track/t1" },
					},
				],
				total: 50,
				next: "https://api.spotify.com/v1/me/top/tracks?offset=20",
				limit: 20,
				offset: 0,
			});

			const handler = server.getHandler("spotify_get_top_items")!;
			const result = await handler(defaultArgs);

			expect(result.content[0].text).toContain("More available — use offset=20");
		});

		test("uses correct time range label for short_term", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				items: [
					{
						name: "Recent Track",
						artists: [{ name: "Artist", id: "a1", uri: "spotify:artist:a1" }],
						duration_ms: 200000,
						uri: "spotify:track:r1",
						id: "r1",
						album: { name: "Album", id: "al1", uri: "spotify:album:al1" },
						external_urls: { spotify: "https://open.spotify.com/track/r1" },
					},
				],
				total: 1,
				next: null,
				limit: 20,
				offset: 0,
			});

			const handler = server.getHandler("spotify_get_top_items")!;
			const result = await handler({ ...defaultArgs, time_range: "short_term" });

			expect(result.content[0].text).toContain("~4 weeks");
		});

		test("uses correct time range label for long_term", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				items: [
					{
						name: "Old Track",
						artists: [{ name: "Artist", id: "a1", uri: "spotify:artist:a1" }],
						duration_ms: 200000,
						uri: "spotify:track:o1",
						id: "o1",
						album: { name: "Album", id: "al1", uri: "spotify:album:al1" },
						external_urls: { spotify: "https://open.spotify.com/track/o1" },
					},
				],
				total: 1,
				next: null,
				limit: 20,
				offset: 0,
			});

			const handler = server.getHandler("spotify_get_top_items")!;
			const result = await handler({ ...defaultArgs, time_range: "long_term" });

			expect(result.content[0].text).toContain("~1 year");
		});

		test("passes correct query params to spotifyRequest for tracks", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_get_top_items")!;
			await handler({ type: "tracks", time_range: "short_term", limit: 10, offset: 5 });

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/me/top/tracks",
				"GET",
				undefined,
				{ limit: "10", offset: "5", time_range: "short_term" },
			);
		});

		test("passes correct query params to spotifyRequest for artists", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_get_top_items")!;
			await handler({ type: "artists", time_range: "long_term", limit: 50, offset: 0 });

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/me/top/artists",
				"GET",
				undefined,
				{ limit: "50", offset: "0", time_range: "long_term" },
			);
		});

		test("offsets numbering based on offset parameter", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				items: [
					{
						name: "Track Six",
						artists: [{ name: "Artist", id: "a1", uri: "spotify:artist:a1" }],
						duration_ms: 200000,
						uri: "spotify:track:t6",
						id: "t6",
						album: { name: "Album", id: "al1", uri: "spotify:album:al1" },
						external_urls: { spotify: "https://open.spotify.com/track/t6" },
					},
				],
				total: 10,
				next: null,
				limit: 5,
				offset: 5,
			});

			const handler = server.getHandler("spotify_get_top_items")!;
			const result = await handler({ ...defaultArgs, limit: 5, offset: 5 });

			expect(result.content[0].text).toContain("6. Track Six");
		});
	});

	describe("spotify_get_followed_artists", () => {
		const defaultArgs = { limit: 20, after: undefined };

		test("returns formatted list of followed artists", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				artists: {
					items: [
						{ name: "Artist One", id: "a1", uri: "spotify:artist:a1", genres: ["rock", "pop"] },
						{ name: "Artist Two", id: "a2", uri: "spotify:artist:a2", genres: [] },
					],
					total: 2,
					limit: 20,
					next: null,
					cursors: null,
				},
			});

			const handler = server.getHandler("spotify_get_followed_artists")!;
			const result = await handler(defaultArgs);

			const expected = textResult(
				"Followed artists (2 total):\n" +
					"  1. Artist One [rock, pop] (spotify:artist:a1)\n" +
					"  2. Artist Two (spotify:artist:a2)",
			);
			expect(result).toEqual(expected);
		});

		test("returns 'No followed artists found.' when empty", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				artists: { items: [], total: 0, limit: 20, next: null, cursors: null },
			});

			const handler = server.getHandler("spotify_get_followed_artists")!;
			const result = await handler(defaultArgs);

			expect(result).toEqual(textResult("No followed artists found."));
		});

		test("returns 'No followed artists found.' when data is null", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_get_followed_artists")!;
			const result = await handler(defaultArgs);

			expect(result).toEqual(textResult("No followed artists found."));
		});

		test("includes cursor pagination hint when next page available", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				artists: {
					items: [
						{ name: "Artist One", id: "a1", uri: "spotify:artist:a1", genres: [] },
					],
					total: 50,
					limit: 20,
					next: "https://api.spotify.com/v1/me/following?after=a1",
					cursors: { after: "a1" },
				},
			});

			const handler = server.getHandler("spotify_get_followed_artists")!;
			const result = await handler(defaultArgs);

			expect(result.content[0].text).toContain('Next page — use after="a1"');
		});

		test("does not include cursor hint when cursors.after is null", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				artists: {
					items: [
						{ name: "Artist One", id: "a1", uri: "spotify:artist:a1", genres: [] },
					],
					total: 1,
					limit: 20,
					next: null,
					cursors: { after: null },
				},
			});

			const handler = server.getHandler("spotify_get_followed_artists")!;
			const result = await handler(defaultArgs);

			expect(result.content[0].text).not.toContain("Next page");
		});

		test("passes after cursor param to spotifyRequest", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_get_followed_artists")!;
			await handler({ limit: 10, after: "cursor123" });

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/me/following",
				"GET",
				undefined,
				{ limit: "10", type: "artist", after: "cursor123" },
			);
		});

		test("omits after param when not provided", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_get_followed_artists")!;
			await handler({ limit: 20 });

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/me/following",
				"GET",
				undefined,
				{ limit: "20", type: "artist" },
			);
		});

		test("truncates genres to first 3", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				artists: {
					items: [
						{
							name: "Genre Heavy",
							id: "gh",
							uri: "spotify:artist:gh",
							genres: ["rock", "indie", "alternative", "shoegaze", "dream pop"],
						},
					],
					total: 1,
					limit: 20,
					next: null,
					cursors: null,
				},
			});

			const handler = server.getHandler("spotify_get_followed_artists")!;
			const result = await handler(defaultArgs);

			expect(result.content[0].text).toContain("[rock, indie, alternative]");
			expect(result.content[0].text).not.toContain("shoegaze");
		});
	});
});
