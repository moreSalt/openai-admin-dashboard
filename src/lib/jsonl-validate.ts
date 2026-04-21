export type JsonlIssue = { line: number; message: string };
export type JsonlValidation = {
  ok: boolean;
  count: number;
  issues: JsonlIssue[];
  firstError?: JsonlIssue;
};

export function validateBatchJsonl(text: string, endpoint: string): JsonlValidation {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const issues: JsonlIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    let obj: unknown;
    try {
      obj = JSON.parse(lines[i]);
    } catch {
      issues.push({ line: lineNum, message: "invalid JSON" });
      if (issues.length >= 20) break;
      continue;
    }
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      issues.push({ line: lineNum, message: "must be a JSON object" });
      if (issues.length >= 20) break;
      continue;
    }
    const o = obj as Record<string, unknown>;
    if (!o.custom_id || typeof o.custom_id !== "string") {
      issues.push({ line: lineNum, message: "missing custom_id" });
    }
    if (o.method !== "POST") {
      issues.push({ line: lineNum, message: 'method must be "POST"' });
    }
    if (o.url !== endpoint) {
      issues.push({ line: lineNum, message: `url must be "${endpoint}"` });
    }
    if (!o.body || typeof o.body !== "object" || Array.isArray(o.body)) {
      issues.push({ line: lineNum, message: "missing or invalid body" });
    }
    if (issues.length >= 20) break;
  }

  return {
    ok: issues.length === 0 && lines.length > 0,
    count: lines.length,
    issues,
    firstError: issues[0],
  };
}
