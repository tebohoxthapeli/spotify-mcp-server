import { describe, expect, test } from "bun:test";
import {
  extractIdFromUri,
  formatDuration,
  normaliseSearchQuery,
  textResult,
} from "./utils.js";

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

describe("normaliseSearchQuery", () => {
  test("quotes multi-word artist value", () => {
    expect(normaliseSearchQuery("artist:Connor Rhys")).toBe(
      'artist:"Connor Rhys"',
    );
  });

  test("leaves single-word value unchanged", () => {
    expect(normaliseSearchQuery("artist:Beyonce")).toBe("artist:Beyonce");
  });

  test("leaves already-quoted value unchanged", () => {
    expect(normaliseSearchQuery('artist:"Connor Rhys"')).toBe(
      'artist:"Connor Rhys"',
    );
  });

  test("quotes multiple field filters with multi-word values", () => {
    expect(
      normaliseSearchQuery("artist:Connor Rhys album:My Album"),
    ).toBe('artist:"Connor Rhys" album:"My Album"');
  });

  test("leaves single-word values unquoted across multiple fields", () => {
    expect(normaliseSearchQuery("artist:Connor Rhys album:Solange")).toBe(
      'artist:"Connor Rhys" album:Solange',
    );
  });

  test("handles mix of single-word and multi-word values", () => {
    expect(normaliseSearchQuery("artist:Beyonce track:hello world")).toBe(
      'artist:Beyonce track:"hello world"',
    );
  });

  test("leaves plain text without field filters unchanged", () => {
    expect(normaliseSearchQuery("hello world")).toBe("hello world");
  });

  test("returns empty string for empty input", () => {
    expect(normaliseSearchQuery("")).toBe("");
  });
});

describe("formatDuration", () => {
  test("formats 0ms as 0:00", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  test("formats 30000ms (30s) as 0:30", () => {
    expect(formatDuration(30_000)).toBe("0:30");
  });

  test("formats 60000ms (1 min) as 1:00", () => {
    expect(formatDuration(60_000)).toBe("1:00");
  });

  test("formats 245000ms as 4:05", () => {
    expect(formatDuration(245_000)).toBe("4:05");
  });

  test("formats 3599999ms correctly", () => {
    // Math.round(3599999 / 1000) = 3600s = 60min 0s
    expect(formatDuration(3_599_999)).toBe("60:00");
  });

  test("rounds 500ms up to 0:01", () => {
    expect(formatDuration(500)).toBe("0:01");
  });
});
