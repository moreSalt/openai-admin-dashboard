import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = openai();
    const all: Record<string, unknown>[] = [];
    let after: string | undefined;
    for (let i = 0; i < 20; i++) {
      const page = await client.files.list({ limit: 10000, after });
      for (const f of page.data) all.push(f as unknown as Record<string, unknown>);
      if (!page.hasNextPage() || page.data.length === 0) break;
      after = page.data[page.data.length - 1].id;
    }
    return NextResponse.json({ files: all });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
