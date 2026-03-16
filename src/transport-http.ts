import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { ServerEnv } from "./env.js";
import { createServer } from "./server.js";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers": "Content-Type, mcp-session-id",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

function corsResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
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
          headers: CORS_HEADERS,
          status: 204,
        });
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
      await server.connect(transport);

      const response = await transport.handleRequest(req);
      const result = corsResponse(response);

      await server.close();

      return result;
    },
    port,
  });

  console.error(`Spotify MCP Server running on http://localhost:${port}/mcp`);
}
