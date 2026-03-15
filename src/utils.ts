import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function textResult(text: string): CallToolResult {
  return {
    content: [
      {
        text,
        type: "text",
      },
    ],
  };
}

export function extractIdFromUri(uri: string): string {
  const id = uri.split(":")[2];
  if (!id) {
    throw new Error(`Cannot extract ID from URI: ${uri}`);
  }
  return id;
}
