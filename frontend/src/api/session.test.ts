import { afterEach, describe, expect, it, vi } from "vitest";

import { getToken, readTokenFromHash, TOKEN_STORAGE_KEY } from "./session";

afterEach(() => {
  sessionStorage.clear();
});

describe("readTokenFromHash", () => {
  it("extracts the token, stores it and cleans the hash", () => {
    const result = readTokenFromHash("#token=abc");

    expect(result).toEqual({ token: "abc", hash: "" });
    expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBe("abc");
  });

  it("does not invent a token for an empty hash", () => {
    expect(readTokenFromHash("")).toEqual({ token: null, hash: "" });
    expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("keeps unrelated fragment parameters", () => {
    const result = readTokenFromHash("#token=abc&view=graph");

    expect(result).toEqual({ token: "abc", hash: "#view=graph" });
  });

  it("keeps a hash that has no token", () => {
    expect(readTokenFromHash("#view=graph")).toEqual({
      token: null,
      hash: "#view=graph",
    });
  });

  it("decodes URL-encoded tokens", () => {
    expect(readTokenFromHash("#token=a%20b").token).toBe("a b");
  });
});

describe("getToken", () => {
  it("reads the stored token", () => {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, "stored");
    expect(getToken()).toBe("stored");
  });

  it("returns null when nothing is stored", () => {
    expect(getToken()).toBeNull();
  });

  it("does not read the ROS Studio token key", () => {
    sessionStorage.setItem("ros-studio-token", "old-token");

    expect(getToken()).toBeNull();
  });
});

describe("storage failures", () => {
  it("accepts an explicit storage", () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    } satisfies Storage;

    const result = readTokenFromHash("#token=abc", storage);

    expect(result.token).toBe("abc");
    expect(storage.setItem).toHaveBeenCalledWith(TOKEN_STORAGE_KEY, "abc");
  });
});
