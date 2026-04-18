import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export const dynamic = "force-dynamic";

type Usage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
};

async function calculateUsage(fileId: string, client: ReturnType<typeof openai>) {
  const usage: Usage = {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
  };

  try {
    const content = await client.files.content(fileId);
    const text = await (content as any).text();
    const lines = text.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        // Batch output JSONL: { response: { body: { usage: ... } } }
        const msgUsage = item.response?.body?.usage ?? item.result?.message?.usage;
        if (msgUsage) {
          usage.input_tokens += msgUsage.input_tokens || 0;
          usage.output_tokens += msgUsage.output_tokens || 0;
          usage.total_tokens += msgUsage.total_tokens || 0;

          if (msgUsage.input_tokens_details?.cached_tokens) {
            usage.input_tokens_details ??= {};
            usage.input_tokens_details.cached_tokens ??= 0;
            usage.input_tokens_details.cached_tokens += msgUsage.input_tokens_details.cached_tokens;
          }

          if (msgUsage.output_tokens_details?.reasoning_tokens) {
            usage.output_tokens_details ??= {};
            usage.output_tokens_details.reasoning_tokens ??= 0;
            usage.output_tokens_details.reasoning_tokens += msgUsage.output_tokens_details.reasoning_tokens;
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
  } catch {
    // If file retrieval fails, return zero usage
  }

  return usage;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const client = openai();
    const batch = await client.batches.retrieve(id);

    let usage: Usage | null = null;
    if (batch.output_file_id) {
      try {
        usage = await calculateUsage(batch.output_file_id, client);
      } catch {
        // If usage calculation fails, continue without it
      }
    }

    return NextResponse.json({ batch: { ...batch, usage } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    const status = msg.includes("No batch found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
