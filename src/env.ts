import { z } from "zod";

const baseSpotifySchema = z.object({
  SPOTIFY_CLIENT_ID: z.string().min(1),
  SPOTIFY_CLIENT_SECRET: z.string().min(1),
  SPOTIFY_REDIRECT_URI: z
    .string()
    .url()
    .default("http://127.0.0.1:8888/callback")
    .refine((url) => {
      const { hostname } = new URL(url);
      return hostname === "127.0.0.1" || hostname === "localhost";
    }, "Redirect URI must point to localhost"),
});

const serverEnvSchema = baseSpotifySchema.extend({
  MCP_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  MCP_TRANSPORT: z
    .enum([
      "stdio",
      "http",
    ])
    .default("stdio"),
  SPOTIFY_REFRESH_TOKEN: z.string().min(1),
  MCP_HTTP_SECRET: z.string().min(1).optional(),
});

const authEnvSchema = baseSpotifySchema;

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type AuthEnv = z.infer<typeof authEnvSchema>;

export function parseServerEnv(): ServerEnv {
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    const messages = result.error.issues.map(
      (issue) => `  ${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(
      `Missing or invalid environment variables:\n${messages.join("\n")}`,
    );
  }
  return Object.freeze(result.data);
}

export function parseAuthEnv(): AuthEnv {
  const result = authEnvSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET first.");
  }
  return Object.freeze(result.data);
}
