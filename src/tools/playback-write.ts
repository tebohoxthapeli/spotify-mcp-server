import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerEnv } from "../env.js";
import {
  playTrackInput,
  setPositionInput,
  setRepeatInput,
  setShuffleInput,
  setVolumeInput,
} from "../schemas.js";
import { spotifyRequest, withErrorHandling } from "../spotify-client.js";
import type { SpotifyPlayerState } from "../types.js";
import { textResult } from "../utils.js";

export function registerWriteTools(server: McpServer, env: ServerEnv): void {
  server.tool(
    "spotify_play",
    "Resume playback on Spotify",
    {},
    {
      destructiveHint: false,
      idempotentHint: false,
      readOnlyHint: false,
    },
    withErrorHandling(async () => {
      await spotifyRequest(env, "/me/player/play", "PUT");
      return textResult("Playback resumed.");
    }),
  );

  server.tool(
    "spotify_pause",
    "Pause playback on Spotify",
    {},
    {
      destructiveHint: false,
      idempotentHint: false,
      readOnlyHint: false,
    },
    withErrorHandling(async () => {
      await spotifyRequest(env, "/me/player/pause", "PUT");
      return textResult("Playback paused.");
    }),
  );

  server.tool(
    "spotify_playpause",
    "Toggle play/pause on Spotify",
    {},
    {
      destructiveHint: false,
      idempotentHint: false,
      readOnlyHint: false,
    },
    withErrorHandling(async () => {
      const data = await spotifyRequest<SpotifyPlayerState>(env, "/me/player");

      if (!data) {
        await spotifyRequest(env, "/me/player/play", "PUT");
        return textResult("Playback resumed.");
      }

      if (data.is_playing) {
        await spotifyRequest(env, "/me/player/pause", "PUT");
        return textResult("Playback paused.");
      }

      await spotifyRequest(env, "/me/player/play", "PUT");
      return textResult("Playback resumed.");
    }),
  );

  server.tool(
    "spotify_next_track",
    "Skip to next track on Spotify",
    {},
    {
      destructiveHint: false,
      idempotentHint: false,
      readOnlyHint: false,
    },
    withErrorHandling(async () => {
      await spotifyRequest(env, "/me/player/next", "POST");
      return textResult("Skipped to next track.");
    }),
  );

  server.tool(
    "spotify_previous_track",
    "Skip to previous track on Spotify",
    {},
    {
      destructiveHint: false,
      idempotentHint: false,
      readOnlyHint: false,
    },
    withErrorHandling(async () => {
      await spotifyRequest(env, "/me/player/previous", "POST");
      return textResult("Skipped to previous track.");
    }),
  );

  server.tool(
    "spotify_play_track",
    "Play a specific track on Spotify by URI",
    playTrackInput,
    {
      destructiveHint: false,
      idempotentHint: false,
      readOnlyHint: false,
    },
    withErrorHandling(async ({ uri, context }) => {
      const body: Record<string, unknown> = context
        ? {
            context_uri: context,
            offset: {
              uri,
            },
          }
        : {
            uris: [
              uri,
            ],
          };

      await spotifyRequest(env, "/me/player/play", "PUT", body);
      return textResult(`Now playing: ${uri}`);
    }),
  );

  server.tool(
    "spotify_set_position",
    "Seek to a position in the current track (in seconds)",
    setPositionInput,
    {
      destructiveHint: false,
      idempotentHint: true,
      readOnlyHint: false,
    },
    withErrorHandling(async ({ position }) => {
      const positionMs = Math.round(position * 1000);
      await spotifyRequest(env, "/me/player/seek", "PUT", undefined, {
        position_ms: String(positionMs),
      });
      return textResult(`Position set to ${position}s.`);
    }),
  );

  server.tool(
    "spotify_set_volume",
    "Set playback volume (0-100)",
    setVolumeInput,
    {
      destructiveHint: false,
      idempotentHint: true,
      readOnlyHint: false,
    },
    withErrorHandling(async ({ volume }) => {
      await spotifyRequest(env, "/me/player/volume", "PUT", undefined, {
        volume_percent: String(volume),
      });
      return textResult(`Volume set to ${volume}.`);
    }),
  );

  server.tool(
    "spotify_set_shuffle",
    "Set shuffle mode on or off",
    setShuffleInput,
    {
      destructiveHint: false,
      idempotentHint: true,
      readOnlyHint: false,
    },
    withErrorHandling(async ({ enabled }) => {
      await spotifyRequest(env, "/me/player/shuffle", "PUT", undefined, {
        state: String(enabled),
      });
      return textResult(`Shuffle ${enabled ? "enabled" : "disabled"}.`);
    }),
  );

  server.tool(
    "spotify_set_repeat",
    "Set repeat mode (true = track repeat, false = off)",
    setRepeatInput,
    {
      destructiveHint: false,
      idempotentHint: true,
      readOnlyHint: false,
    },
    withErrorHandling(async ({ enabled }) => {
      const state = enabled ? "track" : "off";
      await spotifyRequest(env, "/me/player/repeat", "PUT", undefined, {
        state,
      });
      return textResult(`Repeat set to ${state}.`);
    }),
  );
}
