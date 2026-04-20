/// <reference lib="webworker" />
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { WorkerRequest, WorkerResponse, BatchRow, FileRow } from "./types";
import type { ResponseRow } from "@/lib/batch-output-cache";

type ExecOpts = {
  sql: string;
  bind?: unknown[] | Record<string, unknown>;
  rowMode?: "object" | "array";
  returnValue?: "resultRows" | "this";
  resultRows?: unknown[];
};

type DB = {
  exec(opts: ExecOpts | string): unknown;
  selectValue(sql: string, bind?: unknown[]): unknown;
  selectObject(sql: string, bind?: unknown[]): Record<string, unknown> | undefined;
  selectObjects(sql: string, bind?: unknown[]): Record<string, unknown>[];
};

function tx<T>(d: DB, fn: () => T): T {
  d.exec("BEGIN");
  try {
    const result = fn();
    d.exec("COMMIT");
    return result;
  } catch (err) {
    try { d.exec("ROLLBACK"); } catch {}
    throw err;
  }
}

let dbPromise: Promise<DB> | null = null;
const MAX_OUTPUT_FILES = 20;

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  endpoint TEXT,
  model TEXT,
  created_at INTEGER NOT NULL,
  output_file_id TEXT,
  error_file_id TEXT,
  input_file_id TEXT,
  completion_window TEXT,
  request_counts_json TEXT,
  metadata_json TEXT,
  usage_json TEXT,
  raw_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_batches_created_at ON batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);

CREATE TABLE IF NOT EXISTS batch_responses (
  output_file_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  custom_id TEXT,
  status_code INTEGER,
  response_id TEXT,
  model TEXT,
  created_at INTEGER,
  completed_at INTEGER,
  duration_s REAL,
  output_text TEXT,
  format_type TEXT,
  format_name TEXT,
  reasoning_effort TEXT,
  usage_json TEXT,
  raw_json TEXT NOT NULL,
  error_json TEXT,
  PRIMARY KEY (output_file_id, idx)
);

