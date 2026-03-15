# Phase 1: Spotify MCP Server — Build Guide

> **Goal:** Replicate every tool from the existing AppleScript-based Spotify connector as a proper MCP server using the Spotify Web API.

---

## What You're Building

An MCP server (`spotify-mcp-server`) that exposes 16 tools matching the existing connector:

| #   | Tool Name                   | Type  | Spotify Web API Endpoint                           |
| --- | --------------------------- | ----- | -------------------------------------------------- |
| 1   | `spotify_get_current_track` | read  | `GET /me/player/currently-playing`                 |
| 2   | `spotify_get_player_state`  | read  | `GET /me/player`                                   |
| 3   | `spotify_get_position`      | read  | `GET /me/player` (extract `progress_ms`)           |
| 4   | `spotify_get_volume`        | read  | `GET /me/player` (extract `device.volume_percent`) |
| 5   | `spotify_get_shuffle`       | read  | `GET /me/player` (extract `shuffle_state`)         |
| 6   | `spotify_get_repeat`        | read  | `GET /me/player` (extract `repeat_state`)          |
| 7   | `spotify_play`              | write | `PUT /me/player/play`                              |
| 8   | `spotify_pause`             | write | `PUT /me/player/pause`                             |
| 9   | `spotify_playpause`         | write | Toggle based on current state                      |
| 10  | `spotify_next_track`        | write | `POST /me/player/next`                             |
| 11  | `spotify_previous_track`    | write | `POST /me/player/previous`                         |
| 12  | `spotify_play_track`        | write | `PUT /me/player/play` (with `uris` body)           |
| 13  | `spotify_set_position`      | write | `PUT /me/player/seek?position_ms=`                 |
| 14  | `spotify_set_volume`        | write | `PUT /me/player/volume?volume_percent=`            |
| 15  | `spotify_set_shuffle`       | write | `PUT /me/player/shuffle?state=`                    |
| 16  | `spotify_set_repeat`        | write | `PUT /me/player/repeat?state=`                     |

---

## Prerequisites

### You Need

- **Spotify Premium** — the Player API requires it (Dev Mode apps also require the app owner to have Premium as of Feb 2026)
- **A Spotify Developer account** — same as your regular Spotify account
- **Node.js 20+** (or Bun, but the MCP SDK examples assume Node — Bun should work fine, just test the stdio transport)
- **Basic OAuth 2.0 understanding** — we're using Authorization Code flow (with client secret, since this runs locally on your machine)

### Important: Feb 2026 API Changes

