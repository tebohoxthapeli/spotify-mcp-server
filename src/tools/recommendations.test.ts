import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock spotify-client module before importing the module under test
const mockSpotifyRequest = mock(() => Promise.resolve(null as unknown));
const mockWithErrorHandling = mock((handler: Function) => handler);

mock.module("../spotify-client.js", () => ({
	spotifyRequest: mockSpotifyRequest,
	withErrorHandling: mockWithErrorHandling,
}));

const { registerRecommendationTools, shuffleArray } = await import(
	"./recommendations.js"
);

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

describe("shuffleArray", () => {
	test("returns all elements", () => {
		const input = [1, 2, 3, 4, 5];
		const result = shuffleArray(input);
		expect(result).toHaveLength(input.length);
		expect(result.sort()).toEqual([1, 2, 3, 4, 5]);
	});

	test("does not mutate the input array", () => {
		const input = [1, 2, 3, 4, 5];
		const copy = [...input];
		shuffleArray(input);
		expect(input).toEqual(copy);
	});

	test("returns empty array for empty input", () => {
		expect(shuffleArray([])).toEqual([]);
	});

	test("returns single-element array unchanged", () => {
		expect(shuffleArray([42])).toEqual([42]);
	});
});

describe("recommendation tools", () => {
	let server: ReturnType<typeof createMockServer>;

	beforeEach(() => {
		mockSpotifyRequest.mockReset();
		server = createMockServer();
		registerRecommendationTools(server as any, mockEnv);
	});

	test("registers spotify_get_recommendations tool", () => {
		expect(server.tool).toHaveBeenCalledTimes(1);
		expect(server.getHandler("spotify_get_recommendations")).toBeDefined();
	});

	describe("spotify_get_recommendations", () => {
		test("returns error when no seeds provided", async () => {
			const handler = server.getHandler("spotify_get_recommendations")!;
			const result = await handler({
				limit: 10,
				seed_artists: [],
				seed_tracks: [],
			});

			expect(result).toEqual(
				textResult(
					"At least one seed (seed_artists or seed_tracks) is required.",
				),
			);
			expect(mockSpotifyRequest).not.toHaveBeenCalled();
		});

		test("returns message when no artist names resolved", async () => {
			// Batch /artists returns no names
			mockSpotifyRequest.mockResolvedValueOnce({ artists: [] });

			const handler = server.getHandler("spotify_get_recommendations")!;
			const result = await handler({
				limit: 10,
				seed_artists: ["artist1"],
				seed_tracks: [],
			});

			expect(result).toEqual(
				textResult("Could not resolve any artists from the provided seeds."),
			);
		});

		test("fetches artists via batch endpoint and searches tracks", async () => {
			// First call: batch /artists lookup
			mockSpotifyRequest.mockResolvedValueOnce({
				artists: [{ id: "artist1", name: "Artist One" }],
			});
			// Second call: search tracks by artist name (via searchTracksByArtist)
			mockSpotifyRequest.mockResolvedValueOnce({
				tracks: {
					items: [
						{
							album: { id: "album1", name: "Album One", uri: "spotify:album:1" },
							artists: [{ id: "artist1", name: "Artist One", uri: "spotify:artist:1" }],
							duration_ms: 200000,
							external_urls: { spotify: "https://open.spotify.com/track/track1" },
							id: "track1",
							name: "Track One",
							uri: "spotify:track:track1",
						},
					],
				},
			});

			const handler = server.getHandler("spotify_get_recommendations")!;
			const result = await handler({
				limit: 10,
				seed_artists: ["artist1"],
				seed_tracks: [],
			});

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/artists",
				"GET",
				undefined,
				{ ids: "artist1" },
			);
			expect(result.content[0].text).toContain("Track One");
			expect(result.content[0].text).toContain("Artist One");
		});

		test("batch-fetches seed tracks and searches by resolved artist names", async () => {
			// First call: batch /tracks lookup
			mockSpotifyRequest.mockResolvedValueOnce({
				tracks: [
					{
						album: { id: "a1", name: "A1", uri: "spotify:album:a1" },
						artists: [{ id: "artist1", name: "Artist One", uri: "spotify:artist:1" }],
						duration_ms: 180000,
						external_urls: { spotify: "https://open.spotify.com/track/seed1" },
						id: "seed1",
						name: "Seed Track",
						uri: "spotify:track:seed1",
					},
					{
						album: { id: "a2", name: "A2", uri: "spotify:album:a2" },
						artists: [{ id: "artist2", name: "Artist Two", uri: "spotify:artist:2" }],
						duration_ms: 200000,
						external_urls: { spotify: "https://open.spotify.com/track/seed2" },
						id: "seed2",
						name: "Seed Track 2",
						uri: "spotify:track:seed2",
					},
				],
			});
			// Second + Third calls: searchTracksByArtist for each resolved artist
			mockSpotifyRequest.mockResolvedValueOnce({
				tracks: {
					items: [
						{
							album: { id: "a3", name: "A3", uri: "spotify:album:a3" },
							artists: [{ id: "artist1", name: "Artist One", uri: "spotify:artist:1" }],
							duration_ms: 210000,
							external_urls: { spotify: "https://open.spotify.com/track/rec1" },
							id: "rec1",
							name: "Recommended 1",
							uri: "spotify:track:rec1",
						},
					],
				},
			});
			mockSpotifyRequest.mockResolvedValueOnce({
				tracks: {
					items: [
						{
							album: { id: "a4", name: "A4", uri: "spotify:album:a4" },
							artists: [{ id: "artist2", name: "Artist Two", uri: "spotify:artist:2" }],
							duration_ms: 190000,
							external_urls: { spotify: "https://open.spotify.com/track/rec2" },
							id: "rec2",
							name: "Recommended 2",
							uri: "spotify:track:rec2",
						},
					],
				},
			});

			const handler = server.getHandler("spotify_get_recommendations")!;
			const result = await handler({
				limit: 10,
				seed_artists: [],
				seed_tracks: ["seed1", "seed2"],
			});

			// Verify batch lookup (single call with comma-separated IDs)
			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/tracks",
				"GET",
				undefined,
				{ ids: "seed1,seed2" },
			);

			// Verify seed tracks excluded from results
			expect(result.content[0].text).not.toContain("Seed Track");
			expect(result.content[0].text).toContain("Recommended 1");
			expect(result.content[0].text).toContain("Recommended 2");
		});

		test("returns error when artist resolution fails", async () => {
			// batch /tracks returns null tracks
			mockSpotifyRequest.mockResolvedValueOnce({
				tracks: [null, null],
			});

			const handler = server.getHandler("spotify_get_recommendations")!;
			const result = await handler({
				limit: 10,
				seed_artists: [],
				seed_tracks: ["bad1", "bad2"],
			});

			expect(result).toEqual(
				textResult(
					"Could not resolve any artists from the provided seeds.",
				),
			);
		});

		test("propagates spotifyRequest errors via withErrorHandling", async () => {
			mockSpotifyRequest.mockRejectedValueOnce(
				new Error("Spotify auth expired. Re-run the auth script."),
			);

			const handler = server.getHandler("spotify_get_recommendations")!;

			await expect(
				handler({
					limit: 10,
					seed_artists: ["artist1"],
					seed_tracks: [],
				}),
			).rejects.toThrow("Spotify auth expired");
		});
	});
});
