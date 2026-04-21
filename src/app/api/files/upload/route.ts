import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    const purpose = (form.get("purpose") as string | null) ?? "batch";
    const client = openai();
    const uploaded = await client.files.create({ file, purpose: purpose as "batch" });
    return NextResponse.json({ file: uploaded });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