Spotify made significant changes to their Web API in February 2026. The **Player API endpoints are unaffected** — all 16 tools we need still work exactly as before. The changes mostly hit library, playlist, and catalog endpoints (which we don't use in Phase 1). The one thing to note: Dev Mode apps now require the owner to have active Spotify Premium.

---

## Step 1: Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**
3. Fill in:
   - **App Name:** `Spotify MCP Server` (or whatever you want)
   - **App Description:** Anything
   - **Redirect URI:** `http://127.0.0.1:8888/callback`
   - **APIs:** Select **Web API**
4. Click **Create**
5. Note down your **Client ID** and **Client Secret** (click "View client secret")

### Required Scopes

Your auth flow must request these scopes:

```
user-read-playback-state
user-modify-playback-state
user-read-currently-playing
```

- `user-read-playback-state` — covers get player state, position, volume, shuffle, repeat
- `user-modify-playback-state` — covers play, pause, next, previous, seek, volume, shuffle, repeat
- `user-read-currently-playing` — covers get current track

---

## Step 2: Project Setup

### Directory Structure

```
spotify-mcp-server/
├── package.json
├── tsconfig.json
├── .env                  # Client ID, secret, tokens (gitignored)
├── .env.example          # Template for .env
├── src/
│   ├── index.ts          # MCP server entry point + tool registration
│   ├── auth.ts           # OAuth token management (refresh flow)
│   ├── spotify-client.ts # HTTP client for Spotify Web API
│   ├── tools/
│   │   ├── playback-read.ts   # get_current_track, get_player_state, etc.
│   │   └── playback-write.ts  # play, pause, next, seek, volume, etc.
│   ├── schemas.ts        # Zod schemas for tool inputs
│   └── types.ts          # TypeScript types for Spotify API responses
└── dist/                 # Compiled JS
```

### package.json

```json
{
  "name": "spotify-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch",
    "auth": "node dist/auth.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.9.0"
  }
}
```

> **Note:** Check the actual latest version of `@modelcontextprotocol/sdk` on npm before installing. The SDK is actively developed and the API surface has changed. The version above is indicative — use whatever is latest.

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### .env.example

```bash
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback
SPOTIFY_REFRESH_TOKEN=  # Populated after first auth
```

---

## Step 3: Authentication

This is the most annoying part. You only have to do it once.

### The Flow

1. You run a one-time auth script that opens a browser
2. You log into Spotify and approve the scopes
3. Spotify redirects back to `http://127.0.0.1:8888/callback` with an auth code
4. The script exchanges the code for an **access token** + **refresh token**
5. You save the refresh token in `.env`
6. From then on, the MCP server uses the refresh token to silently get new access tokens whenever they expire (they last 1 hour)

### Auth Script (`src/auth.ts`)

This is a standalone script — not part of the MCP server itself. You run it once to bootstrap your credentials.

```typescript
import { createServer } from "node:http";
import { URL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET ?? "";
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI ?? "http://127.0.0.1:8888/callback";
const SCOPES = "user-read-playback-state user-modify-playback-state user-read-currently-playing";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env first.");
  process.exit(1);
}

// Step 1: Build the auth URL
const authUrl = new URL("https://accounts.spotify.com/authorize");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("scope", SCOPES);

console.log("\n🎵 Open this URL in your browser:\n");
console.log(authUrl.toString());
console.log("\nWaiting for callback...\n");

// Step 2: Start a temporary server to catch the redirect
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname !== "/callback") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400);
    res.end(`Auth error: ${error}`);
    server.close();
    return;
  }

  if (!code) {
    res.writeHead(400);
    res.end("No code received");
    server.close();
    return;
  }

  // Step 3: Exchange code for tokens
  try {
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    if (!tokens.refresh_token) {
      throw new Error(`Token exchange failed: ${JSON.stringify(tokens)}`);
    }

    console.log("✅ Got tokens!");
    console.log(`   Access token expires in: ${tokens.expires_in}s`);
    console.log(`   Refresh token: ${tokens.refresh_token.slice(0, 20)}...`);

    // Step 4: Save refresh token to .env
    const envPath = join(process.cwd(), ".env");
    let envContent = "";
    try {
      envContent = readFileSync(envPath, "utf-8");
    } catch {
      // .env doesn't exist yet
    }

    if (envContent.includes("SPOTIFY_REFRESH_TOKEN=")) {
      envContent = envContent.replace(
        /SPOTIFY_REFRESH_TOKEN=.*/,
        `SPOTIFY_REFRESH_TOKEN=${tokens.refresh_token}`
      );
    } else {
      envContent += `\nSPOTIFY_REFRESH_TOKEN=${tokens.refresh_token}\n`;
    }

    writeFileSync(envPath, envContent);
    console.log("✅ Refresh token saved to .env");

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>Auth complete! You can close this tab.</h1>");
  } catch (err) {
    console.error("Token exchange failed:", err);
    res.writeHead(500);
    res.end("Token exchange failed");
  }

  server.close();
});

server.listen(8888, () => {
  console.log("Listening on http://127.0.0.1:8888");
});
```

### How to Run It

```bash
# Load .env vars (or use dotenv — your call)
source .env
npx tsx src/auth.ts
```

Then open the URL it prints, approve the scopes, and you're done. Your `.env` now has a `SPOTIFY_REFRESH_TOKEN`.

---

## Step 4: Spotify API Client

### Token Refresh Logic (`src/spotify-client.ts`)

The access token expires every hour. The client handles refreshing transparently.

**Key behaviour:**
- On first call, use the refresh token to get a fresh access token
- Cache the access token + expiry time
- Before each API call, check if expired — if so, refresh silently
- All API errors should produce actionable MCP error messages

```typescript
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

interface TokenData {
  accessToken: string;
  expiresAt: number; // Unix timestamp in ms
}

let tokenCache: TokenData | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID ?? "";
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET ?? "";
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN ?? "";

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return tokenCache.accessToken;
}
```

### API Request Helper

```typescript
export async function spotifyRequest(
  endpoint: string,
  method: "GET" | "PUT" | "POST" | "DELETE" = "GET",
  body?: Record<string, unknown>,
  queryParams?: Record<string, string>
): Promise<unknown> {
  const token = await getAccessToken();

  let url = `${SPOTIFY_API_BASE}${endpoint}`;
  if (queryParams) {
    const params = new URLSearchParams(queryParams);
    url += `?${params.toString()}`;
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  // Many player endpoints return 204 No Content on success
  if (response.status === 204) {
    return { success: true };
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Spotify API error: ${response.status} ${response.statusText} — ${errorBody}`
    );
  }

  return response.json();
}
```

---

## Step 5: Tool Implementation

### Read Tools (`src/tools/playback-read.ts`)

Each tool maps to a `server.registerTool()` call. Here's the pattern for read tools:

#### `spotify_get_current_track`

- **Endpoint:** `GET /me/player/currently-playing`
- **Returns:** Track name, artist, album, duration (ms), popularity, Spotify ID, URL
- **No input params**
- **Annotations:** `readOnlyHint: true`, `destructiveHint: false`

#### `spotify_get_player_state`

- **Endpoint:** `GET /me/player`
- **Returns:** `"playing"`, `"paused"`, or `"stopped"`
- **Edge case:** Returns 204 if no active device → return `"stopped"`

#### `spotify_get_position`

- **Endpoint:** `GET /me/player`
- **Returns:** Current position in seconds (from `progress_ms`)
- **Edge case:** No active playback → return 0

#### `spotify_get_volume`

- **Endpoint:** `GET /me/player`
- **Returns:** Volume level 0–100 (from `device.volume_percent`)

#### `spotify_get_shuffle`

- **Endpoint:** `GET /me/player`
- **Returns:** Boolean `shuffle_state`

#### `spotify_get_repeat`

- **Endpoint:** `GET /me/player`
- **Returns:** `"off"`, `"track"`, or `"context"` (from `repeat_state`)

**Optimisation:** `get_player_state`, `get_position`, `get_volume`, `get_shuffle`, and `get_repeat` all hit the same `GET /me/player` endpoint. You could cache the response for a short window, but for Phase 1 just call the endpoint each time — the rate limits are generous (180 requests/minute for most endpoints, though check current limits).

### Write Tools (`src/tools/playback-write.ts`)

#### `spotify_play`

- **Endpoint:** `PUT /me/player/play`
- **No input params** — just resumes current playback
- **Annotations:** `readOnlyHint: false`, `destructiveHint: false`

#### `spotify_pause`

- **Endpoint:** `PUT /me/player/pause`
- **No input params**

#### `spotify_playpause`

- **No direct API endpoint** — this is a composite tool
- Logic: call `GET /me/player` → if `is_playing` is true, call pause; else call play
- **Annotations:** `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`

#### `spotify_next_track`

- **Endpoint:** `POST /me/player/next`

#### `spotify_previous_track`

- **Endpoint:** `POST /me/player/previous`

#### `spotify_play_track`

- **Endpoint:** `PUT /me/player/play`
- **Input:** `uri` (string, required) — format `spotify:track:XXXXX`
- **Input:** `context` (string, optional) — a playlist/album URI
- **Body:** `{ "uris": [uri] }` OR `{ "context_uri": context, "offset": { "uri": uri } }`

#### `spotify_set_position`

- **Endpoint:** `PUT /me/player/seek`
- **Input:** `position` (number, in seconds) — convert to `position_ms` (multiply by 1000)
- **Query param:** `position_ms`

#### `spotify_set_volume`

- **Endpoint:** `PUT /me/player/volume`
- **Input:** `volume` (integer, 0–100)
- **Query param:** `volume_percent`

#### `spotify_set_shuffle`

- **Endpoint:** `PUT /me/player/shuffle`
- **Input:** `enabled` (boolean)
- **Query param:** `state` (string `"true"` or `"false"`)

#### `spotify_set_repeat`

- **Endpoint:** `PUT /me/player/repeat`
- **Input:** `enabled` (boolean) — maps to `"track"` (true) or `"off"` (false)
- **Query param:** `state`
- **Note:** The existing connector uses a boolean, but the Spotify API supports three states: `off`, `track`, `context`. For Phase 1, match the existing boolean interface. You can expand this later.

---

## Step 6: MCP Server Entry Point

### `src/index.ts` — High-Level Structure

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerReadTools } from "./tools/playback-read.js";
import { registerWriteTools } from "./tools/playback-write.js";

const server = new McpServer({
  name: "spotify-mcp-server",
  version: "1.0.0",
});

// Register all tools
registerReadTools(server);
registerWriteTools(server);

// Use stdio transport (for local Claude Code / Claude Desktop)
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Spotify MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
```

