import { NextRequest, NextResponse } from "next/server";
import { openai, RESTARTABLE_BATCH_STATUSES } from "@/lib/openai";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { ids }: { ids: string[] } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }

    const client = openai();
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const original = await client.batches.retrieve(id);
        if (!RESTARTABLE_BATCH_STATUSES.has(original.status)) {
          throw new Error(`Batch is not in a restartable state (${original.status})`);
        }
        const newBatch = await client.batches.create({
          input_file_id: original.input_file_id,
          endpoint: original.endpoint as "/v1/chat/completions" | "/v1/embeddings" | "/v1/completions",
          completion_window: original.completion_window as "24h",
          metadata: original.metadata ?? undefined,
        });
        return { id, newId: newBatch.id };
      })
    );

    const restarted: { id: string; newId: string }[] = [];
    const failed: { id: string; error: string }[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") restarted.push(r.value);
      else
        failed.push({
          id: ids[i],
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
    });

    return NextResponse.json({ restarted, failed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
