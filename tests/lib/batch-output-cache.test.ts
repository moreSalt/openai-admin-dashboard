import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseLines } from "@/lib/batch-output-cache";
import type OpenAI from "openai";

function makeLine(opts: {
  custom_id?: string;
  status_code?: number;
  body?: Record<string, unknown>;
  error?: unknown;
}) {
  return JSON.stringify({
    custom_id: opts.custom_id ?? "req-1",
    response: opts.body
      ? { status_code: opts.status_code ?? 200, body: opts.body }
      : undefined,
    error: opts.error ?? null,
  });
}

function bodyWithUsage(extras: Record<string, unknown> = {}) {
  return {
    id: "resp_1",
    model: "gpt-4o-mini",
    created_at: 1000,
    completed_at: 1010,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      input_tokens_details: { cached_tokens: 20 },
      output_tokens_details: { reasoning_tokens: 10 },
    },
    output: [
      {
        content: [
          { type: "output_text", text: "hello" },
          { type: "output_text", text: "world" },
        ],
      },
    ],
    text: { format: { type: "text", name: "default" } },
    reasoning: { effort: "medium" },
    ...extras,
  };
}

describe("parseLines", () => {
  it("returns empty for empty input", () => {
    const r = parseLines("");
    expect(r.rows).toEqual([]);
    expect(r.usage).toEqual({ input_tokens: 0, output_tokens: 0, total_tokens: 0 });
  });

  it("parses a single row with full fields", () => {
    const line = makeLine({ body: bodyWithUsage() });
    const r = parseLines(line);
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0];
    expect(row.custom_id).toBe("req-1");
    expect(row.status_code).toBe(200);
    expect(row.id).toBe("resp_1");
    expect(row.model).toBe("gpt-4o-mini");
    expect(row.created_at).toBe(1000);
    expect(row.completed_at).toBe(1010);
    expect(row.duration_s).toBe(10);
    expect(row.usage).toEqual({
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      cached_tokens: 20,
      reasoning_tokens: 10,
    });
    expect(row.format_type).toBe("text");
    expect(row.format_name).toBe("default");
    expect(row.reasoning_effort).toBe("medium");
    expect(row.output_text).toBe("hello\n\nworld");
    expect(row.error).toBeNull();
  });

  it("skips malformed lines", () => {
    const text = [makeLine({ body: bodyWithUsage() }), "{not json", makeLine({ body: bodyWithUsage() })].join("\n");
    const r = parseLines(text);
    expect(r.rows).toHaveLength(2);
  });

  it("aggregates usage across rows including cached + reasoning", () => {
    const text = [
      makeLine({ body: bodyWithUsage() }),
      makeLine({ body: bodyWithUsage() }),
    ].join("\n");
    const r = parseLines(text);
    expect(r.usage.input_tokens).toBe(200);
    expect(r.usage.output_tokens).toBe(100);
    expect(r.usage.total_tokens).toBe(300);
    expect(r.usage.input_tokens_details?.cached_tokens).toBe(40);
    expect(r.usage.output_tokens_details?.reasoning_tokens).toBe(20);
  });

  it("captures refusals in output_text", () => {
    const body = {
      ...bodyWithUsage(),
      output: [{ content: [{ type: "refusal", refusal: "no can do" }] }],
    };
    const r = parseLines(makeLine({ body }));
    expect(r.rows[0].output_text).toBe("[refusal] no can do");
  });

  it("handles missing usage", () => {
    const body = { id: "x", model: "m" };
    const r = parseLines(makeLine({ body }));
    expect(r.rows[0].usage).toBeNull();
    expect(r.usage.input_tokens).toBe(0);
  });

  it("duration_s is null when timestamps missing", () => {
    const body = { id: "x", model: "m", usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
    const r = parseLines(makeLine({ body }));
    expect(r.rows[0].duration_s).toBeNull();
  });

  it("captures top-level error", () => {
    const r = parseLines(makeLine({ error: { code: "boom" } }));
    expect(r.rows[0].error).toEqual({ code: "boom" });
  });
});

describe("getOutputData", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  function makeClient(text: string) {
    const content = vi.fn().mockResolvedValue({ text: () => Promise.resolve(text) });
    return {
      client: { files: { content } } as unknown as OpenAI,
      content,
    };
  }

  it("fetches once then returns cached on second call", async () => {
    // fresh module so cache is empty
    vi.resetModules();
    const { getOutputData: fresh } = await import("@/lib/batch-output-cache");
    const text = makeLine({ body: bodyWithUsage() });
    const { client, content } = makeClient(text);

    const a = await fresh("file_1", client);
    const b = await fresh("file_1", client);
    expect(content).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("re-fetches after TTL expires", async () => {
    vi.resetModules();
    const { getOutputData: fresh } = await import("@/lib/batch-output-cache");
    const text = makeLine({ body: bodyWithUsage() });
    const { client, content } = makeClient(text);

    await fresh("file_ttl", client);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await fresh("file_ttl", client);
    expect(content).toHaveBeenCalledTimes(2);
  });

  it("parses fetched text into rows", async () => {
    vi.resetModules();
    const { getOutputData: fresh } = await import("@/lib/batch-output-cache");
    const text = makeLine({ body: bodyWithUsage() });
    const { client } = makeClient(text);
    const r = await fresh("file_parse", client);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].id).toBe("resp_1");
  });
});