### Tool Registration Example

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { spotifyRequest } from "../spotify-client.js";

export function registerReadTools(server: McpServer): void {
  server.registerTool(
    "spotify_get_current_track",
    {
      title: "Get Current Track",
      description: "Get information about the currently playing track on Spotify. Returns track name, artist, album, duration, and Spotify URI.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const data = await spotifyRequest("/me/player/currently-playing") as Record<string, unknown>;

        if (!data || !("item" in data)) {
          return {
            content: [{ type: "text", text: "Nothing is currently playing." }],
          };
        }

        const item = data.item as Record<string, unknown>;
        const artists = (item.artists as Array<{ name: string }>)
          .map((a) => a.name)
          .join(", ");

        const result = {
          name: item.name,
          artist: artists,
          album: (item.album as Record<string, unknown>).name,
          duration_ms: item.duration_ms,
          id: item.uri,
          url: item.uri,
        };

        return {
          content: [{
            type: "text",
            text: `Name: ${result.name}\nArtist: ${result.artist}\nAlbum: ${result.album}\nDuration: ${result.duration_ms} ms\nID: ${result.id}\nURL: ${result.url}`,
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Error getting current track: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );

  // ... register other read tools following the same pattern
}
```

---

## Step 7: Connecting to Claude

### For Claude Code

Add to your `claude_desktop_config.json` (or the Claude Code MCP config):

```json
{
  "mcpServers": {
    "spotify": {
      "command": "node",
      "args": ["/absolute/path/to/spotify-mcp-server/dist/index.js"],
      "env": {
        "SPOTIFY_CLIENT_ID": "your_client_id",
        "SPOTIFY_CLIENT_SECRET": "your_client_secret",
        "SPOTIFY_REFRESH_TOKEN": "your_refresh_token"
      }
    }
  }
}
```

### For Claude Desktop

Same config, located at:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

### Testing with MCP Inspector

Before connecting to Claude, validate your server works:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

This gives you a web UI to call each tool individually and verify responses.

---

## Step 8: Error Handling Checklist

| Scenario              | Expected Behaviour                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------- |
| No active device      | Return clear message: "No active Spotify device found. Open Spotify on a device first."     |
| Token expired         | Auto-refresh transparently — the user should never see this                                 |
| Refresh token revoked | Return: "Spotify auth expired. Run the auth script again."                                  |
| Premium required      | Return: "This feature requires Spotify Premium."                                            |
| Rate limited (429)    | Return: "Rate limited by Spotify. Try again in a few seconds." (Check `Retry-After` header) |
| Network error         | Return: "Could not reach Spotify API. Check your internet connection."                      |

---

## Build Order (Suggested)

This is the order I'd recommend implementing to stay unblocked:

1. **`spotify-client.ts`** — token refresh + API helper. Test with a raw `GET /me/player` call.
2. **`auth.ts`** — one-time auth script. Run it, get your refresh token.
3. **`spotify_get_current_track`** — your first tool. Proves the full chain works.
4. **`spotify_get_player_state`** — second tool, same endpoint family.
5. **Remaining read tools** — all use `GET /me/player`, straightforward.
6. **`spotify_play` + `spotify_pause`** — simplest write tools.
7. **`spotify_playpause`** — composite, depends on read + write working.
8. **Remaining write tools** — `next`, `previous`, `seek`, `volume`, `shuffle`, `repeat`.
9. **`spotify_play_track`** — slightly more complex input schema with optional context.
10. **MCP Inspector testing** — validate all 16 tools.
11. **Connect to Claude** — configure and test end-to-end.

---

## Key Gotchas

### The `popularity` Field Is Gone

As of Feb 2026, Spotify removed the `popularity` field from track responses in Dev Mode. The existing AppleScript connector returns it because it reads from the desktop app directly. Your Web API version won't have it — just omit it or return `null`.

### Position Is in Milliseconds

The Spotify API uses milliseconds everywhere. The existing connector's `set_position` takes **seconds**. Match that interface (accept seconds, multiply by 1000 before sending to the API).

### Volume Doesn't Work on All Devices

Some Spotify Connect devices (especially smart speakers) don't support volume control via the API. Handle the 403 gracefully.

### `playpause` Is Not Atomic

There's a race condition: you read the state, then write. If the user toggles in between, you'll double-toggle. For Phase 1, this is fine. Don't over-engineer it.

### stdio Transport Logging

**Never log to stdout** — that's the MCP transport channel. Use `console.error()` for all logging.

---

## Quick Reference: Spotify Web API Player Endpoints

| Method | Endpoint                       | Description                                                           |
| ------ | ------------------------------ | --------------------------------------------------------------------- |
| `GET`  | `/me/player`                   | Get playback state (device, track, shuffle, repeat, volume, progress) |
| `GET`  | `/me/player/currently-playing` | Get the currently playing track                                       |
| `PUT`  | `/me/player/play`              | Start/resume playback (optionally with specific URIs)                 |
| `PUT`  | `/me/player/pause`             | Pause playback                                                        |
| `POST` | `/me/player/next`              | Skip to next track                                                    |
| `POST` | `/me/player/previous`          | Skip to previous track                                                |
| `PUT`  | `/me/player/seek`              | Seek to position (`?position_ms=`)                                    |
| `PUT`  | `/me/player/volume`            | Set volume (`?volume_percent=`)                                       |
| `PUT`  | `/me/player/shuffle`           | Set shuffle (`?state=true/false`)                                     |
| `PUT`  | `/me/player/repeat`            | Set repeat mode (`?state=off/track/context`)                          |

**Base URL:** `https://api.spotify.com/v1`
**Auth header:** `Authorization: Bearer {access_token}`
**Rate limits:** ~180 requests/minute (varies by endpoint)

---

## Links

- [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
- [Spotify Web API Reference](https://developer.spotify.com/documentation/web-api/reference)
- [Authorization Code Flow](https://developer.spotify.com/documentation/web-api/tutorials/code-flow)
- [Player API Scopes](https://developer.spotify.com/documentation/web-api/concepts/scopes)
- [Feb 2026 Migration Guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Inspector](https://www.npmjs.com/package/@modelcontextprotocol/inspector)