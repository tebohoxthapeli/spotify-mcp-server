#!/usr/bin/env bun
/**
 * Direct Spotify CLI for OpenCode integration.
 * Usage:
 *   bun run src/cli.ts search "Bad Girl" "Solange"
 *   bun run src/cli.ts queue spotify:track:xxx
 *   bun run src/cli.ts current
 *   bun run src/cli.ts devices
 *   bun run src/cli.ts transfer <device_id>
 */

import { parseServerEnv, type ServerEnv } from "./env.js";
import { spotifyRequest } from "./spotify-client.js";
import type {
  SpotifyCurrentlyPlaying,
  SpotifyPlayerState,
  SpotifyPlaylistPage,
  SpotifySearchResult,
} from "./types.js";
import { extractIdFromUri, formatDuration } from "./utils.js";

async function search(
  env: ServerEnv,
  query: string,
  type: string[] = [
    "track",
  ],
): Promise<void> {
  const data = await spotifyRequest<SpotifySearchResult>(
    env,
    "/search",
    "GET",
    undefined,
    {
      limit: "10",
      q: query,
      type: type.join(","),
    },
  );

  if (!data?.tracks?.items.length) {
    console.log("No tracks found.");
    return;
  }

  console.log("\nSearch Results:\n");
  for (const track of data.tracks.items) {
    const artists = track.artists.map((a) => a.name).join(", ");
    console.log(`  ${track.name}`);
    console.log(`    Artist: ${artists}`);
    console.log(`    Album: ${track.album.name}`);
    console.log(`    Duration: ${formatDuration(track.duration_ms)}`);
    console.log(`    URI: ${track.uri}`);
    console.log();
  }
}

async function queueTrack(env: ServerEnv, uri: string): Promise<void> {
  await spotifyRequest(env, "/me/player/queue", "POST", undefined, {
    uri,
  });
  console.log(`Added to queue: ${uri}`);
}

async function getQueue(env: ServerEnv): Promise<void> {
  const data = await spotifyRequest<{
    currently_playing?: {
      name: string;
      uri: string;
      artists: Array<{
        name: string;
      }>;
      album: {
        name: string;
      };
    };
    queue?: Array<{
      name: string;
      uri: string;
      artists: Array<{
        name: string;
      }>;
      album: {
        name: string;
      };
      duration_ms: number;
    }>;
  } | null>(env, "/me/player/queue", "GET");

  if (!data) {
    console.log("No queue data available.");
    return;
  }

  console.log("\nQueue:\n");

  if (data.currently_playing) {
    const artists = data.currently_playing.artists
      .map((a) => a.name)
      .join(", ");
    console.log(`  NOW PLAYING: ${data.currently_playing.name}`);
    console.log(`    Artist: ${artists}`);
    console.log(`    Album: ${data.currently_playing.album.name}`);
    console.log();
  }

  if (data.queue?.length) {
    console.log(`  UP NEXT (${data.queue.length} tracks):\n`);
    for (let i = 0; i < Math.min(data.queue.length, 10); i++) {
      const track = data.queue[i];
      const artists = track.artists.map((a) => a.name).join(", ");
      console.log(`    ${i + 1}. ${track.name}`);
      console.log(`       Artist: ${artists}`);
      console.log(`       Album: ${track.album.name}`);
      console.log();
    }
    if (data.queue.length > 10) {
      console.log(`    ... and ${data.queue.length - 10} more`);
    }
  } else {
    console.log("  Queue is empty.");
  }
}

async function getCurrentTrack(env: ServerEnv): Promise<void> {
  const data = await spotifyRequest<SpotifyCurrentlyPlaying>(
    env,
    "/me/player/currently-playing",
  );

  if (!data?.item) {
    console.log("No track currently playing.");
    return;
  }

  const track = data.item;
  const artists = track.artists.map((a) => a.name).join(", ");
  console.log("\nCurrently Playing:\n");
  console.log(`  ${track.name}`);
  console.log(`    Artist: ${artists}`);
  console.log(`    Album: ${track.album.name}`);
  console.log(`    URI: ${track.uri}`);
  console.log(`    Status: ${data.is_playing ? "Playing" : "Paused"}`);
}

async function getDevices(env: ServerEnv): Promise<void> {
  const data = await spotifyRequest<{
    devices: Array<{
      id: string;
      name: string;
      type: string;
      is_active: boolean;
      volume_percent: number | null;
    }>;
  } | null>(env, "/me/player/devices", "GET");

  if (!data?.devices?.length) {
    console.log("No devices found. Open Spotify on a device first.");
    return;
  }

  console.log("\nAvailable Devices:\n");
  for (const device of data.devices) {
    const status = device.is_active ? " [ACTIVE]" : "";
    console.log(`  ${device.name} (${device.type})${status}`);
    console.log(`    ID: ${device.id}`);
    console.log(`    Volume: ${device.volume_percent ?? "N/A"}%`);
    console.log();
  }
}

