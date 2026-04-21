import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContentRenderer } from "@/components/content-renderer";

describe("ContentRenderer", () => {
  it("pretty-prints JSON object content", () => {
    const obj = { foo: 1, bar: [2, 3] };
    render(<ContentRenderer content={JSON.stringify(obj)} />);
    const pre = document.querySelector("pre")!;
    expect(pre.textContent).toContain('"foo": 1');
    expect(pre.textContent).toContain('"bar"');
  });

  it("pretty-prints JSON array content", () => {
    render(<ContentRenderer content="[1, 2, 3]" />);
    const pre = document.querySelector("pre")!;
    expect(pre.textContent).toContain("[\n  1,\n  2,\n  3\n]");
  });

  it("renders markdown for plain text", () => {
    render(<ContentRenderer content="**bold** text" />);
    expect(document.querySelector("strong")?.textContent).toBe("bold");
  });

  it("falls back to markdown when JSON-looking text fails to parse", () => {
    render(<ContentRenderer content="{not really json" />);
    // since parse fails and trimmed starts with { not [, isJson returns ok:false → markdown branch
    expect(document.querySelector(".prose-response")).toBeTruthy();
  });

  it("toggle button switches to raw view", async () => {
    render(<ContentRenderer content='{"a":1}' />);
    const btn = screen.getByRole("button");
    expect(btn.textContent).toBe("raw");

    await userEvent.click(btn);
    expect(btn.textContent).toBe("rendered");
    const pre = document.querySelector("pre")!;
    expect(pre.textContent).toBe('{"a":1}');
  });
});
