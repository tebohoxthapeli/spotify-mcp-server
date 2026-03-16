import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerEnv } from "../env.js";
import { recommendationsInput } from "../schemas.js";
import { spotifyRequest, withErrorHandling } from "../spotify-client.js";
import type {
  SpotifyAlbum,
  SpotifyPaginatedResult,
  SpotifySimplifiedTrack,
  SpotifyTrack,
} from "../types.js";
import { textResult } from "../utils.js";

const MAX_ALBUMS_PER_ARTIST = 5;
const TRACKS_PER_ALBUM = 20;

type EnrichedTrack = Readonly<{
  albumName: string;
  artists: readonly {
    readonly name: string;
  }[];
  id: string;
  name: string;
  uri: string;
}>;

function shuffleArray<T>(array: readonly T[]): T[] {
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

async function getTracksFromArtist(
  env: ServerEnv,
  artistId: string,
): Promise<readonly EnrichedTrack[]> {
  const albumsPage = await spotifyRequest<SpotifyPaginatedResult<SpotifyAlbum>>(
    env,
    `/artists/${artistId}/albums`,
    "GET",
    undefined,
    {
      include_groups: "album,single",
      limit: String(MAX_ALBUMS_PER_ARTIST),
    },
  );

  if (!albumsPage?.items.length) return [];

  const albumTrackRequests = albumsPage.items.map(async (album) => {
    const page = await spotifyRequest<
      SpotifyPaginatedResult<SpotifySimplifiedTrack>
    >(env, `/albums/${album.id}/tracks`, "GET", undefined, {
      limit: String(TRACKS_PER_ALBUM),
    });

    return (page?.items ?? []).map(
      (track): EnrichedTrack => ({
        albumName: album.name,
        artists: track.artists,
        id: track.id,
        name: track.name,
        uri: track.uri,
      }),
    );
  });

  const results = await Promise.all(albumTrackRequests);
  return results.flat();
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

      // Collect artist IDs from direct seeds and from track lookups
      const artistIds = new Set<string>(seed_artists ?? []);
      const seedTrackIds = new Set<string>(seed_tracks ?? []);

      // Resolve artists from seed tracks
      const trackLookups = (seed_tracks ?? []).map((id) =>
        spotifyRequest<SpotifyTrack>(env, `/tracks/${id}`),
      );
      const trackResults = await Promise.all(trackLookups);

      for (const track of trackResults) {
        if (track) {
          for (const artist of track.artists) {
            artistIds.add(artist.id);
          }
        }
      }

      if (artistIds.size === 0) {
        return textResult(
          "Could not resolve any artists from the provided seeds.",
        );
      }

      // Fetch tracks from each artist's albums
      const artistTrackRequests = [
        ...artistIds,
      ].map((id) => getTracksFromArtist(env, id));
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
