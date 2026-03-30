import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { ServerEnv } from "./env.js";
import { createServer } from "./server.js";

const BASE_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers": "Content-Type, mcp-session-id, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

function corsResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(BASE_CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function isAuthorised(req: Request, secret: string | undefined): boolean {
  if (!secret) return true;
  const authHeader = req.headers.get("Authorization");
  return authHeader === `Bearer ${secret}`;
}

export function startHttp(env: ServerEnv): void {
  const port = env.MCP_HTTP_PORT;

  Bun.serve({
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);

      if (url.pathname === "/health") {
        return Response.json({
          status: "ok",
        });
      }

      if (url.pathname !== "/mcp") {
        return new Response("Not Found", {
          status: 404,
        });
      }

      if (req.method === "OPTIONS") {
        return new Response(null, {
          headers: BASE_CORS_HEADERS,
          status: 204,
        });
      }

      if (!isAuthorised(req, env.MCP_HTTP_SECRET)) {
        return corsResponse(
          new Response("Unauthorized", {
            status: 401,
          }),
        );
      }

      if (req.method === "GET" || req.method === "DELETE") {
        return corsResponse(
          new Response("Method Not Allowed (stateless mode)", {
            status: 405,
          }),
        );
      }

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      const server = createServer(env);
      try {
        await server.connect(transport);
        const response = await transport.handleRequest(req);
        return corsResponse(response);
      } finally {
        await server.close();
      }
    },
    hostname: "127.0.0.1",
    port,
  });

  console.error(`Spotify MCP Server running on http://127.0.0.1:${port}/mcp`);
}
