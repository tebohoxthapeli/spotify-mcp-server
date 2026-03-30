import { parseServerEnv } from "./env.js";
import { createServer } from "./server.js";
import { startHttp } from "./transport-http.js";
import { startStdio } from "./transport-stdio.js";

try {
  const env = parseServerEnv();

  if (env.MCP_TRANSPORT === "http") {
    startHttp(env);
  } else {
    startStdio(createServer(env)).catch((error) => {
      console.error(
        "Fatal:",
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    });
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
