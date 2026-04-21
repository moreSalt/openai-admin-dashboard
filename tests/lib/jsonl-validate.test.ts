import { describe, expect, it } from "vitest";
import { validateBatchJsonl } from "@/lib/jsonl-validate";

const ENDPOINT = "/v1/chat/completions";

function validLine(id = "req-1") {
  return JSON.stringify({
    custom_id: id,
    method: "POST",
    url: ENDPOINT,
    body: { model: "gpt-4o-mini", messages: [] },
  });
}

describe("validateBatchJsonl", () => {
  it("ok=false on empty input", () => {
    const r = validateBatchJsonl("", ENDPOINT);
    expect(r.ok).toBe(false);
    expect(r.count).toBe(0);
    expect(r.issues).toEqual([]);
  });

  it("ok=true for valid lines", () => {
    const text = [validLine("a"), validLine("b")].join("\n");
    const r = validateBatchJsonl(text, ENDPOINT);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(2);
    expect(r.issues).toEqual([]);
    expect(r.firstError).toBeUndefined();
  });

  it("ignores blank lines for count", () => {
    const text = `\n${validLine()}\n\n${validLine()}\n`;
    const r = validateBatchJsonl(text, ENDPOINT);
    expect(r.count).toBe(2);
    expect(r.ok).toBe(true);
  });

  it("flags malformed JSON", () => {
    const r = validateBatchJsonl("{not json", ENDPOINT);
    expect(r.ok).toBe(false);
    expect(r.firstError?.message).toBe("invalid JSON");
    expect(r.firstError?.line).toBe(1);
  });

  it("flags non-object root (array)", () => {
    const r = validateBatchJsonl("[1,2,3]", ENDPOINT);
    expect(r.firstError?.message).toBe("must be a JSON object");
  });

  it("flags non-object root (null)", () => {
    const r = validateBatchJsonl("null", ENDPOINT);
    expect(r.firstError?.message).toBe("must be a JSON object");
  });

  it("flags missing custom_id", () => {
    const obj = { method: "POST", url: ENDPOINT, body: {} };
    const r = validateBatchJsonl(JSON.stringify(obj), ENDPOINT);
    expect(r.issues.some((i) => i.message === "missing custom_id")).toBe(true);
  });

  it("flags wrong method", () => {
    const obj = { custom_id: "x", method: "GET", url: ENDPOINT, body: {} };
    const r = validateBatchJsonl(JSON.stringify(obj), ENDPOINT);
    expect(r.issues.some((i) => i.message === 'method must be "POST"')).toBe(true);
  });

  it("flags wrong url", () => {
    const obj = { custom_id: "x", method: "POST", url: "/wrong", body: {} };
    const r = validateBatchJsonl(JSON.stringify(obj), ENDPOINT);
    expect(r.issues.some((i) => i.message === `url must be "${ENDPOINT}"`)).toBe(true);
  });

  it("flags missing/invalid body", () => {
    const obj = { custom_id: "x", method: "POST", url: ENDPOINT };
    const r = validateBatchJsonl(JSON.stringify(obj), ENDPOINT);
    expect(r.issues.some((i) => i.message === "missing or invalid body")).toBe(true);
  });

  it("caps issues at 20", () => {
    const lines = Array.from({ length: 50 }, () => "{not json");
    const r = validateBatchJsonl(lines.join("\n"), ENDPOINT);
    expect(r.issues).toHaveLength(20);
  });

  it("firstError is the first issue encountered", () => {
    const text = [validLine(), "{bad", validLine()].join("\n");
    const r = validateBatchJsonl(text, ENDPOINT);
    expect(r.firstError?.line).toBe(2);
  });
});
