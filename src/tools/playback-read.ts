import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerEnv } from "../env.js";
import { spotifyRequest, withErrorHandling } from "../spotify-client.js";
import type { SpotifyCurrentlyPlaying, SpotifyPlayerState } from "../types.js";
import { textResult } from "../utils.js";

const READ_ANNOTATIONS = {
  destructiveHint: false,
  readOnlyHint: true,
} as const;

export function registerReadTools(server: McpServer, env: ServerEnv): void {
  server.tool(
    "spotify_get_current_track",
    "Get information about the currently playing track on Spotify",
    {},
    READ_ANNOTATIONS,
    withErrorHandling(async () => {
      const data = await spotifyRequest<SpotifyCurrentlyPlaying>(
        env,
        "/me/player/currently-playing",
      );

      if (!data || !data.item) {
        return textResult("Nothing is currently playing.");
      }

      const track = data.item;
      const artists = track.artists.map((a) => a.name).join(", ");
      const text = [
        `Name: ${track.name}`,
        `Artist: ${artists}`,
        `Album: ${track.album.name}`,
        `Duration: ${Math.round(track.duration_ms / 1000)}s`,
        `URI: ${track.uri}`,
        `URL: ${track.external_urls.spotify}`,
      ].join("\n");

      return textResult(text);
    }),
  );

  server.tool(
    "spotify_get_player_state",
    "Get current playback state (playing, paused, or stopped)",
    {},
    READ_ANNOTATIONS,
    withErrorHandling(async () => {
      const data = await spotifyRequest<SpotifyPlayerState>(env, "/me/player");

      if (!data) {
        return textResult("stopped");
      }

      return textResult(data.is_playing ? "playing" : "paused");
    }),
  );

  server.tool(
    "spotify_get_position",
    "Get current playback position in seconds",
    {},
    READ_ANNOTATIONS,
    withErrorHandling(async () => {
      const data = await spotifyRequest<SpotifyPlayerState>(env, "/me/player");

      if (!data || data.progress_ms === null) {
        return textResult("0");
      }

      return textResult(String(Math.round(data.progress_ms / 1000)));
    }),
  );

  server.tool(
    "spotify_get_volume",
    "Get current volume level (0-100)",
    {},
    READ_ANNOTATIONS,
    withErrorHandling(async () => {
      const data = await spotifyRequest<SpotifyPlayerState>(env, "/me/player");

      if (!data || data.device.volume_percent === null) {
        return textResult("Volume unavailable");
      }

      return textResult(String(data.device.volume_percent));
    }),
  );

  server.tool(
    "spotify_get_shuffle",
    "Get current shuffle state (true/false)",
    {},
    READ_ANNOTATIONS,
    withErrorHandling(async () => {
      const data = await spotifyRequest<SpotifyPlayerState>(env, "/me/player");

      if (!data) {
        return textResult("false");
      }

      return textResult(String(data.shuffle_state));
    }),
  );

  server.tool(
    "spotify_get_repeat",
    "Get current repeat mode (off, track, or context)",
    {},
    READ_ANNOTATIONS,
    withErrorHandling(async () => {
      const data = await spotifyRequest<SpotifyPlayerState>(env, "/me/player");

      if (!data) {
        return textResult("off");
      }

      return textResult(data.repeat_state);
    }),
  );
}
