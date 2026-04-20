import type { Usage } from "@/lib/pricing";
import type { ResponseRow } from "@/lib/batch-output-cache";

export type BatchRow = {
  id: string;
  status: string;
  endpoint: string;
  created_at: number;
  completion_window?: string;
  model?: string | null;
  request_counts?: { total?: number; completed?: number; failed?: number };
  input_file_id?: string;
  output_file_id?: string | null;
  error_file_id?: string | null;
  metadata?: Record<string, string> | null;
  usage?: Usage | null;
  [key: string]: unknown;
};

export type FileRow = {
  id: string;
  filename: string;
  bytes: number;
  created_at: number;
  purpose: string;
  status?: string;
  [key: string]: unknown;
};

export type ResponsesCacheInfo = {
  fileId: string;
  rowCount: number | null;
  parsedAt: number | null;
};

export type WorkerRequest =
  | { id: string; kind: "init" }
  | { id: string; kind: "upsertBatches"; batches: BatchRow[] }
  | { id: string; kind: "getBatches" }
  | { id: string; kind: "getBatch"; batchId: string }
  | { id: string; kind: "upsertFiles"; files: FileRow[]; replaceAll?: boolean }
  | { id: string; kind: "getFiles" }
  | {
      id: string;
      kind: "upsertResponses";
      fileId: string;
      batchId: string | null;
      rows: ResponseRow[];
      offset: number;
      total: number;
    }
  | {
      id: string;
      kind: "getResponses";
      fileId: string;
      offset: number;
      limit: number;
    }
  | { id: string; kind: "getResponsesCacheInfo"; fileId: string }
  | { id: string; kind: "getMeta"; key: string }
  | { id: string; kind: "setMeta"; key: string; value: string };

export type WorkerResponse = {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
};
