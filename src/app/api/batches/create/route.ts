import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export const dynamic = "force-dynamic";

const VALID_ENDPOINTS = new Set([
  "/v1/chat/completions",
  "/v1/embeddings",
  "/v1/completions",
  "/v1/responses",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { input_file_id, endpoint, completion_window = "24h", metadata } = body;

    if (!input_file_id || typeof input_file_id !== "string") {
      return NextResponse.json({ error: "input_file_id required" }, { status: 400 });
    }
    if (!VALID_ENDPOINTS.has(endpoint)) {
      return NextResponse.json({ error: `invalid endpoint: ${endpoint}` }, { status: 400 });
    }

    const client = openai();
    const batch = await client.batches.create({
      input_file_id,
      endpoint: endpoint as "/v1/chat/completions" | "/v1/embeddings" | "/v1/completions",
      completion_window: completion_window as "24h",
      metadata: metadata ?? undefined,
    });

    return NextResponse.json({ batch });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
