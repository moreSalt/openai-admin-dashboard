import type OpenAI from "openai";

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

export type AggregatedUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
};

export type ParsedOutput = {
  rows: ResponseRow[];
  usage: AggregatedUsage;
};

const TTL = 5 * 60 * 1000;
const MAX_ENTRIES = 20;

const cache = new Map<string, { data: ParsedOutput; ts: number }>();

function evictStale() {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now - v.ts > TTL) cache.delete(k);
  }
  if (cache.size >= MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

function parseOutputText(body: Record<string, unknown>): string | null {
  const output = body?.output;
  if (!Array.isArray(output)) return null;
  const parts: string[] = [];
  for (const item of output as Record<string, unknown>[]) {
    if (!Array.isArray(item?.content)) continue;
    for (const c of item.content as Record<string, unknown>[]) {
      if (c?.type === "output_text" && typeof c.text === "string") parts.push(c.text as string);
      if (c?.type === "refusal" && typeof c.refusal === "string") parts.push(`[refusal] ${c.refusal as string}`);
    }
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

export function parseLines(text: string): ParsedOutput {
  const rows: ResponseRow[] = [];
  const agg: AggregatedUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      const body: Record<string, unknown> = item.response?.body ?? {};
      const statusCode: number | null = item.response?.status_code ?? null;
      const usage = (body?.usage as Record<string, unknown>) ?? null;
      const format = (body?.text as Record<string, unknown>)?.format as Record<string, unknown> ?? null;
      const createdAt: number | null = (body?.created_at as number) ?? null;
      const completedAt: number | null = (body?.completed_at as number) ?? null;

      if (usage) {
        agg.input_tokens += (usage.input_tokens as number) || 0;
        agg.output_tokens += (usage.output_tokens as number) || 0;
        agg.total_tokens += (usage.total_tokens as number) || 0;

        const cached = ((usage.input_tokens_details as Record<string, unknown>)?.cached_tokens as number) || 0;
        if (cached) {
          agg.input_tokens_details ??= {};
          agg.input_tokens_details.cached_tokens = (agg.input_tokens_details.cached_tokens ?? 0) + cached;
        }

        const reasoning = ((usage.output_tokens_details as Record<string, unknown>)?.reasoning_tokens as number) || 0;
        if (reasoning) {
          agg.output_tokens_details ??= {};
          agg.output_tokens_details.reasoning_tokens = (agg.output_tokens_details.reasoning_tokens ?? 0) + reasoning;
        }
      }

      rows.push({
        custom_id: item.custom_id ?? null,
        status_code: statusCode,
        id: (body?.id as string) ?? null,
        model: (body?.model as string) ?? null,
        created_at: createdAt,
        completed_at: completedAt,
        duration_s: createdAt != null && completedAt != null ? completedAt - createdAt : null,
        usage: usage
          ? {
              input_tokens: (usage.input_tokens as number) ?? 0,
              output_tokens: (usage.output_tokens as number) ?? 0,
              total_tokens: (usage.total_tokens as number) ?? 0,
              cached_tokens: ((usage.input_tokens_details as Record<string, unknown>)?.cached_tokens as number) ?? 0,
              reasoning_tokens: ((usage.output_tokens_details as Record<string, unknown>)?.reasoning_tokens as number) ?? 0,
            }
          : null,
        format_type: (format?.type as string) ?? null,
        format_name: (format?.name as string) ?? null,
        reasoning_effort: ((body?.reasoning as Record<string, unknown>)?.effort as string) ?? null,
        output_text: parseOutputText(body),
        raw_body: Object.keys(body).length > 0 ? body : null,
        error: item.error ?? null,
      });
    } catch {
      // skip invalid lines
    }
  }

  return { rows, usage: agg };
}

export async function getOutputData(
  fileId: string,
  client: OpenAI,
): Promise<ParsedOutput> {
  const cached = cache.get(fileId);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  const content = await client.files.content(fileId);
  const text = await (content as unknown as { text(): Promise<string> }).text();
  const data = parseLines(text);

  evictStale();
  cache.set(fileId, { data, ts: Date.now() });
  return data;
}
