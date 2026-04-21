import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cn, formatBytes, formatDate, formatRelative } from "@/lib/utils";

describe("cn", () => {
  it("merges class strings", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("dedupes conflicting tailwind classes (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
  it("handles falsy and nested arrays", () => {
    expect(cn("a", false, null, undefined, ["b", ["c"]])).toBe("a b c");
  });
});

describe("formatBytes", () => {
  it("returns 0 B for zero", () => {
    expect(formatBytes(0)).toBe("0 B");
  });
  it("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });
  it("formats KB with one decimal", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
  it("formats MB", () => {
    expect(formatBytes(1024 * 1024 * 2)).toBe("2.0 MB");
  });
  it("formats GB", () => {
    expect(formatBytes(1024 ** 3 * 3)).toBe("3.0 GB");
  });
  it("formats TB", () => {
    expect(formatBytes(1024 ** 4 * 4)).toBe("4.0 TB");
  });
});

describe("formatDate", () => {
  it("includes year, short month, day, time", () => {
    const ts = Math.floor(new Date("2026-04-20T15:30:00Z").getTime() / 1000);
    const out = formatDate(ts);
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/Apr/);
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("formatRelative", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const now = () => Math.floor(Date.now() / 1000);

  it("seconds bucket", () => {
    expect(formatRelative(now() - 5)).toBe("5s ago");
  });
  it("minutes bucket", () => {
    expect(formatRelative(now() - 120)).toBe("2m ago");
  });
  it("hours bucket", () => {
    expect(formatRelative(now() - 3 * 3600)).toBe("3h ago");
  });
  it("days bucket", () => {
    expect(formatRelative(now() - 5 * 86400)).toBe("5d ago");
  });
  it("0s for now", () => {
    expect(formatRelative(now())).toBe("0s ago");
  });
});
