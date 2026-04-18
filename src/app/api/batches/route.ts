import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const limit = Math.min(Number(searchParams.get("limit") ?? 500), 500);
    const after = searchParams.get("after") ?? undefined;

    const client = openai();
    const page = await client.batches.list({ limit, after });

    return NextResponse.json({
      batches: page.data,
      has_more: page.hasNextPage(),
      next_cursor: page.data.length > 0 ? page.data[page.data.length - 1].id : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
