import { NextResponse } from "next/server";
import { openai, RUNNING_BATCH_STATUSES } from "@/lib/openai";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const client = openai();
    const running: { id: string; status: string }[] = [];
    let after: string | undefined;
    for (let i = 0; i < 20; i++) {
      const page = await client.batches.list({ limit: 500, after });
      for (const b of page.data) {
        if (RUNNING_BATCH_STATUSES.has(b.status)) {
          running.push({ id: b.id, status: b.status });
        }
      }
      if (!page.hasNextPage() || page.data.length === 0) break;
      after = page.data[page.data.length - 1].id;
    }

    const results = await Promise.allSettled(
      running.map((b) => client.batches.cancel(b.id)),
    );

    const cancelled: string[] = [];
    const failed: { id: string; error: string }[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") cancelled.push(running[i].id);
      else
        failed.push({
          id: running[i].id,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
    });

    return NextResponse.json({
      attempted: running.length,
      cancelled,
      failed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
