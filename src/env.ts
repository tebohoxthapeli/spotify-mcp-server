import { z } from "zod";

const baseSpotifySchema = z.object({
  SPOTIFY_CLIENT_ID: z.string().min(1),
  SPOTIFY_CLIENT_SECRET: z.string().min(1),
  SPOTIFY_REDIRECT_URI: z
    .string()
    .url()
    .default("http://127.0.0.1:8888/callback"),
});

const serverEnvSchema = baseSpotifySchema.extend({
  SPOTIFY_REFRESH_TOKEN: z.string().min(1),
});

const authEnvSchema = baseSpotifySchema;

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type AuthEnv = z.infer<typeof authEnvSchema>;

export function parseServerEnv(): ServerEnv {
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Missing or invalid environment variables:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return Object.freeze(result.data);
}

export function parseAuthEnv(): AuthEnv {
  const result = authEnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET first.");
    process.exit(1);
  }
  return Object.freeze(result.data);
}
