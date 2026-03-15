import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// We need to re-import the module fresh for each test group, so we use
// dynamic imports. But first, set up process.exit interception.

const originalExit = process.exit;
const exitMock = mock((code?: number) => {
  throw new Error(`process.exit(${code})`);
});
const mockExit = exitMock as unknown as typeof process.exit;

// Snapshot of the original env so we can restore it
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = {
    ...process.env,
  };
  process.exit = mockExit;
  exitMock.mockClear();
});

afterEach(() => {
  process.env = originalEnv;
  process.exit = originalExit;
});

// We can't cache the module -- Bun caches imports, so we import the functions
// once and control behaviour via process.env mutations before each call.
// The env module reads process.env at call time, so this works.
import { parseAuthEnv, parseServerEnv } from "./env.js";

describe("parseServerEnv", () => {
  test("returns a frozen object with valid env vars", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
    process.env.SPOTIFY_REFRESH_TOKEN = "test-refresh-token";
    process.env.SPOTIFY_REDIRECT_URI = "http://localhost:3000/callback";

    const result = parseServerEnv();

    expect(result.SPOTIFY_CLIENT_ID).toBe("test-client-id");
    expect(result.SPOTIFY_CLIENT_SECRET).toBe("test-client-secret");
    expect(result.SPOTIFY_REFRESH_TOKEN).toBe("test-refresh-token");
    expect(result.SPOTIFY_REDIRECT_URI).toBe("http://localhost:3000/callback");
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("uses default redirect URI when not provided", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
    process.env.SPOTIFY_REFRESH_TOKEN = "test-refresh-token";
    delete process.env.SPOTIFY_REDIRECT_URI;

    const result = parseServerEnv();

    expect(result.SPOTIFY_REDIRECT_URI).toBe("http://127.0.0.1:8888/callback");
  });

  test("calls process.exit(1) when SPOTIFY_CLIENT_ID is missing", () => {
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;
    delete process.env.SPOTIFY_REFRESH_TOKEN;
    delete process.env.SPOTIFY_REDIRECT_URI;

    expect(() => parseServerEnv()).toThrow("process.exit(1)");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test("calls process.exit(1) when SPOTIFY_REFRESH_TOKEN is missing", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
    delete process.env.SPOTIFY_REFRESH_TOKEN;

    expect(() => parseServerEnv()).toThrow("process.exit(1)");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test("calls process.exit(1) when SPOTIFY_REDIRECT_URI is not a valid URL", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
    process.env.SPOTIFY_REFRESH_TOKEN = "test-refresh-token";
    process.env.SPOTIFY_REDIRECT_URI = "not-a-url";

    expect(() => parseServerEnv()).toThrow("process.exit(1)");
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});

describe("parseAuthEnv", () => {
  test("returns a frozen object with valid env vars", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
    process.env.SPOTIFY_REDIRECT_URI = "http://localhost:3000/callback";

    const result = parseAuthEnv();

    expect(result.SPOTIFY_CLIENT_ID).toBe("test-client-id");
    expect(result.SPOTIFY_CLIENT_SECRET).toBe("test-client-secret");
    expect(result.SPOTIFY_REDIRECT_URI).toBe("http://localhost:3000/callback");
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("uses default redirect URI when not provided", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
    delete process.env.SPOTIFY_REDIRECT_URI;

    const result = parseAuthEnv();

    expect(result.SPOTIFY_REDIRECT_URI).toBe("http://127.0.0.1:8888/callback");
  });

  test("does not require SPOTIFY_REFRESH_TOKEN", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
    delete process.env.SPOTIFY_REFRESH_TOKEN;

    const result = parseAuthEnv();

    expect(result.SPOTIFY_CLIENT_ID).toBe("test-client-id");
    expect(
      (result as Record<string, unknown>).SPOTIFY_REFRESH_TOKEN,
    ).toBeUndefined();
  });

  test("calls process.exit(1) when SPOTIFY_CLIENT_ID is missing", () => {
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;

    expect(() => parseAuthEnv()).toThrow("process.exit(1)");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test("calls process.exit(1) when SPOTIFY_CLIENT_SECRET is missing", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    delete process.env.SPOTIFY_CLIENT_SECRET;

    expect(() => parseAuthEnv()).toThrow("process.exit(1)");
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
