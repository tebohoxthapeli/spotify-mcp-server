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

      const artistIds = new Set<string>(seed_artists ?? []);
      const seedTrackIds = seed_tracks ?? [];

      // Batch lookup seed tracks (single request instead of N individual calls)
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
                artistIds.add(artist.id);
              }
            }
          }
        }
      }

      if (artistIds.size === 0) {
        return textResult(
          "Could not resolve any artists from the provided seeds.",
        );
      }

      // Fetch top tracks per artist (1 call each vs 6+ with album crawling)
      const artistTrackRequests = [
        ...artistIds,
      ].map((id) => getTopTracksFromArtist(env, id));
      const artistTrackResults = await Promise.all(artistTrackRequests);

      // Merge, deduplicate, exclude seed tracks
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

      if (candidates.length === 0) {
        return textResult("No recommendations found for the provided seeds.");
      }

      const shuffled = shuffleArray(candidates).slice(0, limit);

      const lines = shuffled.map(
        (t) =>
          `  ${t.name} — ${t.artists.map((a) => a.name).join(", ")} [${t.albumName}] (${t.uri})`,
      );

      return textResult(
        `Recommendations (${shuffled.length} tracks):\n${lines.join("\n")}`,
      );
    }),
  );
}
