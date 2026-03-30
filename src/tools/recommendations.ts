import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerEnv } from "../env.js";
import { recommendationsInput } from "../schemas.js";
import { spotifyRequest, withErrorHandling } from "../spotify-client.js";
import type {
  SpotifyArtistProfile,
  SpotifyTrack,
  SpotifyTracksResponse,
} from "../types.js";
import { formatDuration, searchTracksByArtist, textResult } from "../utils.js";

export function shuffleArray<T>(array: readonly T[]): T[] {
  const result = [
    ...array,
  ];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [
      result[j],
      result[i],
    ];
  }
  return result;
}

async function resolveArtistNames(
  env: ServerEnv,
  seedArtists: readonly string[] | undefined,
  seedTrackIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const artistNames = new Set<string>();

  // Resolve artist IDs to names
  if (seedArtists?.length) {
    const batchResult = await spotifyRequest<{
      artists: readonly SpotifyArtistProfile[];
    }>(env, "/artists", "GET", undefined, {
      ids: seedArtists.join(","),
    });
    const nameResults = batchResult?.artists ?? [];
    for (const artist of nameResults) {
      if (artist?.name) artistNames.add(artist.name);
    }
  }

  // Resolve seed tracks to their artist names
  if (seedTrackIds.length > 0) {
    const trackResults = await spotifyRequest<SpotifyTracksResponse>(
      env,
      "/tracks",
      "GET",
      undefined,
      {
        ids: seedTrackIds.join(","),
      },
    );

    if (trackResults?.tracks) {
      for (const track of trackResults.tracks) {
        if (track) {
          for (const artist of track.artists) {
            artistNames.add(artist.name);
          }
        }
      }
    }
  }

  return artistNames;
}

function collectCandidates(
  tracksByArtist: readonly (readonly SpotifyTrack[])[],
  seedTrackIds: readonly string[],
): SpotifyTrack[] {
  const seen = new Set<string>(seedTrackIds);
  const candidates: SpotifyTrack[] = [];

  for (const tracks of tracksByArtist) {
    for (const track of tracks) {
      if (!seen.has(track.id)) {
        seen.add(track.id);
        candidates.push(track);
      }
    }
  }

  return candidates;
}

function formatRecommendations(
  candidates: readonly SpotifyTrack[],
  limit: number,
): string {
  const shuffled = shuffleArray(candidates).slice(0, limit);

  const lines = shuffled.map(
    (t) =>
      `  ${t.name} — ${t.artists.map((a) => a.name).join(", ")} [${t.album.name}] (${formatDuration(t.duration_ms)}) (${t.uri})`,
  );

  return `Recommendations (${shuffled.length} tracks):\n${lines.join("\n")}`;
}

export function registerRecommendationTools(
  server: McpServer,
  env: ServerEnv,
): void {
  server.tool(
    "spotify_get_recommendations",
    "Get track recommendations based on seed artists or tracks (finds similar music from related catalogues)",
    recommendationsInput,
    {
      destructiveHint: false,
      readOnlyHint: true,
    },
    withErrorHandling(async ({ limit, seed_artists, seed_tracks }) => {
      const hasArtists = (seed_artists?.length ?? 0) > 0;
      const hasTracks = (seed_tracks?.length ?? 0) > 0;

      if (!hasArtists && !hasTracks) {
        return textResult(
          "At least one seed (seed_artists or seed_tracks) is required.",
        );
      }

      const seedTrackIds = seed_tracks ?? [];
      const artistNames = await resolveArtistNames(
        env,
        seed_artists,
        seedTrackIds,
      );

      if (artistNames.size === 0) {
        return textResult(
          "Could not resolve any artists from the provided seeds.",
        );
      }

      // Search for tracks by each artist in parallel
      const perArtistLimit = Math.max(
        5,
        Math.ceil((limit * 2) / artistNames.size),
      );
      const tracksByArtist = await Promise.all(
        [
          ...artistNames,
        ].map(async (name) => {
          const result = await searchTracksByArtist(env, name, perArtistLimit);
          return result?.tracks?.items ?? [];
        }),
      );

      const candidates = collectCandidates(tracksByArtist, seedTrackIds);

      if (candidates.length === 0) {
        return textResult("No recommendations found for the provided seeds.");
      }

      return textResult(formatRecommendations(candidates, limit));
    }),
  );
}
