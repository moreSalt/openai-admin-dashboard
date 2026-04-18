import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 10000);
    const after = searchParams.get("after") ?? undefined;

    const client = openai();
    const page = await client.files.list({ limit, after });

    const files = page.data;
    const has_more = page.hasNextPage() && files.length > 0;
    const next_cursor = has_more ? files[files.length - 1].id : null;

    return NextResponse.json({ files, has_more, next_cursor });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
