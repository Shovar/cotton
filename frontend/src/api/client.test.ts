import { afterEach, describe, expect, it, vi } from "vitest";

import { apiExists, apiGet, apiSend, ApiError } from "./client";
import { TOKEN_STORAGE_KEY } from "./session";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("apiGet", () => {
  it("sends the bearer token and returns the parsed body", async () => {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, "secret");
    const fetchMock = stubFetch(jsonResponse({ distro: "jazzy" }));

    const result = await apiGet<{ distro: string }>("/api/env");

    expect(result).toEqual({ distro: "jazzy" });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/env");
    expect(init.method).toBe("GET");
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer secret");
  });

  it("omits the Authorization header when there is no token", async () => {
    const fetchMock = stubFetch(jsonResponse({ status: "ok" }));

    await apiGet("/api/health");

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).has("Authorization")).toBe(false);
  });

  it("returns undefined for an empty body", async () => {
    stubFetch(new Response(null, { status: 200 }));

    await expect(apiGet("/api/empty")).resolves.toBeUndefined();
  });
});

describe("apiSend", () => {
  it("serializes the body and sets the content type", async () => {
    const fetchMock = stubFetch(jsonResponse({ id: "p1" }, 201));

    const result = await apiSend<{ id: string }>("POST", "/api/processes", {
      command: "sleep",
    });

    expect(result).toEqual({ id: "p1" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ command: "sleep" }));
  });

  it("resolves undefined for 204 responses", async () => {
    stubFetch(new Response(null, { status: 204 }));

    await expect(apiSend("DELETE", "/api/processes/p1")).resolves.toBeUndefined();
  });
});

describe("apiExists", () => {
  it("reports a missing asset and survives a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(apiExists("/lichtblick/index.html")).resolves.toBe(false);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    await expect(apiExists("/lichtblick/index.html")).resolves.toBe(false);
  });

  it("uses HEAD and reports a present asset", async () => {
    const fetchMock = stubFetch(new Response(null, { status: 200 }));

    await expect(apiExists("/lichtblick/index.html")).resolves.toBe(true);

    expect(fetchMock.mock.calls[0][1]).toEqual({ method: "HEAD" });
  });
});

describe("ApiError", () => {
  it("exposes the error envelope", async () => {
    stubFetch(
      jsonResponse({ code: "process_not_found", message: "Unknown process" }, 404),
    );

    const error = await apiSend("DELETE", "/api/processes/nope").catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "process_not_found",
      message: "Unknown process",
      status: 404,
    });
  });

  it("falls back to the HTTP status for non-JSON errors", async () => {
    stubFetch(new Response("boom", { status: 500, statusText: "Server Error" }));

    const error = await apiGet("/api/boom").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "internal_error",
      message: "Server Error",
      status: 500,
    });
  });
});
