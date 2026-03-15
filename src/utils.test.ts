import { describe, expect, test } from "bun:test";
import { extractIdFromUri, textResult } from "./utils.js";

describe("extractIdFromUri", () => {
  test("extracts ID from a track URI", () => {
    expect(extractIdFromUri("spotify:track:abc123")).toBe("abc123");
  });

  test("extracts ID from a playlist URI", () => {
    expect(extractIdFromUri("spotify:playlist:xyz789")).toBe("xyz789");
  });

  test("extracts ID from an album URI", () => {
    expect(extractIdFromUri("spotify:album:def456")).toBe("def456");
  });

  test("throws on invalid URI with no colons", () => {
    expect(() => extractIdFromUri("nocolons")).toThrow(
      "Cannot extract ID from URI: nocolons",
    );
  });

  test("throws on invalid URI with only one colon", () => {
    expect(() => extractIdFromUri("spotify:track")).toThrow(
      "Cannot extract ID from URI: spotify:track",
    );
  });

  test("throws on empty string", () => {
    expect(() => extractIdFromUri("")).toThrow("Cannot extract ID from URI: ");
  });
});

describe("textResult", () => {
  test("returns a CallToolResult with correct shape", () => {
    const result = textResult("hello");
    expect(result).toEqual({
      content: [
        {
          text: "hello",
          type: "text",
        },
      ],
    });
  });

  test("text content matches the input string", () => {
    const result = textResult("some message");
    const item = result.content[0] as {
      type: "text";
      text: string;
    };
    expect(item.text).toBe("some message");
  });

  test("content type is 'text'", () => {
    const result = textResult("anything");
    const item = result.content[0] as {
      type: "text";
      text: string;
    };
    expect(item.type).toBe("text");
  });

  test("content array has exactly one element", () => {
    const result = textResult("test");
    expect(result.content).toHaveLength(1);
  });

  test("handles empty string input", () => {
    const result = textResult("");
    const item = result.content[0] as {
      type: "text";
      text: string;
    };
    expect(item.text).toBe("");
  });
});
