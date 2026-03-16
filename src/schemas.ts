import { z } from "zod";

const spotifyUriRegex =
  /^spotify:(track|album|playlist|artist|episode|show):[a-zA-Z0-9]+$/;

const spotifyTrackUriRegex = /^spotify:track:[a-zA-Z0-9]+$/;

const spotifyPlaylistUriRegex = /^spotify:playlist:[a-zA-Z0-9]+$/;

export const playTrackInput = {
  context: z
    .string()
    .regex(spotifyUriRegex, "Invalid Spotify URI format")
    .optional()
    .describe("Optional playlist or album URI to play within"),
  uri: z
    .string()
    .regex(spotifyUriRegex, "Invalid Spotify URI format")
    .describe("Spotify URI (e.g. spotify:track:4iV5W9uYEdYUVa79Axb7Rh)"),
};

export const setPositionInput = {
  position: z.number().min(0).describe("Position in seconds"),
};

export const setVolumeInput = {
  volume: z.number().int().min(0).max(100).describe("Volume level (0-100)"),
};

export const setShuffleInput = {
  enabled: z.boolean().describe("Whether to enable shuffle"),
};

export const setRepeatInput = {
  enabled: z
    .boolean()
    .describe("Whether to enable repeat (true = track repeat, false = off)"),
};

export const getPlaylistsInput = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Max playlists to return (1-50)"),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Index of first playlist to return"),
};

export const getPlaylistTracksInput = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe("Max tracks to return (1-100)"),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Index of first track to return"),
  uri: z
    .string()
    .regex(spotifyPlaylistUriRegex, "Must be a playlist URI")
    .describe("Playlist URI"),
};

export const createPlaylistInput = {
  collaborative: z
    .boolean()
    .default(false)
    .describe("Whether playlist is collaborative"),
  description: z.string().optional().describe("Playlist description"),
  name: z.string().min(1).describe("Playlist name"),
  public: z.boolean().default(false).describe("Whether playlist is public"),
};

export const deletePlaylistInput = {
  uri: z
    .string()
    .regex(spotifyPlaylistUriRegex, "Must be a playlist URI")
    .describe("Playlist URI to delete"),
};

export const addTracksInput = {
  playlist_uri: z
    .string()
    .regex(spotifyPlaylistUriRegex, "Must be a playlist URI")
    .describe("Target playlist URI"),
  track_uris: z
    .array(
      z
        .string()
        .regex(spotifyTrackUriRegex, "Must be a track URI (spotify:track:...)"),
    )
    .min(1)
    .max(100)
    .describe("Track URIs to add"),
};

export const removeTracksInput = {
  playlist_uri: z
    .string()
    .regex(spotifyPlaylistUriRegex, "Must be a playlist URI")
    .describe("Target playlist URI"),
  snapshot_id: z
    .string()
    .optional()
    .describe("Playlist snapshot ID for concurrency safety"),
  track_uris: z
    .array(
      z
        .string()
        .regex(spotifyTrackUriRegex, "Must be a track URI (spotify:track:...)"),
    )
    .min(1)
    .max(100)
    .describe("Track URIs to remove"),
};

export const updatePlaylistInput = {
  collaborative: z.boolean().optional().describe("Set collaborative"),
  description: z.string().optional().describe("New description"),
  name: z.string().min(1).optional().describe("New name"),
  public: z.boolean().optional().describe("Set public/private"),
  uri: z
    .string()
    .regex(spotifyPlaylistUriRegex, "Must be a playlist URI")
    .describe("Playlist URI to update"),
};

export const searchInput = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Max results per type (1-50)"),
  offset: z
    .number()
    .int()
    .min(0)
    .max(1000)
    .default(0)
    .describe("Result offset for pagination"),
  query: z
    .string()
    .min(1)
    .describe(
      "Search query (supports field filters: artist:, album:, track:, year:, genre:)",
    ),
  type: z
    .array(
      z.enum([
        "track",
        "artist",
        "album",
        "playlist",
      ]),
    )
    .default([
      "track",
    ])
    .describe("Result types to return"),
};

export const recentlyPlayedInput = {
  after: z
    .number()
    .int()
    .optional()
    .describe("Unix timestamp ms — return items after this cursor"),
  before: z
    .number()
    .int()
    .optional()
    .describe("Unix timestamp ms — return items before this cursor"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Max items to return (1-50)"),
};

export const queueTrackInput = {
  uri: z
    .string()
    .regex(spotifyUriRegex, "Invalid Spotify URI format")
    .describe("Track or episode URI to add to queue"),
};

export const reorderPlaylistTracksInput = {
  insert_before: z.number().int().min(0).describe("Position to insert before"),
  range_length: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe("Number of tracks to move"),
  range_start: z
    .number()
    .int()
    .min(0)
    .describe("Position of first track to move"),
  snapshot_id: z
    .string()
    .optional()
    .describe("Playlist snapshot ID for concurrency safety"),
  uri: z
    .string()
    .regex(spotifyPlaylistUriRegex, "Must be a playlist URI")
    .describe("Playlist URI"),
};
