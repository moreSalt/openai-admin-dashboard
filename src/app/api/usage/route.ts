import { NextRequest, NextResponse } from "next/server";
import { hasAdminKey } from "@/lib/openai";

export const dynamic = "force-dynamic";

const USAGE_PATHS: Record<string, string> = {
  completions: "usage/completions",
  embeddings: "usage/embeddings",
  moderations: "usage/moderations",
  images: "usage/images",
  audio_speeches: "usage/audio_speeches",
  audio_transcriptions: "usage/audio_transcriptions",
  vector_stores: "usage/vector_stores",
  code_interpreter_sessions: "usage/code_interpreter_sessions",
  costs: "costs",
};

const FORWARD = new Set([
  "start_time",
  "end_time",
  "bucket_width",
  "batch",
  "limit",
  "page",
]);

export async function GET(req: NextRequest) {
  if (!hasAdminKey()) {
    return NextResponse.json(
      { error: "OPENAI_ADMIN_KEY not set" },
      { status: 503 },
    );
  }

  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type") ?? "completions";
  const path = USAGE_PATHS[type];
  if (!path) {
    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  }

  const upstream = new URL(`https://api.openai.com/v1/organization/${path}`);

  // default start_time: 7 days ago
  const now = Math.floor(Date.now() / 1000);
  const startTime = searchParams.get("start_time") ?? String(now - 7 * 24 * 60 * 60);
  upstream.searchParams.set("start_time", startTime);

  for (const [k, v] of searchParams.entries()) {
    if (k === "type" || k === "start_time") continue;
    if (!FORWARD.has(k) && k !== "group_by") continue;
    if (k === "group_by") {
      for (const g of v.split(",").map((s) => s.trim()).filter(Boolean)) {
        upstream.searchParams.append("group_by[]", g);
      }
      continue;
    }
    upstream.searchParams.set(k, v);
  }

  try {
    const res = await fetch(upstream.toString(), {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_ADMIN_KEY}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({ error: "invalid JSON from upstream" }));
    if (!res.ok) {
      const message =
        (body && typeof body === "object" && "error" in body && body.error
          ? typeof body.error === "string"
            ? body.error
            : (body.error as { message?: string }).message
          : null) ?? `HTTP ${res.status}`;
      return NextResponse.json({ error: message }, { status: res.status });
    }
    return NextResponse.json(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
