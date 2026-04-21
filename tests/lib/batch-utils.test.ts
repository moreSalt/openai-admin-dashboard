import { describe, expect, it } from "vitest";
import { statusTone } from "@/lib/batch-utils";

describe("statusTone", () => {
  it.each([
    ["completed", "success"],
    ["failed", "danger"],
    ["expired", "danger"],
    ["cancelled", "danger"],
    ["cancelling", "warn"],
    ["validating", "info"],
    ["in_progress", "info"],
    ["finalizing", "info"],
    ["unknown_status", "neutral"],
    ["", "neutral"],
  ] as const)("%s → %s", (status, tone) => {
    expect(statusTone(status)).toBe(tone);
  });
});