CREATE TABLE IF NOT EXISTS output_files (
  file_id TEXT PRIMARY KEY,
  batch_id TEXT,
  row_count INTEGER,
  parsed_at INTEGER NOT NULL,
  last_accessed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  purpose TEXT,
  bytes INTEGER,
  created_at INTEGER,
  filename TEXT,
  status TEXT,
  raw_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

async function openDb(): Promise<DB> {
  const init = sqlite3InitModule as unknown as (
    cfg?: {
      locateFile?: (path: string) => string;
      print?: (msg: unknown) => void;
      printErr?: (msg: unknown) => void;
    },
  ) => Promise<unknown>;
  const sqlite3 = await init({
    locateFile: (path: string) => `/sqlite-wasm/${path}`,
    print: () => {},
    printErr: (msg: unknown) => console.error("[sqlite]", msg),
  });

  const sqlite3Any = sqlite3 as unknown as {
    installOpfsSAHPoolVfs?: (cfg: { name: string }) => Promise<{
      OpfsSAHPoolDb: new (path: string) => DB;
    }>;
    oo1: {
      DB: new (path: string, flags?: string) => DB;
      OpfsDb?: new (path: string) => DB;
    };
  };

  let db: DB;
  if (sqlite3Any.installOpfsSAHPoolVfs) {
    try {
      const pool = await sqlite3Any.installOpfsSAHPoolVfs({ name: "batchdash-db" });
      db = new pool.OpfsSAHPoolDb("/batchdash.sqlite3");
    } catch (err) {
      console.warn("[sqlite] OPFS-SAH unavailable, falling back to memory DB", err);
      db = new sqlite3Any.oo1.DB(":memory:", "c");
    }
  } else {
    db = new sqlite3Any.oo1.DB(":memory:", "c");
  }

  const version = Number(db.selectValue("PRAGMA user_version") ?? 0);
  if (version < 1) {
    db.exec({ sql: SCHEMA_V1 });
    db.exec({ sql: "PRAGMA user_version = 1" });
  }

  return db;
}

function db(): Promise<DB> {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

function rowToBatch(r: Record<string, unknown>): BatchRow {
  const raw = JSON.parse(r.raw_json as string) as BatchRow;
  return raw;
}

function rowToFile(r: Record<string, unknown>): FileRow {
  return JSON.parse(r.raw_json as string) as FileRow;
}

function rowToResponse(r: Record<string, unknown>): ResponseRow {
  return {
    custom_id: (r.custom_id as string) ?? null,
    status_code: (r.status_code as number) ?? null,
    id: (r.response_id as string) ?? null,
    model: (r.model as string) ?? null,
    created_at: (r.created_at as number) ?? null,
    completed_at: (r.completed_at as number) ?? null,
    duration_s: (r.duration_s as number) ?? null,
    usage: r.usage_json ? JSON.parse(r.usage_json as string) : null,
    format_type: (r.format_type as string) ?? null,
    format_name: (r.format_name as string) ?? null,
    reasoning_effort: (r.reasoning_effort as string) ?? null,
    output_text: (r.output_text as string) ?? null,
    raw_body: r.raw_json ? JSON.parse(r.raw_json as string) : null,
    error: r.error_json ? JSON.parse(r.error_json as string) : null,
  };
}

async function handle(msg: WorkerRequest): Promise<unknown> {
  const d = await db();
  const now = Date.now();

  switch (msg.kind) {
    case "init":
      return { ready: true };

    case "upsertBatches": {
      tx(d, () => {
        for (const b of msg.batches) {
          d.exec({
            sql: `INSERT INTO batches
              (id, status, endpoint, model, created_at, output_file_id, error_file_id,
               input_file_id, completion_window, request_counts_json, metadata_json,
               usage_json, raw_json, fetched_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET
                status=excluded.status,
                endpoint=excluded.endpoint,
                model=excluded.model,
                output_file_id=excluded.output_file_id,
                error_file_id=excluded.error_file_id,
                input_file_id=excluded.input_file_id,
                completion_window=excluded.completion_window,
                request_counts_json=excluded.request_counts_json,
                metadata_json=excluded.metadata_json,
                usage_json=excluded.usage_json,
                raw_json=excluded.raw_json,
                fetched_at=excluded.fetched_at`,
            bind: [
              b.id,
              b.status,
              b.endpoint ?? null,
              b.model ?? null,
              b.created_at,
              b.output_file_id ?? null,
              b.error_file_id ?? null,
              b.input_file_id ?? null,
              b.completion_window ?? null,
              b.request_counts ? JSON.stringify(b.request_counts) : null,
              b.metadata ? JSON.stringify(b.metadata) : null,
              b.usage ? JSON.stringify(b.usage) : null,
              JSON.stringify(b),
              now,
            ],
          });
        }
      });
      return { count: msg.batches.length };
    }

    case "getBatches": {
      const rows = d.selectObjects(
        "SELECT raw_json FROM batches ORDER BY created_at DESC",
      );
      return rows.map(rowToBatch);
    }

    case "getBatch": {
      const row = d.selectObject(
        "SELECT raw_json FROM batches WHERE id = ?",
        [msg.batchId],
      );
      return row ? rowToBatch(row) : null;
    }

    case "upsertFiles": {
      tx(d, () => {
        if (msg.replaceAll) d.exec({ sql: "DELETE FROM files" });
        for (const f of msg.files) {
          d.exec({
            sql: `INSERT INTO files
              (id, purpose, bytes, created_at, filename, status, raw_json, fetched_at)
              VALUES (?,?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET
                purpose=excluded.purpose,
                bytes=excluded.bytes,
                filename=excluded.filename,
                status=excluded.status,
                raw_json=excluded.raw_json,
                fetched_at=excluded.fetched_at`,
            bind: [
              f.id,
              f.purpose ?? null,
              f.bytes ?? 0,
              f.created_at ?? 0,
              f.filename ?? null,
              f.status ?? null,
              JSON.stringify(f),
              now,
            ],
          });
        }
      });
      return { count: msg.files.length };
    }

    case "getFiles": {
      const rows = d.selectObjects(
        "SELECT raw_json FROM files ORDER BY created_at DESC",
      );
      return rows.map(rowToFile);
    }

    case "upsertResponses": {
      tx(d, () => {
        for (let i = 0; i < msg.rows.length; i++) {
          const r = msg.rows[i];
          const idx = msg.offset + i;
          d.exec({
            sql: `INSERT INTO batch_responses
              (output_file_id, idx, custom_id, status_code, response_id, model,
               created_at, completed_at, duration_s, output_text, format_type,
               format_name, reasoning_effort, usage_json, raw_json, error_json)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(output_file_id, idx) DO UPDATE SET
                custom_id=excluded.custom_id,
                status_code=excluded.status_code,
                response_id=excluded.response_id,
                model=excluded.model,
                created_at=excluded.created_at,
                completed_at=excluded.completed_at,
                duration_s=excluded.duration_s,
                output_text=excluded.output_text,
                format_type=excluded.format_type,
                format_name=excluded.format_name,
                reasoning_effort=excluded.reasoning_effort,
                usage_json=excluded.usage_json,
                raw_json=excluded.raw_json,
                error_json=excluded.error_json`,
            bind: [
              msg.fileId,
              idx,
              r.custom_id,
              r.status_code,
              r.id,
              r.model,
              r.created_at,
              r.completed_at,
              r.duration_s,
              r.output_text,
              r.format_type,
              r.format_name,
              r.reasoning_effort,
              r.usage ? JSON.stringify(r.usage) : null,
              r.raw_body ? JSON.stringify(r.raw_body) : "{}",
              r.error ? JSON.stringify(r.error) : null,
            ],
          });
        }
        d.exec({
          sql: `INSERT INTO output_files (file_id, batch_id, row_count, parsed_at, last_accessed_at)
            VALUES (?,?,?,?,?)
            ON CONFLICT(file_id) DO UPDATE SET
              batch_id=COALESCE(excluded.batch_id, output_files.batch_id),
              row_count=excluded.row_count,
              parsed_at=excluded.parsed_at,
              last_accessed_at=excluded.last_accessed_at`,
          bind: [msg.fileId, msg.batchId, msg.total, now, now],
        });

        const count = Number(d.selectValue("SELECT COUNT(*) FROM output_files") ?? 0);
        if (count > MAX_OUTPUT_FILES) {
          const toDrop = d.selectObjects(
            "SELECT file_id FROM output_files ORDER BY last_accessed_at ASC LIMIT ?",
            [count - MAX_OUTPUT_FILES],
          );
          for (const row of toDrop) {
            const fid = row.file_id as string;
            d.exec({
              sql: "DELETE FROM batch_responses WHERE output_file_id = ?",
              bind: [fid],
            });
            d.exec({ sql: "DELETE FROM output_files WHERE file_id = ?", bind: [fid] });
          }
        }
      });
      return { count: msg.rows.length };
    }

    case "getResponses": {
      d.exec({
        sql: "UPDATE output_files SET last_accessed_at = ? WHERE file_id = ?",
        bind: [now, msg.fileId],
      });
      const rows = d.selectObjects(
        `SELECT * FROM batch_responses WHERE output_file_id = ?
         ORDER BY idx ASC LIMIT ? OFFSET ?`,
        [msg.fileId, msg.limit, msg.offset],
      );
      return rows.map(rowToResponse);
    }

    case "getResponsesCacheInfo": {
      const row = d.selectObject(
        "SELECT row_count, parsed_at FROM output_files WHERE file_id = ?",
        [msg.fileId],
      );
      if (!row) return { fileId: msg.fileId, rowCount: null, parsedAt: null };
      return {
        fileId: msg.fileId,
        rowCount: (row.row_count as number) ?? null,
        parsedAt: (row.parsed_at as number) ?? null,
      };
    }

    case "getMeta": {
      const row = d.selectObject("SELECT value FROM meta WHERE key = ?", [msg.key]);
      return row ? (row.value as string) : null;
    }

    case "setMeta": {
      d.exec({
        sql: `INSERT INTO meta (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        bind: [msg.key, msg.value],
      });
      return { ok: true };
    }
  }
}

self.addEventListener("message", async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  const reply: WorkerResponse = { id: msg.id, ok: true };
  try {
    reply.data = await handle(msg);
  } catch (err) {
    reply.ok = false;
    reply.error = err instanceof Error ? err.message : String(err);
  }
  (self as unknown as Worker).postMessage(reply);
});
