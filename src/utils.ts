import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ServerEnv } from "./env.js";
import { spotifyRequest } from "./spotify-client.js";
import type { SpotifyArtistProfile, SpotifySearchResult } from "./types.js";

export function textResult(text: string): CallToolResult {
  return {
    content: [
      {
        text,
        type: "text",
      },
    ],
  };
}

export const READ_ANNOTATIONS = {
  destructiveHint: false,
  readOnlyHint: true,
} as const;

export function extractIdFromUri(uri: string): string {
  const id = uri.split(":")[2];
  if (!id) {
    throw new Error(`Cannot extract ID from URI: ${uri}`);
  }
  return id;
}

/**
 * Auto-quote multi-word field filter values for Spotify search.
 * Transforms `artist:Connor Rhys` → `artist:"Connor Rhys"`
 * Already-quoted values and single-word values are left untouched.
 */
export function normaliseSearchQuery(query: string): string {
  // Match field:value patterns, handling both quoted and unquoted values
  return query.replace(
    /\b(artist|album|track|year|genre):("(?:[^"\\]|\\.)*"|\S+(?:\s+(?!artist:|album:|track:|year:|genre:|\s*$)\S+)*)/gi,
    (_match, field: string, value: string) => {
      // Already quoted — leave as-is
      if (value.startsWith('"') && value.endsWith('"')) {
        return `${field}:${value}`;
      }
      // Single word — no quoting needed
      if (!value.includes(" ")) {
        return `${field}:${value}`;
      }
      // Multi-word — wrap in quotes
      return `${field}:"${value}"`;
    },
  );
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export async function searchTracksByArtist(
  env: ServerEnv,
  artistName: string,
  limit: number,
): Promise<SpotifySearchResult | null> {
  return spotifyRequest<SpotifySearchResult>(env, "/search", "GET", undefined, {
    limit: String(limit),
    q: `artist:"${artistName}"`,
    type: "track",
  });
}

export async function getArtistName(
  env: ServerEnv,
  artistId: string,
): Promise<string | null> {
  const data = await spotifyRequest<SpotifyArtistProfile>(
    env,
    `/artists/${artistId}`,
  );
  return data?.name ?? null;
}

export const WRITE_ANNOTATIONS = {
  destructiveHint: false,
  idempotentHint: false,
  readOnlyHint: false,
} as const;
