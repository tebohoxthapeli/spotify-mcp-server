import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ServerEnv } from "./env.js";
import type { SpotifyTokenResponse } from "./types.js";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const TOKEN_BUFFER_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 2_000;
const MAX_RETRY_WAIT_MS = 10_000;

interface TokenCache {
	readonly accessToken: string;
	readonly expiresAt: number;
}

interface ResponseCache {
	readonly data: unknown;
	readonly expiresAt: number;
}

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
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Authorization: `Basic ${Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
		},
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: env.SPOTIFY_REFRESH_TOKEN,
		}),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});

	if (!response.ok) {
		const body = await response.text();
		if (response.status === 400 && body.includes("invalid_grant")) {
			throw new Error(
				"Spotify auth expired. Re-run the auth script (`bun run auth`).",
			);
		}
		console.error("Token refresh failed:", body);
		throw new Error(
			`Token refresh failed (${response.status} ${response.statusText})`,
		);
	}

	const data = (await response.json()) as Record<string, unknown>;

	if (
		typeof data.access_token !== "string" ||
		typeof data.expires_in !== "number"
	) {
		throw new Error("Invalid token response from Spotify");
	}

	tokenCache = {
		accessToken: data.access_token,
		expiresAt: Date.now() + data.expires_in * 1000,
	};

	return tokenCache.accessToken;
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

	// Invalidate cache on mutating requests
	if (method !== "GET") {
		responseCache.clear();
	}

	// Check cache for GET requests
	if (method === "GET") {
		const cached = responseCache.get(endpoint);
		if (cached && Date.now() < cached.expiresAt) {
			return cached.data as T;
		}
	}

	const doFetch = async (): Promise<Response> =>
		fetch(url, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				...(body ? { "Content-Type": "application/json" } : {}),
			},
			...(body ? { body: JSON.stringify(body) } : {}),
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});

	let response = await doFetch();

	// Retry once on 429 or 5xx
	if (response.status === 429 || response.status >= 500) {
		const retryAfterHeader = response.headers.get("Retry-After");
		const waitMs =
			response.status === 429 && retryAfterHeader
				? Math.min(Number(retryAfterHeader) * 1000, MAX_RETRY_WAIT_MS)
				: 1_000;

		await new Promise((resolve) => setTimeout(resolve, waitMs));
		response = await doFetch();
	}

	if (response.status === 204) {
		return null;
	}

	if (!response.ok) {
		const errorBody = await response.text();
		const msg = mapSpotifyError(response.status, errorBody);
		throw new Error(msg);
	}

	const json = (await response.json()) as Record<string, unknown>;

	if (json.error) {
		const errorMsg =
			typeof json.error === "object" && json.error !== null
				? (((json.error as Record<string, unknown>).message as string) ??
					"Unknown Spotify error")
				: "Unknown Spotify error";
		throw new Error(errorMsg);
	}

	// Cache GET responses
	if (method === "GET") {
		responseCache.set(endpoint, {
			data: json,
			expiresAt: Date.now() + CACHE_TTL_MS,
		});
	}

	return json as T;
}

function mapSpotifyError(status: number, body: string): string {
	console.error(`Spotify API error ${status}:`, body);

	switch (status) {
		case 401:
			return "Spotify auth expired. Re-run the auth script (`bun run auth`).";
		case 403:
			if (body.includes("PREMIUM_REQUIRED")) {
				return "This feature requires Spotify Premium.";
			}
			if (body.includes("volume")) {
				return "Volume control is not available on this device.";
			}
			return "Spotify rejected the request (403).";
		case 404:
			if (body.includes("NO_ACTIVE_DEVICE") || body.includes("not found")) {
				return "No active Spotify device found. Open Spotify on a device first.";
			}
			return "Spotify resource not found.";
		case 429:
			return "Rate limited by Spotify. Try again in a few seconds.";
		default:
			return `Spotify API error (${status}).`;
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
			const message = error instanceof Error ? error.message : String(error);

			if (message.includes("fetch failed") || message.includes("ENOTFOUND")) {
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: "Could not reach Spotify API. Check your internet connection.",
						},
					],
				};
			}

			return {
				isError: true,
				content: [{ type: "text", text: message }],
			};
		}
	};
}
