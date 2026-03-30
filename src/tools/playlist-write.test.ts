import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock spotify-client module before importing the module under test
const mockSpotifyRequest = mock(() => Promise.resolve(null as unknown));
const mockWithErrorHandling = mock((handler: Function) => handler);

mock.module("../spotify-client.js", () => ({
	spotifyRequest: mockSpotifyRequest,
	withErrorHandling: mockWithErrorHandling,
}));

const { registerPlaylistWriteTools } = await import("./playlist-write.js");

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

describe("playlist-write tools", () => {
	let server: ReturnType<typeof createMockServer>;

	beforeEach(() => {
		mockSpotifyRequest.mockReset();
		server = createMockServer();
		registerPlaylistWriteTools(server as any, mockEnv);
	});

	test("registers all 6 playlist write tools", () => {
		expect(server.tool).toHaveBeenCalledTimes(6);
		expect(server.getHandler("spotify_create_playlist")).toBeDefined();
		expect(server.getHandler("spotify_delete_playlist")).toBeDefined();
		expect(server.getHandler("spotify_add_tracks")).toBeDefined();
		expect(server.getHandler("spotify_remove_tracks")).toBeDefined();
		expect(server.getHandler("spotify_update_playlist")).toBeDefined();
		expect(server.getHandler("spotify_reorder_tracks")).toBeDefined();
	});

	// -- spotify_create_playlist --

	describe("spotify_create_playlist", () => {
		test("creates playlist successfully", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				name: "My New Playlist",
				uri: "spotify:playlist:new123",
			});

			const handler = server.getHandler("spotify_create_playlist")!;
			const result = await handler({
				collaborative: false,
				name: "My New Playlist",
				public: false,
			});

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/me/playlists",
				"POST",
				{
					collaborative: false,
					name: "My New Playlist",
					public: false,
				},
			);
			expect(result).toEqual(
				textResult(
					'Created playlist "My New Playlist" — spotify:playlist:new123',
				),
			);
		});

		test("includes description when provided", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				name: "Described",
				uri: "spotify:playlist:desc",
			});

			const handler = server.getHandler("spotify_create_playlist")!;
			await handler({
				collaborative: false,
				description: "A great playlist",
				name: "Described",
				public: false,
			});

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/me/playlists",
				"POST",
				{
					collaborative: false,
					description: "A great playlist",
					name: "Described",
					public: false,
				},
			);
		});

		test("omits description when undefined", async () => {
			mockSpotifyRequest.mockResolvedValueOnce({
				name: "No Desc",
				uri: "spotify:playlist:nodesc",
			});

			const handler = server.getHandler("spotify_create_playlist")!;
			await handler({
				collaborative: false,
				name: "No Desc",
				public: false,
			});

			const callBody = (mockSpotifyRequest.mock.calls[0] as unknown[])[3];
			expect(callBody).not.toHaveProperty("description");
		});

		test("returns error when collaborative and public are both true", async () => {
			const handler = server.getHandler("spotify_create_playlist")!;
			const result = await handler({
				collaborative: true,
				name: "Bad Playlist",
				public: true,
			});

			expect(mockSpotifyRequest).not.toHaveBeenCalled();
			expect(result).toEqual(
				textResult("Error: a collaborative playlist must be non-public."),
			);
		});

		test("returns failure when API returns null", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_create_playlist")!;
			const result = await handler({
				collaborative: false,
				name: "Failed",
				public: false,
			});

			expect(result).toEqual(textResult("Failed to create playlist."));
		});
	});

	// -- spotify_delete_playlist --

	describe("spotify_delete_playlist", () => {
		test("deletes playlist by extracting ID from URI", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_delete_playlist")!;
			const result = await handler({
				uri: "spotify:playlist:del123",
			});

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/playlists/del123/followers",
				"DELETE",
			);
			expect(result).toEqual(
				textResult("Playlist removed: spotify:playlist:del123"),
			);
		});
	});

	// -- spotify_add_tracks --

	describe("spotify_add_tracks", () => {
		test("adds tracks to playlist", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_add_tracks")!;
			const trackUris = [
				"spotify:track:a1",
				"spotify:track:a2",
				"spotify:track:a3",
			];
			const result = await handler({
				playlist_uri: "spotify:playlist:target",
				track_uris: trackUris,
			});

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/playlists/target/items",
				"POST",
				{
					uris: trackUris,
				},
			);
			expect(result).toEqual(textResult("Added 3 track(s) to playlist."));
		});

		test("reports correct count for single track", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_add_tracks")!;
			const result = await handler({
				playlist_uri: "spotify:playlist:single",
				track_uris: ["spotify:track:only"],
			});

			expect(result).toEqual(textResult("Added 1 track(s) to playlist."));
		});
	});

	// -- spotify_remove_tracks --

	describe("spotify_remove_tracks", () => {
		test("removes tracks without snapshot_id", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_remove_tracks")!;
			const trackUris = ["spotify:track:r1", "spotify:track:r2"];
			const result = await handler({
				playlist_uri: "spotify:playlist:rm",
				track_uris: trackUris,
			});

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/playlists/rm/items",
				"DELETE",
				{
					items: [
						{
							uri: "spotify:track:r1",
						},
						{
							uri: "spotify:track:r2",
						},
					],
				},
			);
			expect(result).toEqual(textResult("Removed 2 track(s) from playlist."));
		});

		test("includes snapshot_id when provided", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_remove_tracks")!;
			await handler({
				playlist_uri: "spotify:playlist:snap",
				snapshot_id: "snap-abc-123",
				track_uris: ["spotify:track:s1"],
			});

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/playlists/snap/items",
				"DELETE",
				{
					items: [
						{
							uri: "spotify:track:s1",
						},
					],
					snapshot_id: "snap-abc-123",
				},
			);
		});

		test("omits snapshot_id when undefined", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_remove_tracks")!;
			await handler({
				playlist_uri: "spotify:playlist:nosnap",
				snapshot_id: undefined,
				track_uris: ["spotify:track:ns1"],
			});

			const callBody = (mockSpotifyRequest.mock.calls[0] as unknown[])[3];
			expect(callBody).not.toHaveProperty("snapshot_id");
		});
	});

	// -- spotify_update_playlist --

	describe("spotify_update_playlist", () => {
		test("updates playlist name", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_update_playlist")!;
			const result = await handler({
				name: "Renamed",
				uri: "spotify:playlist:upd123",
			});

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/playlists/upd123",
				"PUT",
				{
					name: "Renamed",
				},
			);
			expect(result).toEqual(
				textResult("Updated playlist: spotify:playlist:upd123"),
			);
		});

		test("updates multiple fields", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_update_playlist")!;
			await handler({
				collaborative: false,
				description: "New Desc",
				name: "New Name",
				public: true,
				uri: "spotify:playlist:multi",
			});

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/playlists/multi",
				"PUT",
				{
					collaborative: false,
					description: "New Desc",
					name: "New Name",
					public: true,
				},
			);
		});

		test("returns error when no fields are provided", async () => {
			const handler = server.getHandler("spotify_update_playlist")!;
			const result = await handler({
				uri: "spotify:playlist:noop",
			});

			expect(mockSpotifyRequest).not.toHaveBeenCalled();
			expect(result).toEqual(
				textResult(
					"Error: no fields provided to update. Specify at least one of: name, description, public, collaborative.",
				),
			);
		});

		test("returns error when collaborative and public are both true", async () => {
			const handler = server.getHandler("spotify_update_playlist")!;
			const result = await handler({
				collaborative: true,
				public: true,
				uri: "spotify:playlist:bad",
			});

			expect(mockSpotifyRequest).not.toHaveBeenCalled();
			expect(result).toEqual(
				textResult("Error: a collaborative playlist must be non-public."),
			);
		});

		test("allows collaborative when public is false", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_update_playlist")!;
			const result = await handler({
				collaborative: true,
				public: false,
				uri: "spotify:playlist:collab",
			});

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/playlists/collab",
				"PUT",
				{
					collaborative: true,
					public: false,
				},
			);
			expect(result).toEqual(
				textResult("Updated playlist: spotify:playlist:collab"),
			);
		});

		test("only sends defined fields in body", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_update_playlist")!;
			await handler({
				description: "Only desc",
				uri: "spotify:playlist:partial",
			});

			const callBody = (mockSpotifyRequest.mock.calls[0] as unknown[])[3];
			expect(callBody).toEqual({
				description: "Only desc",
			});
			expect(callBody).not.toHaveProperty("name");
			expect(callBody).not.toHaveProperty("public");
			expect(callBody).not.toHaveProperty("collaborative");
		});
	});

	// -- spotify_reorder_tracks --

	describe("spotify_reorder_tracks", () => {
		test("reorders tracks without snapshot_id", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_reorder_tracks")!;
			const result = await handler({
				insert_before: 3,
				range_length: 2,
				range_start: 0,
				uri: "spotify:playlist:reorder",
			});

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/playlists/reorder/items",
				"PUT",
				{
					insert_before: 3,
					range_length: 2,
					range_start: 0,
				},
			);
			expect(result).toEqual(textResult("Reordered tracks in playlist."));
		});

		test("includes snapshot_id when provided", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_reorder_tracks")!;
			await handler({
				insert_before: 5,
				range_length: 1,
				range_start: 1,
				snapshot_id: "snap-xyz",
				uri: "spotify:playlist:reord2",
			});

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/playlists/reord2/items",
				"PUT",
				{
					insert_before: 5,
					range_length: 1,
					range_start: 1,
					snapshot_id: "snap-xyz",
				},
			);
		});

		test("omits snapshot_id when undefined", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_reorder_tracks")!;
			await handler({
				insert_before: 1,
				range_length: 1,
				range_start: 0,
				snapshot_id: undefined,
				uri: "spotify:playlist:noid",
			});

			const callBody = (mockSpotifyRequest.mock.calls[0] as unknown[])[3];
			expect(callBody).not.toHaveProperty("snapshot_id");
		});

		test("extracts playlist ID from URI", async () => {
			mockSpotifyRequest.mockResolvedValueOnce(null);

			const handler = server.getHandler("spotify_reorder_tracks")!;
			await handler({
				insert_before: 0,
				range_length: 3,
				range_start: 2,
				uri: "spotify:playlist:abc999",
			});

			expect(mockSpotifyRequest).toHaveBeenCalledWith(
				mockEnv,
				"/playlists/abc999/items",
				"PUT",
				expect.objectContaining({
					insert_before: 0,
					range_length: 3,
					range_start: 2,
				}),
			);
		});
	});
});
