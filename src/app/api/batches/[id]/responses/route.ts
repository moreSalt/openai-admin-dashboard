import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export const dynamic = "force-dynamic";

export type ResponseRow = {
  custom_id: string | null;
  status_code: number | null;
  id: string | null;
  model: string | null;
  created_at: number | null;
  completed_at: number | null;
  duration_s: number | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cached_tokens: number;
    reasoning_tokens: number;
  } | null;
  format_type: string | null;
  format_name: string | null;
  reasoning_effort: string | null;
  output_text: string | null;
  raw_body: Record<string, unknown> | null;
  error: unknown;
};

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

    const content = await client.files.content(batch.output_file_id);
    const text = await (content as unknown as { text(): Promise<string> }).text();
    const lines = text.split("\n").filter((l) => l.trim());

    const rows: ResponseRow[] = [];
    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        const body = item.response?.body;
        const statusCode: number | null = item.response?.status_code ?? null;
        const usage = body?.usage ?? null;
        const format = body?.text?.format ?? null;
        const createdAt: number | null = body?.created_at ?? null;
        const completedAt: number | null = body?.completed_at ?? null;

        // Extract text from output items
        const outputText: string | null = (() => {
          const output = body?.output;
          if (!Array.isArray(output)) return null;
          const parts: string[] = [];
          for (const item of output) {
            if (!Array.isArray(item?.content)) continue;
            for (const c of item.content) {
              if (c?.type === "output_text" && typeof c.text === "string") parts.push(c.text);
              if (c?.type === "refusal" && typeof c.refusal === "string") parts.push(`[refusal] ${c.refusal}`);
            }
          }
          return parts.length > 0 ? parts.join("\n\n") : null;
        })();

        rows.push({
          custom_id: item.custom_id ?? null,
          status_code: statusCode,
          id: body?.id ?? null,
          model: body?.model ?? null,
          created_at: createdAt,
          completed_at: completedAt,
          duration_s: createdAt != null && completedAt != null ? completedAt - createdAt : null,
          usage: usage
            ? {
                input_tokens: usage.input_tokens ?? 0,
                output_tokens: usage.output_tokens ?? 0,
                total_tokens: usage.total_tokens ?? 0,
                cached_tokens: usage.input_tokens_details?.cached_tokens ?? 0,
                reasoning_tokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
              }
            : null,
          format_type: format?.type ?? null,
          format_name: format?.name ?? null,
          reasoning_effort: body?.reasoning?.effort ?? null,
          output_text: outputText,
          raw_body: body ?? null,
          error: item.error ?? null,
        });
      } catch {
        // skip invalid lines
      }
    }

    const total = rows.length;
    const page = rows.slice(offset, offset + limit);

    return NextResponse.json({ responses: page, total });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
