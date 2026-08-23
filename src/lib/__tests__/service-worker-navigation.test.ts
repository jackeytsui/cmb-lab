import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

type FetchEventLike = {
  request: {
    url: string;
    headers: Headers;
    destination: string;
    mode: string;
  };
  respondWith: (response: Promise<Response> | Response) => void;
};

function loadFetchHandler(fetchMock: ReturnType<typeof vi.fn>) {
  const listeners = new Map<string, (event: FetchEventLike) => void>();
  const selfMock = {
    location: { origin: "https://cmb-lab.thecmblueprint.com" },
    clients: { claim: vi.fn() },
    skipWaiting: vi.fn(),
    addEventListener: (
      type: string,
      listener: (event: FetchEventLike) => void,
    ) => listeners.set(type, listener),
  };
  const cacheMock = {
    addAll: vi.fn(),
    put: vi.fn(),
  };
  const cachesMock = {
    open: vi.fn().mockResolvedValue(cacheMock),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
    match: vi.fn().mockResolvedValue(undefined),
  };

  const source = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
  const execute = new Function(
    "self",
    "caches",
    "fetch",
    "URL",
    "Response",
    source,
  );
  execute(selfMock, cachesMock, fetchMock, URL, Response);

  const handler = listeners.get("fetch");
  if (!handler) throw new Error("Service worker did not register a fetch handler");
  return { handler, cachesMock };
}

function navigationRequest(path: string) {
  return {
    url: `https://cmb-lab.thecmblueprint.com${path}`,
    headers: new Headers(),
    destination: "document",
    mode: "navigate",
  };
}

describe("service worker navigation handling", () => {
  it("returns the live network response without caching authenticated HTML", async () => {
    const networkResponse = new Response("live", { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(networkResponse);
    const { handler, cachesMock } = loadFetchHandler(fetchMock);
    let responsePromise: Promise<Response> | undefined;

    handler({
      request: navigationRequest("/admin/courses"),
      respondWith: (response) => {
        responsePromise = Promise.resolve(response);
      },
    });

    await expect(responsePromise).resolves.toBe(networkResponse);
    expect(cachesMock.open).not.toHaveBeenCalled();
  });

  it("returns a real 503 page instead of resolving respondWith to undefined", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const { handler } = loadFetchHandler(fetchMock);
    let responsePromise: Promise<Response> | undefined;

    handler({
      request: navigationRequest("/admin/users"),
      respondWith: (response) => {
        responsePromise = Promise.resolve(response);
      },
    });

    const response = await responsePromise;
    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(503);
    await expect(response?.text()).resolves.toContain(
      "CMB Lab is temporarily unreachable",
    );
  });
});
