import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { ids }: { ids: string[] } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }

    const client = openai();
    const results = await Promise.allSettled(ids.map((id) => client.batches.cancel(id)));

    const cancelled: string[] = [];
    const failed: { id: string; error: string }[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") cancelled.push(ids[i]);
      else
        failed.push({
          id: ids[i],
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
    });

    return NextResponse.json({ cancelled, failed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
