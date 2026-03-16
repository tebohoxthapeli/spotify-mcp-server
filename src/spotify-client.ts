import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ServerEnv } from "./env.js";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const TOKEN_BUFFER_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 2_000;
const MAX_RETRY_WAIT_MS = 10_000;
const MAX_CACHE_SIZE = 100;

type TokenCache = Readonly<{
  accessToken: string;
  expiresAt: number;
}>;

type ResponseCache = Readonly<{
  data: unknown;
  expiresAt: number;
}>;

let tokenCache: TokenCache | null = null;
let refreshPromise: Promise<string> | null = null;
const responseCache = new Map<string, ResponseCache>();

async function getAccessToken(env: ServerEnv): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - TOKEN_BUFFER_MS) {
    return tokenCache.accessToken;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = doRefresh(env).finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

async function doRefresh(env: ServerEnv): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: env.SPOTIFY_REFRESH_TOKEN,
    }),
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 400 && body.includes("invalid_grant")) {
      throw new Error("Spotify auth expired. Re-run the auth script.");
    }
    console.error(
      `Token refresh failed (${response.status} ${response.statusText})`,
    );
    throw new Error(
      `Token refresh failed (${response.status} ${response.statusText})`,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;

  if (
    typeof data.access_token !== "string"
    || typeof data.expires_in !== "number"
  ) {
    throw new Error("Invalid token response from Spotify");
  }

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return tokenCache.accessToken;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
): Promise<Response> {
  let response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (response.status === 429 || response.status >= 500) {
    const retryAfterHeader = response.headers.get("Retry-After");
    const waitMs =
      response.status === 429 && retryAfterHeader
        ? Math.min(Number(retryAfterHeader) * 1000, MAX_RETRY_WAIT_MS)
        : 1_000;

    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  }

  return response;
}

async function parseResponseBody<T>(
  response: Response,
  endpoint: string,
  method: string,
): Promise<T | null> {
  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(mapSpotifyError(response.status, errorBody));
  }

  const text = (await response.text()).trim();
  if (!text) {
    return null;
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Mutating endpoints may return non-JSON success bodies
    if (method !== "GET") {
      return null;
    }
    console.error(`Failed to parse JSON from ${endpoint}:`, text.slice(0, 200));
    throw new Error(`Invalid JSON response from Spotify (${endpoint})`);
  }

  if (json.error) {
    const errorMsg =
      typeof json.error === "object" && json.error !== null
        ? (((json.error as Record<string, unknown>).message as string)
          ?? "Unknown Spotify error")
        : "Unknown Spotify error";
    throw new Error(errorMsg);
  }

  return json as T;
}

export async function spotifyRequest<T>(
  env: ServerEnv,
  endpoint: string,
  method: "GET" | "PUT" | "POST" | "DELETE" = "GET",
  body?: Record<string, unknown>,
  queryParams?: Record<string, string>,
): Promise<T | null> {
  const token = await getAccessToken(env);

  let url = `${SPOTIFY_API_BASE}${endpoint}`;
  if (queryParams) {
    url += `?${new URLSearchParams(queryParams).toString()}`;
  }

  const cacheKey = queryParams
    ? `${endpoint}?${new URLSearchParams(queryParams).toString()}`
    : endpoint;

  if (method !== "GET") {
    responseCache.clear();
  }

  if (method === "GET") {
    const cached = responseCache.get(cacheKey);
    if (cached) {
      if (Date.now() < cached.expiresAt) {
        return cached.data as T;
      }
      responseCache.delete(cacheKey);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetchWithRetry(url, {
    headers,
    method,
    ...(body
      ? {
          body: JSON.stringify(body),
        }
      : {}),
  });

  const data = await parseResponseBody<T>(response, endpoint, method);

  if (method === "GET" && data !== null) {
    if (responseCache.size >= MAX_CACHE_SIZE) {
      const oldest = responseCache.keys().next().value;
      if (oldest !== undefined) {
        responseCache.delete(oldest);
      }
    }
    responseCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  return data;
}

function extractErrorMessage(body: string): string | null {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    if (typeof json.error === "object" && json.error !== null) {
      const msg = (json.error as Record<string, unknown>).message;
      if (typeof msg === "string") return msg;
    }
  } catch {
    // body isn't JSON
  }
  return null;
}

function mapSpotifyError(status: number, body: string): string {
  console.error(`Spotify API error (${status})`);
  const detail = extractErrorMessage(body);

  switch (status) {
    case 401:
      return "Spotify auth expired. Re-run the auth script.";
    case 403:
      if (body.includes("PREMIUM_REQUIRED")) {
        return "This feature requires Spotify Premium.";
      }
      if (body.includes("volume")) {
        return "Volume control is not available on this device.";
      }
      return detail ?? "Spotify rejected the request (403).";
    case 404:
      if (body.includes("NO_ACTIVE_DEVICE") || body.includes("not found")) {
        return "No active Spotify device found. Open Spotify on a device first.";
      }
      return detail ?? "Spotify resource not found.";
    case 429:
      return "Rate limited by Spotify. Try again in a few seconds.";
    default:
      return detail ?? `Spotify API error (${status}).`;
  }
}

type ToolHandler<TArgs> = (args: TArgs) => Promise<CallToolResult>;

export function withErrorHandling<TArgs>(
  handler: ToolHandler<TArgs>,
): ToolHandler<TArgs> {
  return async (args: TArgs): Promise<CallToolResult> => {
    try {
      return await handler(args);
    } catch (error) {
      if (error instanceof Error) {
        console.error("[Spotify MCP]", error);
      }
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("fetch failed") || message.includes("ENOTFOUND")) {
        return {
          content: [
            {
              text: "Could not reach Spotify API. Check your internet connection.",
              type: "text",
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            text: message,
            type: "text",
          },
        ],
        isError: true,
      };
    }
  };
}
