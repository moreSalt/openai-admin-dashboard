import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hasAdminKey = vi.fn(() => true);

vi.mock("@/lib/openai", () => ({
  hasAdminKey: () => hasAdminKey(),
}));

import { GET } from "@/app/api/usage/route";
import { NextRequest } from "next/server";

function req(query = "") {
  return new NextRequest(new URL(`http://localhost/api/usage${query}`));
}

const fetchMock = vi.fn();

beforeEach(() => {
  hasAdminKey.mockReturnValue(true);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function errResponse(status: number, body: unknown) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("GET /api/usage", () => {
  it("503 when admin key not set", async () => {
    hasAdminKey.mockReturnValue(false);
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "OPENAI_ADMIN_KEY not set" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400 on unknown type", async () => {
    const res = await GET(req("?type=zzz"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unknown type: zzz" });
  });

  it("defaults type=completions and start_time to ~7d ago", async () => {
    fetchMock.mockResolvedValue(okResponse({ data: [] }));
    const before = Math.floor(Date.now() / 1000) - 7 * 86400;
    await GET(req());
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/v1/organization/usage/completions");
    const start = Number(url.searchParams.get("start_time"));
    expect(Math.abs(start - before)).toBeLessThan(5);
  });

  it("forwards start_time, end_time, bucket_width, batch, limit, page", async () => {
    fetchMock.mockResolvedValue(okResponse({}));
    await GET(
      req(
        "?type=costs&start_time=100&end_time=200&bucket_width=1d&batch=true&limit=5&page=cursor",
      ),
    );
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/v1/organization/costs");
    expect(url.searchParams.get("start_time")).toBe("100");
    expect(url.searchParams.get("end_time")).toBe("200");
    expect(url.searchParams.get("bucket_width")).toBe("1d");
    expect(url.searchParams.get("batch")).toBe("true");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("page")).toBe("cursor");
  });

  it("expands group_by csv into repeated group_by[]", async () => {
    fetchMock.mockResolvedValue(okResponse({}));
    await GET(req("?group_by=model,project_id"));
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.getAll("group_by[]")).toEqual(["model", "project_id"]);
  });

  it("drops non-whitelisted params", async () => {
    fetchMock.mockResolvedValue(okResponse({}));
    await GET(req("?evil=1&injected=hacker"));
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.has("evil")).toBe(false);
    expect(url.searchParams.has("injected")).toBe(false);
  });

  it("sets Authorization header from env", async () => {
    fetchMock.mockResolvedValue(okResponse({}));
    await GET(req());
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer /);
  });

  it("propagates upstream non-OK status with message", async () => {
    fetchMock.mockResolvedValue(errResponse(429, { error: { message: "rate limited" } }));
    const res = await GET(req());
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate limited" });
  });

  it("falls back to HTTP <status> when no error message", async () => {
    fetchMock.mockResolvedValue(errResponse(502, {}));
    const res = await GET(req());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "HTTP 502" });
  });

  it("handles upstream invalid JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("bad json")),
    } as unknown as Response);
    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("invalid JSON from upstream");
  });

  it("500 when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "network down" });
  });
});
