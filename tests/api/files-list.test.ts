import { beforeEach, describe, expect, it, vi } from "vitest";

const filesList = vi.fn();

vi.mock("@/lib/openai", () => ({
  openai: () => ({ files: { list: filesList } }),
  hasAdminKey: () => true,
}));

import { GET } from "@/app/api/files/route";
import { NextRequest } from "next/server";

function req(query = "") {
  return new NextRequest(new URL(`http://localhost/api/files${query}`));
}

describe("GET /api/files", () => {
  beforeEach(() => {
    filesList.mockReset();
  });

  it("default limit 100, no purpose, no after", async () => {
    filesList.mockResolvedValue({ data: [], hasNextPage: () => false });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(filesList).toHaveBeenCalledWith({
      limit: 100,
      after: undefined,
      purpose: undefined,
    });
    const json = await res.json();
    expect(json.has_more).toBe(false);
    expect(json.next_cursor).toBeNull();
  });

  it("clamps limit to 10000", async () => {
    filesList.mockResolvedValue({ data: [], hasNextPage: () => false });
    await GET(req("?limit=99999"));
    expect(filesList).toHaveBeenCalledWith({
      limit: 10000,
      after: undefined,
      purpose: undefined,
    });
  });

  it("forwards purpose and after", async () => {
    filesList.mockResolvedValue({ data: [], hasNextPage: () => false });
    await GET(req("?after=cursor_x&purpose=batch"));
    expect(filesList).toHaveBeenCalledWith({
      limit: 100,
      after: "cursor_x",
      purpose: "batch",
    });
  });

  it("derives next_cursor from last file when hasNextPage and data non-empty", async () => {
    filesList.mockResolvedValue({
      data: [{ id: "f_1" }, { id: "f_2" }],
      hasNextPage: () => true,
    });
    const res = await GET(req());
    const json = await res.json();
    expect(json.has_more).toBe(true);
    expect(json.next_cursor).toBe("f_2");
  });

  it("has_more=false when data empty even if hasNextPage true", async () => {
    filesList.mockResolvedValue({ data: [], hasNextPage: () => true });
    const res = await GET(req());
    const json = await res.json();
    expect(json.has_more).toBe(false);
    expect(json.next_cursor).toBeNull();
  });

  it("500 on SDK throw", async () => {
    filesList.mockRejectedValue(new Error("nope"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "nope" });
  });
});
