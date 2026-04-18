import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });
    }

    const url = new URL(req.url);
    const qs = new URLSearchParams();
    const after = url.searchParams.get("after");
    if (after) qs.set("after", after);
    qs.set("limit", url.searchParams.get("limit") ?? "100");

    const res = await fetch(
      `https://api.openai.com/v1/responses/${id}/input_items?${qs}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "openai-beta": "responses=v1",
        },
      },
    );

    const body = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: body.error?.message ?? `HTTP ${res.status}` },
        { status: res.status },
      );
    }

    return NextResponse.json(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