async function transferPlayback(
  env: ServerEnv,
  deviceId: string,
  play: boolean = true,
): Promise<void> {
  await spotifyRequest(env, "/me/player", "PUT", {
    device_ids: [
      deviceId,
    ],
    play,
  });
  console.log(`Transferred playback to device: ${deviceId}`);
}

async function getPlayerState(env: ServerEnv): Promise<void> {
  const data = await spotifyRequest<SpotifyPlayerState>(env, "/me/player");

  if (!data) {
    console.log("No active player session.");
    return;
  }

  console.log("\nPlayer State:\n");
  if (data.device) {
    console.log(`  Device: ${data.device.name} (${data.device.type})`);
    console.log(`    Active: ${data.device.is_active}`);
    console.log(`    ID: ${data.device.id}`);
  }
  if (data.item) {
    const artists = data.item.artists.map((a) => a.name).join(", ");
    console.log(`  Track: ${data.item.name}`);
    console.log(`    Artist: ${artists}`);
    console.log(`    Album: ${data.item.album.name}`);
    console.log(`    Playing: ${data.is_playing}`);
  }
}

async function getPlaylists(env: ServerEnv): Promise<void> {
  const data = await spotifyRequest<SpotifyPlaylistPage>(
    env,
    "/me/playlists",
    "GET",
    undefined,
    {
      limit: "50",
    },
  );

  if (!data?.items?.length) {
    console.log("No playlists found.");
    return;
  }

  console.log("\nYour Playlists:\n");
  for (const playlist of data.items) {
    const owner = playlist.owner?.display_name ?? "Unknown";
    const trackCount = playlist.tracks?.total ?? "N/A";
    console.log(`  ${playlist.name}`);
    console.log(`    Tracks: ${trackCount}`);
    console.log(`    Owner: ${owner}`);
    console.log(`    URI: ${playlist.uri}`);
    console.log();
  }

  if (data.next) {
    console.log(`(Showing ${data.items.length} of ${data.total} playlists)`);
  }
}

async function addToPlaylist(
  env: ServerEnv,
  playlistUri: string,
  trackUri: string,
): Promise<void> {
  const playlistId = extractIdFromUri(playlistUri);
  await spotifyRequest(env, `/playlists/${playlistId}/items`, "POST", {
    uris: [
      trackUri,
    ],
  });
  console.log(`Added track to playlist: ${playlistUri}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Spotify CLI for OpenCode

Commands:
  search <query>          Search for tracks
  queue <uri>             Add track to queue (e.g., spotify:track:xxx)
  queue-list              Show current queue
  current                 Show currently playing track
  devices                 List available devices
  transfer <device_id>    Transfer playback to a device
  state                   Show full player state
  playlists               List your playlists
  add-to-playlist <playlist_uri> <track_uri>  Add track to playlist

Examples:
  bun run src/cli.ts search "Bad Girl" "Solange"
  bun run src/cli.ts queue spotify:track:4iV5W9uYEdYUVa79Axb7Rh
  bun run src/cli.ts queue-list
  bun run src/cli.ts playlists
  bun run src/cli.ts add-to-playlist spotify:playlist:xxx spotify:track:xxx
`);
    process.exit(0);
  }

  const env = parseServerEnv();
  const command = args[0];

  try {
    switch (command) {
      case "search": {
        const query = args.slice(1).join(" ");
        if (!query) {
          console.error("Usage: cli.ts search <query>");
          process.exit(1);
        }
        await search(env, query);
        break;
      }
      case "queue": {
        const uri = args[1];
        if (!uri) {
          console.error("Usage: cli.ts queue <uri>");
          process.exit(1);
        }
        await queueTrack(env, uri);
        break;
      }
      case "current": {
        await getCurrentTrack(env);
        break;
      }
      case "devices": {
        await getDevices(env);
        break;
      }
      case "transfer": {
        const deviceId = args[1];
        if (!deviceId) {
          console.error("Usage: cli.ts transfer <device_id>");
          process.exit(1);
        }
        await transferPlayback(env, deviceId);
        break;
      }
      case "state": {
        await getPlayerState(env);
        break;
      }
      case "queue-list": {
        await getQueue(env);
        break;
      }
      case "playlists": {
        await getPlaylists(env);
        break;
      }
      case "add-to-playlist": {
        const playlistUri = args[1];
        const trackUri = args[2];
        if (!playlistUri || !trackUri) {
          console.error(
            "Usage: cli.ts add-to-playlist <playlist_uri> <track_uri>",
          );
          process.exit(1);
        }
        await addToPlaylist(env, playlistUri, trackUri);
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

main();
