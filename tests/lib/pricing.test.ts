import { describe, expect, it } from "vitest";
import { estimateCost, type Usage } from "@/lib/pricing";

const usage = (overrides: Partial<Usage> = {}): Usage => ({
  input_tokens: 1_000_000,
  output_tokens: 1_000_000,
  total_tokens: 2_000_000,
  ...overrides,
});

describe("estimateCost", () => {
  it("returns null for unknown model", () => {
    expect(estimateCost(usage(), "totally-made-up-model")).toBeNull();
  });

  it("computes input + output for non-cached model", () => {
    // gpt-4.1: [1.00, null, 4.00] per 1M
    const r = estimateCost(usage(), "gpt-4.1");
    expect(r).not.toBeNull();
    expect(r!.inputCost).toBeCloseTo(1.0, 6);
    expect(r!.outputCost).toBeCloseTo(4.0, 6);
    expect(r!.cachedCost).toBe(0);
    expect(r!.total).toBeCloseTo(5.0, 6);
    expect(r!.hasCachedRate).toBe(false);
  });

  it("uses cached rate when present and tokens are cached", () => {
    // gpt-5: [0.625, 0.0625, 5.00]
    const u = usage({
      input_tokens: 1_000_000,
      input_tokens_details: { cached_tokens: 500_000 },
    });
    const r = estimateCost(u, "gpt-5")!;
    // 500k non-cached @ 0.625/M = 0.3125
    // 500k cached @ 0.0625/M = 0.03125
    expect(r.inputCost).toBeCloseTo(0.3125, 6);
    expect(r.cachedCost).toBeCloseTo(0.03125, 6);
    expect(r.hasCachedRate).toBe(true);
  });

  it("falls back to input rate when cached rate is null", () => {
    // gpt-5-pro: [7.50, null, 60.00]
    const u = usage({
      input_tokens: 1_000_000,
      input_tokens_details: { cached_tokens: 200_000 },
    });
    const r = estimateCost(u, "gpt-5-pro")!;
    // cached 200k @ 7.50/M (fallback) = 1.50
    expect(r.cachedCost).toBeCloseTo(1.5, 6);
    expect(r.hasCachedRate).toBe(false);
  });

  it("matches via prefix for dated/variant model names", () => {
    // gpt-4.1-mini matches "gpt-4.1-mini" prefix (longer wins over gpt-4.1)
    const r = estimateCost(usage(), "gpt-4.1-mini-2026-01-01")!;
    expect(r.inputCost).toBeCloseTo(0.2, 6); // gpt-4.1-mini input rate
    expect(r.outputCost).toBeCloseTo(0.8, 6);
  });

  it("zero tokens → zero cost", () => {
    const r = estimateCost(
      { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      "gpt-4.1",
    )!;
    expect(r.total).toBe(0);
  });

  it("CostBreakdown total = sum of parts", () => {
    const u = usage({
      input_tokens: 800_000,
      output_tokens: 400_000,
      input_tokens_details: { cached_tokens: 300_000 },
    });
    const r = estimateCost(u, "gpt-5-mini")!;
    expect(r.total).toBeCloseTo(r.inputCost + r.cachedCost + r.outputCost, 9);
  });
});
