import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/badge";

describe("Badge", () => {
  it("renders children", () => {
    render(<Badge>hello</Badge>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it.each(["neutral", "success", "warn", "danger", "info"] as const)(
    "applies tone class for %s",
    (tone) => {
      const { container } = render(<Badge tone={tone}>x</Badge>);
      const span = container.querySelector("span")!;
      expect(span.className).toMatch(/border/);
      expect(span.className.length).toBeGreaterThan(0);
    },
  );

  it("merges custom className", () => {
    const { container } = render(<Badge className="extra-class">x</Badge>);
    expect(container.querySelector("span")!.className).toMatch(/extra-class/);
  });

  it("defaults to neutral tone", () => {
    const { container: a } = render(<Badge>x</Badge>);
    const { container: b } = render(<Badge tone="neutral">x</Badge>);
    expect(a.querySelector("span")!.className).toBe(b.querySelector("span")!.className);
  });
});
