import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { getOutputData } from "@/lib/batch-output-cache";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const client = openai();
    const batch = await client.batches.retrieve(id);

    // Use the API's native usage if present; otherwise aggregate from output file.
    let usage = (batch as unknown as Record<string, unknown>).usage ?? null;
    if (!usage && batch.output_file_id) {
      try {
        const parsed = await getOutputData(batch.output_file_id, client);
        if (parsed.usage.total_tokens > 0) usage = parsed.usage;
      } catch {
        // continue without usage
      }
    }

    return NextResponse.json({ batch: { ...batch, usage } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    const status = msg.includes("No batch found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
