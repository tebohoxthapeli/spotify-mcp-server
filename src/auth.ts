import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { parseAuthEnv } from "./env.js";

const env = parseAuthEnv();
const SCOPES =
  "user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private";
const AUTH_TIMEOUT_MS = 300_000;

const oauthState = randomUUID();
const port = Number(new URL(env.SPOTIFY_REDIRECT_URI).port) || 8888;

const authUrl = new URL("https://accounts.spotify.com/authorize");
authUrl.searchParams.set("client_id", env.SPOTIFY_CLIENT_ID);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("redirect_uri", env.SPOTIFY_REDIRECT_URI);
authUrl.searchParams.set("scope", SCOPES);
authUrl.searchParams.set("state", oauthState);

console.error("\nOpen this URL in your browser:\n");
console.error(authUrl.toString());
console.error("\nWaiting for callback...\n");

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname !== "/callback") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const returnedState = url.searchParams.get("state");

  if (returnedState !== oauthState) {
    res.writeHead(400);
    res.end("Invalid OAuth state — possible CSRF attack.");
    server.close(() => process.exit(1));
    return;
  }

  if (error) {
    res.writeHead(400);
    res.end(`Auth error: ${error}`);
    server.close(() => process.exit(1));
    return;
  }

  if (!code) {
    res.writeHead(400);
    res.end("No code received");
    server.close(() => process.exit(1));
    return;
  }

  try {
    const tokenResponse = await fetch(
      "https://accounts.spotify.com/api/token",
      {
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          redirect_uri: env.SPOTIFY_REDIRECT_URI,
        }),
        headers: {
          Authorization: `Basic ${Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      },
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      throw new Error(`Token exchange failed (${tokenResponse.status})`);
    }

    const tokens = (await tokenResponse.json()) as Record<string, unknown>;

    if (typeof tokens.refresh_token !== "string") {
      throw new Error("Token exchange failed: no refresh token received");
    }

    console.error("Got tokens!");
    console.error(`  Access token expires in: ${tokens.expires_in}s`);

    const envPath = join(process.cwd(), ".env");
    let envContent = "";
    try {
      envContent = readFileSync(envPath, "utf-8");
    } catch {
      // .env doesn't exist yet
    }

    if (envContent.includes("SPOTIFY_REFRESH_TOKEN=")) {
      envContent = envContent.replace(
        /^SPOTIFY_REFRESH_TOKEN=.*/m,
        `SPOTIFY_REFRESH_TOKEN=${tokens.refresh_token}`,
      );
    } else {
      envContent += `\nSPOTIFY_REFRESH_TOKEN=${tokens.refresh_token}\n`;
    }

    writeFileSync(envPath, envContent, {
      mode: 0o600,
    });
    console.error("Refresh token saved to .env");

    res.writeHead(200, {
      "Content-Type": "text/html",
    });
    res.end("<h1>Auth complete! You can close this tab.</h1>");
  } catch (err) {
    console.error("Token exchange failed:", err);
    res.writeHead(500);
    res.end("Token exchange failed");
    server.close(() => process.exit(1));
    return;
  }

  server.close(() => process.exit(0));
});

server.listen(port, "127.0.0.1", () => {
  console.error(`Listening on http://127.0.0.1:${port}`);
});

setTimeout(() => {
  console.error("Auth timed out after 5 minutes.");
  server.close();
  process.exit(1);
}, AUTH_TIMEOUT_MS);
