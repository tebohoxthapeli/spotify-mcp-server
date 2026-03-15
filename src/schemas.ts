import { z } from "zod";

const spotifyUriRegex =
  /^spotify:(track|album|playlist|artist|episode|show):[a-zA-Z0-9]+$/;

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
