import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders a button by default", () => {
    render(<Button>click me</Button>);
    const btn = screen.getByRole("button", { name: "click me" });
    expect(btn.tagName).toBe("BUTTON");
  });

  it("forwards ref", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>x</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it.each(["primary", "secondary", "danger", "ghost", "outline"] as const)(
    "applies %s variant classes",
    (variant) => {
      render(<Button variant={variant}>v</Button>);
      const btn = screen.getByRole("button");
      expect(btn.className.length).toBeGreaterThan(0);
    },
  );

  it.each(["sm", "md", "lg"] as const)("applies %s size", (size) => {
    render(<Button size={size}>v</Button>);
    expect(screen.getByRole("button").className).toMatch(/h-\d/);
  });

  it("merges className", () => {
    render(<Button className="my-extra">x</Button>);
    expect(screen.getByRole("button").className).toMatch(/my-extra/);
  });

  it("respects disabled", () => {
    render(<Button disabled>x</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>tap</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("asChild renders the child element instead of button", () => {
    render(
      <Button asChild>
        <a href="/foo">link</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "link" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/foo");
  });
});
