import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { getOutputData, type ResponseRow } from "@/lib/batch-output-cache";

export type { ResponseRow };

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50"), 1), 200);
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0"), 0);

    const client = openai();
    const batch = await client.batches.retrieve(id);

    if (!batch.output_file_id) {
      return NextResponse.json({ responses: [], total: 0 });
    }

    let rows;
    try {
      ({ rows } = await getOutputData(batch.output_file_id, client));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("404") || msg.toLowerCase().includes("no such file")) {
        return NextResponse.json({ responses: [], total: 0, expired: true });
      }
      throw err;
    }
    const total = rows.length;
    const page = rows.slice(offset, offset + limit);

    return NextResponse.json({ responses: page, total });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
