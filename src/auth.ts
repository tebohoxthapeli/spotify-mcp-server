import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseAuthEnv } from "./env.js";

const env = parseAuthEnv();
const SCOPES =
	"user-read-playback-state user-modify-playback-state user-read-currently-playing";
const AUTH_TIMEOUT_MS = 300_000;

const oauthState = randomUUID();
const port = Number(new URL(env.SPOTIFY_REDIRECT_URI).port) || 8888;

const authUrl = new URL("https://accounts.spotify.com/authorize");
authUrl.searchParams.set("client_id", env.SPOTIFY_CLIENT_ID);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("redirect_uri", env.SPOTIFY_REDIRECT_URI);
authUrl.searchParams.set("scope", SCOPES);
authUrl.searchParams.set("state", oauthState);

console.log("\nOpen this URL in your browser:\n");
console.log(authUrl.toString());
console.log("\nWaiting for callback...\n");

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
		server.close();
		return;
	}

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

	try {
		const tokenResponse = await fetch(
			"https://accounts.spotify.com/api/token",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Authorization: `Basic ${Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
				},
				body: new URLSearchParams({
					grant_type: "authorization_code",
					code,
					redirect_uri: env.SPOTIFY_REDIRECT_URI,
				}),
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

		console.log("Got tokens!");
		console.log(`  Access token expires in: ${tokens.expires_in}s`);

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

		writeFileSync(envPath, envContent);
		console.log("Refresh token saved to .env");

		res.writeHead(200, { "Content-Type": "text/html" });
		res.end("<h1>Auth complete! You can close this tab.</h1>");
	} catch (err) {
		console.error("Token exchange failed:", err);
		res.writeHead(500);
		res.end("Token exchange failed");
	}

	server.close();
});

server.listen(port, "127.0.0.1", () => {
	console.log(`Listening on http://127.0.0.1:${port}`);
});

setTimeout(() => {
	console.error("Auth timed out after 5 minutes.");
	server.close();
	process.exit(1);
}, AUTH_TIMEOUT_MS);
