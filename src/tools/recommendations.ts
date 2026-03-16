import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerEnv } from "../env.js";
import { recommendationsInput } from "../schemas.js";
import { spotifyRequest, withErrorHandling } from "../spotify-client.js";
import type {
  SpotifyTopTracksResponse,
  SpotifyTracksResponse,
} from "../types.js";
import { textResult } from "../utils.js";

type EnrichedTrack = Readonly<{
  albumName: string;
  artists: readonly {
    readonly name: string;
  }[];
  id: string;
  name: string;
  uri: string;
}>;

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

async function getTopTracksFromArtist(
  env: ServerEnv,
  artistId: string,
): Promise<readonly EnrichedTrack[]> {
  const response = await spotifyRequest<SpotifyTopTracksResponse>(
    env,
    `/artists/${artistId}/top-tracks`,
  );

  if (!response?.tracks.length) return [];

  return response.tracks.map(
    (track): EnrichedTrack => ({
      albumName: track.album.name,
      artists: track.artists,
      id: track.id,
      name: track.name,
      uri: track.uri,
    }),
  );
}

async function resolveSeedArtists(
  env: ServerEnv,
  seedArtists: readonly string[] | undefined,
  seedTrackIds: readonly string[],
): Promise<Set<string>> {
  const artistIds = new Set<string>(seedArtists ?? []);

  if (seedTrackIds.length === 0) return artistIds;

  const trackResults = await spotifyRequest<SpotifyTracksResponse>(
    env,
    "/tracks",
    "GET",
    undefined,
    {
      ids: seedTrackIds.join(","),
    },
  );

  if (!trackResults?.tracks) return artistIds;

  for (const track of trackResults.tracks) {
    if (track) {
      for (const artist of track.artists) {
        artistIds.add(artist.id);
      }
    }
  }

  return artistIds;
}

async function collectCandidates(
  env: ServerEnv,
  artistIds: ReadonlySet<string>,
  seedTrackIds: readonly string[],
): Promise<EnrichedTrack[]> {
  const artistTrackResults = await Promise.all(
    [
      ...artistIds,
    ].map((id) => getTopTracksFromArtist(env, id)),
  );

  const seen = new Set<string>(seedTrackIds);
  const candidates: EnrichedTrack[] = [];

  for (const tracks of artistTrackResults) {
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
  candidates: readonly EnrichedTrack[],
  limit: number,
): string {
  const shuffled = shuffleArray(candidates).slice(0, limit);

  const lines = shuffled.map(
    (t) =>
      `  ${t.name} — ${t.artists.map((a) => a.name).join(", ")} [${t.albumName}] (${t.uri})`,
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
      const artistIds = await resolveSeedArtists(
        env,
        seed_artists,
        seedTrackIds,
      );

      if (artistIds.size === 0) {
        return textResult(
          "Could not resolve any artists from the provided seeds.",
        );
      }

      const candidates = await collectCandidates(env, artistIds, seedTrackIds);

      if (candidates.length === 0) {
        return textResult("No recommendations found for the provided seeds.");
      }

      return textResult(formatRecommendations(candidates, limit));
    }),
  );
}
