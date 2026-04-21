import { beforeEach, describe, expect, it, vi } from "vitest";

const batchesCreate = vi.fn();

vi.mock("@/lib/openai", () => ({
  openai: () => ({ batches: { create: batchesCreate } }),
  hasAdminKey: () => true,
}));

import { POST } from "@/app/api/batches/create/route";
import { NextRequest } from "next/server";

function req(body: unknown) {
  return new NextRequest(new URL("http://localhost/api/batches/create"), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/batches/create", () => {
  beforeEach(() => {
    batchesCreate.mockReset();
  });

  it("400 on missing input_file_id", async () => {
    const res = await POST(req({ endpoint: "/v1/chat/completions" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "input_file_id required" });
    expect(batchesCreate).not.toHaveBeenCalled();
  });

  it("400 on invalid endpoint", async () => {
    const res = await POST(req({ input_file_id: "f_1", endpoint: "/bad" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid endpoint/);
  });

  it("forwards args to SDK and returns batch", async () => {
    batchesCreate.mockResolvedValue({ id: "batch_123", status: "validating" });
    const res = await POST(
      req({
        input_file_id: "f_1",
        endpoint: "/v1/chat/completions",
        completion_window: "24h",
        metadata: { tag: "x" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ batch: { id: "batch_123", status: "validating" } });
    expect(batchesCreate).toHaveBeenCalledWith({
      input_file_id: "f_1",
      endpoint: "/v1/chat/completions",
      completion_window: "24h",
      metadata: { tag: "x" },
    });
  });

  it("500 on SDK throw", async () => {
    batchesCreate.mockRejectedValue(new Error("upstream boom"));
    const res = await POST(
      req({ input_file_id: "f_1", endpoint: "/v1/chat/completions" }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "upstream boom" });
  });
});
