import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerEnv } from "../env.js";
import { followedArtistsInput, topItemsInput } from "../schemas.js";
import { spotifyRequest, withErrorHandling } from "../spotify-client.js";
import type {
  SpotifyFollowedArtistsResponse,
  SpotifySearchArtist,
  SpotifyTopItemsResponse,
  SpotifyTrack,
  SpotifyUserProfile,
} from "../types.js";
import { formatDuration, READ_ANNOTATIONS, textResult } from "../utils.js";

export function registerUserTools(server: McpServer, env: ServerEnv): void {
  server.tool(
    "spotify_get_profile",
    "Get the current user's Spotify profile (display name, followers, subscription, profile URL)",
    {},
    READ_ANNOTATIONS,
    withErrorHandling(async () => {
      const profile = await spotifyRequest<SpotifyUserProfile>(env, "/me");

      if (!profile) {
        return textResult("Could not retrieve profile.");
      }

      const lines = [
        `Display name: ${profile.display_name ?? "N/A"}`,
        `User ID: ${profile.id}`,
        `URI: ${profile.uri}`,
        `Profile: ${profile.external_urls.spotify}`,
      ];

      if (profile.email) {
        lines.push(`Email: ${profile.email}`);
      }
      if (profile.country) {
        lines.push(`Country: ${profile.country}`);
      }
      if (profile.product) {
        lines.push(`Subscription: ${profile.product}`);
      }
      if (profile.followers) {
        lines.push(`Followers: ${profile.followers.total}`);
      }
      if (profile.images.length > 0) {
        lines.push(`Avatar: ${profile.images[0]?.url}`);
      }

      return textResult(lines.join("\n"));
    }),
  );

  server.tool(
    "spotify_get_top_items",
    "Get the current user's top artists or tracks based on listening history. Supports time ranges: short_term (~4 weeks), medium_term (~6 months), long_term (~1 year).",
    topItemsInput,
    READ_ANNOTATIONS,
    withErrorHandling(async ({ type, time_range, limit, offset }) => {
      const rangeLabel =
        time_range === "short_term"
          ? "~4 weeks"
          : time_range === "medium_term"
            ? "~6 months"
            : "~1 year";

      const queryParams = {
        limit: String(limit),
        offset: String(offset),
        time_range,
      };

      if (type === "tracks") {
        const data = await spotifyRequest<
          SpotifyTopItemsResponse<SpotifyTrack>
        >(env, "/me/top/tracks", "GET", undefined, queryParams);

        if (!data || data.items.length === 0) {
          return textResult(`No top tracks found for ${time_range}.`);
        }

        const lines = data.items.map(
          (t, i) =>
            `  ${i + 1 + offset}. ${t.name} — ${t.artists.map((a) => a.name).join(", ")} [${formatDuration(t.duration_ms)}] (${t.uri})`,
        );

        let text = `Top tracks (${rangeLabel}, ${data.total} total):\n${lines.join("\n")}`;
        if (data.next) {
          text += `\n\nMore available — use offset=${offset + limit}`;
        }
        return textResult(text);
      }

      const data = await spotifyRequest<
        SpotifyTopItemsResponse<SpotifySearchArtist>
      >(env, "/me/top/artists", "GET", undefined, queryParams);

      if (!data || data.items.length === 0) {
        return textResult(`No top artists found for ${time_range}.`);
      }

      const lines = data.items.map(
        (a, i) =>
          `  ${i + 1 + offset}. ${a.name}${(a.genres ?? []).length > 0 ? ` [${(a.genres ?? []).slice(0, 3).join(", ")}]` : ""} (${a.uri})`,
      );

      let text = `Top artists (${rangeLabel}, ${data.total} total):\n${lines.join("\n")}`;
      if (data.next) {
        text += `\n\nMore available — use offset=${offset + limit}`;
      }
      return textResult(text);
    }),
  );

  server.tool(
    "spotify_get_followed_artists",
    "Get artists the current user follows. Uses cursor-based pagination.",
    followedArtistsInput,
    READ_ANNOTATIONS,
    withErrorHandling(async ({ limit, after }) => {
      const params: Record<string, string> = {
        limit: String(limit),
        type: "artist",
      };
      if (after) {
        params.after = after;
      }

      const data = await spotifyRequest<SpotifyFollowedArtistsResponse>(
        env,
        "/me/following",
        "GET",
        undefined,
        params,
      );

      if (!data || data.artists.items.length === 0) {
        return textResult("No followed artists found.");
      }

      const lines = data.artists.items.map(
        (a, i) =>
          `  ${i + 1}. ${a.name}${(a.genres ?? []).length > 0 ? ` [${(a.genres ?? []).slice(0, 3).join(", ")}]` : ""} (${a.uri})`,
      );

      let text = `Followed artists (${data.artists.total} total):\n${lines.join("\n")}`;

      if (data.artists.cursors?.after) {
        text += `\n\nNext page — use after="${data.artists.cursors.after}"`;
      }

      return textResult(text);
    }),
  );
}
